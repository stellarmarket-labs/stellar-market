"use client";

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5000";

interface YjsContextValue {
  doc: Y.Doc | null;
  provider: WebsocketProvider | null;
  isConnected: boolean;
  milestones: Y.Map<any> | null;
  updateMilestone: (milestoneId: string, data: any) => void;
  getMilestone: (milestoneId: string) => any;
}

const YjsContext = createContext<YjsContextValue>({
  doc: null,
  provider: null,
  isConnected: false,
  milestones: null,
  updateMilestone: () => {},
  getMilestone: () => null,
});

export function YjsProvider({ children, jobId, userId }: { children: ReactNode; jobId: string; userId: string }) {
  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [milestones, setMilestones] = useState<Y.Map<any> | null>(null);

  useEffect(() => {
    if (!jobId || !userId) return;

    // Create Yjs document
    const doc = new Y.Doc();
    docRef.current = doc;

    // Connect to WebSocket server
    const wsUrl = BACKEND_URL.replace('http', 'ws') + '/yjs';
    const provider = new WebsocketProvider(wsUrl, jobId, doc, {
      params: { jobId, userId },
      connect: true,
    });

    providerRef.current = provider;

    // Get milestones map
    const milestonesMap = doc.getMap('milestones');
    setMilestones(milestonesMap);

    // Track connection status
    provider.on('status', (event: { status: string }) => {
      setIsConnected(event.status === 'connected');
    });

    // Handle sync
    provider.on('sync', (isSynced: boolean) => {
      if (isSynced) {
        console.log('Yjs document synced');
      }
    });

    return () => {
      provider.destroy();
      doc.destroy();
      docRef.current = null;
      providerRef.current = null;
    };
  }, [jobId, userId]);

  const updateMilestone = (milestoneId: string, data: any) => {
    if (!milestones) return;

    const milestoneMap = milestones.get(milestoneId);
    if (!milestoneMap) {
      // Create new milestone map if it doesn't exist
      const newMilestoneMap = new Y.Map();
      Object.entries(data).forEach(([key, value]) => {
        newMilestoneMap.set(key, value);
      });
      milestones.set(milestoneId, newMilestoneMap);
    } else {
      // Update existing milestone
      Object.entries(data).forEach(([key, value]) => {
        (milestoneMap as Y.Map<any>).set(key, value);
      });
    }
  };

  const getMilestone = (milestoneId: string): any => {
    if (!milestones) return null;
    const milestoneMap = milestones.get(milestoneId);
    if (!milestoneMap) return null;
    return (milestoneMap as Y.Map<any>).toJSON();
  };

  return (
    <YjsContext.Provider
      value={{
        doc: docRef.current,
        provider: providerRef.current,
        isConnected,
        milestones,
        updateMilestone,
        getMilestone,
      }}
    >
      {children}
    </YjsContext.Provider>
  );
}

export function useYjs(): YjsContextValue {
  return useContext(YjsContext);
}
