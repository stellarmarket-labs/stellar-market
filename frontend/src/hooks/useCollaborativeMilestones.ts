"use client";

import { useEffect, useState, useCallback } from "react";
import { useYjs } from "@/context/YjsContext";
import * as Y from "yjs";

interface Milestone {
  id: string;
  title: string;
  description: string;
  amount: number;
  status: string;
  order: number;
  dueDate?: string;
}

export function useCollaborativeMilestones(jobId: string, initialMilestones: Milestone[]) {
  const { doc, isConnected, milestones: yjsMilestones, updateMilestone, getMilestone } = useYjs();
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones);

  // Sync Yjs changes to local state
  useEffect(() => {
    if (!yjsMilestones) return;

    const handleUpdate = () => {
      const updatedMilestones: Milestone[] = [];
      yjsMilestones.forEach((milestoneMap: Y.Map<any>, id: string) => {
        const data = milestoneMap.toJSON();
        updatedMilestones.push({
          id,
          ...data,
        } as Milestone);
      });
      
      // Sort by order
      updatedMilestones.sort((a, b) => a.order - b.order);
      setMilestones(updatedMilestones);
    };

    // Initial sync
    handleUpdate();

    // Listen for changes
    yjsMilestones.observeDeep(handleUpdate);

    return () => {
      yjsMilestones.unobserveDeep(handleUpdate);
    };
  }, [yjsMilestones]);

  // Initialize Yjs with initial milestones if empty
  useEffect(() => {
    if (!yjsMilestones || initialMilestones.length === 0) return;

    // Check if Yjs is empty
    if (yjsMilestones.size === 0) {
      initialMilestones.forEach((milestone) => {
        updateMilestone(milestone.id, milestone);
      });
    }
  }, [yjsMilestones, initialMilestones, updateMilestone]);

  const updateMilestoneField = useCallback((milestoneId: string, field: string, value: any) => {
    updateMilestone(milestoneId, { [field]: value });
  }, [updateMilestone]);

  const updateMilestoneData = useCallback((milestoneId: string, data: Partial<Milestone>) => {
    updateMilestone(milestoneId, data);
  }, [updateMilestone]);

  return {
    milestones,
    isConnected,
    updateMilestoneField,
    updateMilestoneData,
    isCollaborative: isConnected && yjsMilestones !== null,
  };
}
