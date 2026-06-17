"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export interface ProposalHistoryEntry {
  id: string;
  proposedBy: string;
  proposedAt: Date;
  totalAmount: number;
  milestoneSummary: string; // e.g., "3 milestones"
}

interface ProposalHistoryProps {
  entries: ProposalHistoryEntry[];
  currentProposalId?: string;
}

/**
 * ProposalHistory displays a timeline of all proposals in a negotiation
 */
export default function ProposalHistory({
  entries,
  currentProposalId,
}: ProposalHistoryProps) {
  const [expanded, setExpanded] = useState(false);

  if (!entries || entries.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-theme-border mt-4 pt-4 space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-sm font-medium text-theme-text hover:text-theme-heading p-2 rounded hover:bg-theme-border/20 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={16} />
        ) : (
          <ChevronRight size={16} />
        )}
        <span>
          Proposal history ({entries.length} round{entries.length !== 1 ? "s" : ""})
        </span>
      </button>

      {expanded && (
        <div className="ml-6 space-y-3 py-2">
          {entries.map((entry, idx) => {
            const isCurrent = entry.id === currentProposalId;
            return (
              <div
                key={entry.id}
                className={`flex items-start gap-3 p-2 rounded text-sm ${
                  isCurrent ? "bg-theme-warning/10 border border-theme-warning/30" : ""
                }`}
              >
                {/* Timeline dot */}
                <div className="flex flex-col items-center gap-2 mt-1">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      isCurrent
                        ? "bg-theme-warning ring-2 ring-theme-warning/50"
                        : "bg-theme-border"
                    }`}
                  />
                  {idx < entries.length - 1 && (
                    <div className="w-0.5 h-8 bg-theme-border" />
                  )}
                </div>

                {/* Proposal details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-theme-heading">
                      {entry.proposedBy}
                    </span>
                    <span className="text-xs text-theme-text">
                      {entry.proposedAt.toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {isCurrent && (
                      <span className="inline-block px-2 py-0.5 bg-theme-warning text-white text-xs rounded font-medium">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-theme-text mt-1">
                    {entry.milestoneSummary} • {entry.totalAmount.toLocaleString()} XLM
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
