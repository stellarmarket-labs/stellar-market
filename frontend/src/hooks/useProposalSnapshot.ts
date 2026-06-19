"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSocket } from "@/context/SocketContext";
import type { MilestoneSnapshot, ProposalSnapshot } from "@/utils/proposalDiff";

interface SnapshotAwareness {
  jobId: string;
  userId: string;
  lastAcceptedSnapshot: MilestoneSnapshot[] | null;
  acceptedAt: number;
}

/**
 * Hook for managing proposal snapshots with Yjs awareness synchronization.
 * 
 * Stores the last-accepted milestone snapshot in shared awareness so both parties
 * see the same diff and it survives page refreshes.
 * 
 * The snapshot is persisted via Socket.io awareness messages, allowing real-time
 * synchronization between client and freelancer.
 */
export function useProposalSnapshot(jobId: string, userId: string) {
  const { socket, isConnected } = useSocket();
  const [lastAcceptedSnapshot, setLastAcceptedSnapshot] = useState<MilestoneSnapshot[] | null>(null);
  const [awarenessPeers, setAwarenessPeers] = useState<Map<string, SnapshotAwareness>>(new Map());
  const awarenessRef = useRef<SnapshotAwareness | null>(null);

  // Initialize local awareness with current user
  useEffect(() => {
    awarenessRef.current = {
      jobId,
      userId,
      lastAcceptedSnapshot: null,
      acceptedAt: 0,
    };
  }, [jobId, userId]);

  // Listen for awareness updates from peers
  useEffect(() => {
    if (!socket || !isConnected) return;

    // Handle incoming awareness updates (when peer accepts a proposal)
    const handleAwarenessUpdate = (data: SnapshotAwareness) => {
      if (data.jobId === jobId && data.userId !== userId) {
        // Update peer awareness
        setAwarenessPeers((prev) => {
          const next = new Map(prev);
          next.set(data.userId, data);
          return next;
        });

        // If peer's snapshot is more recent, use theirs
        if (
          data.lastAcceptedSnapshot &&
          (!lastAcceptedSnapshot || data.acceptedAt > (awarenessRef.current?.acceptedAt || 0))
        ) {
          setLastAcceptedSnapshot(data.lastAcceptedSnapshot);
        }
      }
    };

    // Listen for awareness updates from other users
    socket.on("proposal:awareness", handleAwarenessUpdate);

    return () => {
      socket.off("proposal:awareness", handleAwarenessUpdate);
    };
  }, [socket, isConnected, jobId, userId, lastAcceptedSnapshot]);

  /**
   * Update the last-accepted snapshot and broadcast to peers via awareness
   */
  const acceptSnapshot = useCallback(
    (snapshot: MilestoneSnapshot[]) => {
      const now = Date.now();
      const awareness: SnapshotAwareness = {
        jobId,
        userId,
        lastAcceptedSnapshot: snapshot,
        acceptedAt: now,
      };

      awarenessRef.current = awareness;
      setLastAcceptedSnapshot(snapshot);

      // Broadcast awareness update to other user via Socket.io
      if (socket && isConnected) {
        socket.emit("proposal:awareness", awareness);
      }

      // Also save to localStorage as fallback persistence
      localStorage.setItem(
        `proposal:snapshot:${jobId}`,
        JSON.stringify({
          snapshot,
          acceptedAt: now,
          userId,
        })
      );
    },
    [socket, isConnected, jobId, userId]
  );

  /**
   * Restore snapshot from localStorage on mount
   */
  useEffect(() => {
    const stored = localStorage.getItem(`proposal:snapshot:${jobId}`);
    if (stored) {
      try {
        const { snapshot } = JSON.parse(stored);
        setLastAcceptedSnapshot(snapshot);
        if (awarenessRef.current) {
          awarenessRef.current.lastAcceptedSnapshot = snapshot;
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, [jobId]);

  /**
   * Clear the snapshot (useful when starting a new proposal round)
   */
  const clearSnapshot = useCallback(() => {
    setLastAcceptedSnapshot(null);
    if (awarenessRef.current) {
      awarenessRef.current.lastAcceptedSnapshot = null;
    }
    localStorage.removeItem(`proposal:snapshot:${jobId}`);

    if (socket && isConnected) {
      socket.emit("proposal:awareness", {
        jobId,
        userId,
        lastAcceptedSnapshot: null,
        acceptedAt: 0,
      });
    }
  }, [socket, isConnected, jobId, userId]);

  return {
    lastAcceptedSnapshot,
    acceptSnapshot,
    clearSnapshot,
    awarenessPeers,
    isConnected,
  };
}
