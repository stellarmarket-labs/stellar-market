"use client";

import { useMemo } from "react";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import type { RevisionProposal } from "@/types";
import DiffViewer from "./DiffViewer";
import ProposalHistory, { type ProposalHistoryEntry } from "./ProposalHistory";
import { computeProposalDiffs, type MilestoneSnapshot } from "@/utils/proposalDiff";

interface RevisionProposalViewerProps {
  proposal: RevisionProposal;
  proposedBy: string;
  currentMilestones: Array<{ title: string; description?: string; amount: number; deadline: string }>;
  canRespond: boolean;
  onAccept: () => void | Promise<void>;
  onReject: () => void | Promise<void>;
  processing: boolean;
}

// Helper to convert stroops to XLM
function stroopsToXlm(stroops: string): number {
  try {
    return Number(BigInt(stroops || "0")) / 10_000_000;
  } catch {
    return 0;
  }
}

// Convert blockchain milestone to snapshot format
function convertProposalMilestonesToSnapshots(
  milestones: RevisionProposal["milestones"]
): MilestoneSnapshot[] {
  return milestones.map((m) => ({
    title: m.description || `Milestone ${m.id}`,
    description: "", // Blockchain doesn't track descriptions separately
    amount: stroopsToXlm(m.amountStroops),
    dueDate: new Date(m.deadline * 1000).toISOString(),
  }));
}

// Convert current milestones to snapshot format
function convertCurrentMilestonesToSnapshots(
  milestones: Array<{ title: string; description?: string; amount: number; deadline: string }>
): MilestoneSnapshot[] {
  return milestones.map((m) => ({
    title: m.title,
    description: m.description || "",
    amount: m.amount,
    dueDate: new Date(m.deadline).toISOString(),
  }));
}

/**
 * RevisionProposalViewer displays an incoming revision proposal with detailed diffs
 * and proposal history timeline
 */
export default function RevisionProposalViewer({
  proposal,
  proposedBy,
  currentMilestones,
  canRespond,
  onAccept,
  onReject,
  processing,
}: RevisionProposalViewerProps) {
  const proposalSnapshots = useMemo(
    () => convertProposalMilestonesToSnapshots(proposal.milestones),
    [proposal.milestones]
  );

  const currentSnapshots = useMemo(
    () => convertCurrentMilestonesToSnapshots(currentMilestones),
    [currentMilestones]
  );

  const milestoneDiffs = useMemo(
    () => computeProposalDiffs(currentSnapshots, proposalSnapshots),
    [currentSnapshots, proposalSnapshots]
  );

  // Extract proposal history from the proposal data if available
  const historyEntries = useMemo<ProposalHistoryEntry[]>(() => {
    if (proposal.history && proposal.history.length > 0) {
      return proposal.history.map((entry, idx) => ({
        id: `proposal-${idx}`,
        proposedBy: entry.proposer,
        proposedAt: new Date(entry.proposedAt * 1000),
        totalAmount: entry.totalAmount,
        milestoneSummary: `${entry.milestoneCount} milestone${entry.milestoneCount !== 1 ? "s" : ""}`,
      }));
    }
    return [];
  }, [proposal.history]);

  const proposalDate = new Date(proposal.createdAt * 1000);

  return (
    <div className="card mb-8 border-theme-warning/40 bg-theme-warning/5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-theme-heading mb-2">
          Pending revision proposal
        </h2>
        <p className="text-sm text-theme-text">
          {proposedBy} proposed new milestones and a budget of{" "}
          <span className="font-semibold text-stellar-blue">
            {stroopsToXlm(proposal.newTotalStroops).toLocaleString(undefined, {
              maximumFractionDigits: 7,
            })}{" "}
            XLM
          </span>
          . Review the changes below.
        </p>
      </div>

      {/* Diff Viewer */}
      <DiffViewer
        milestoneDiffs={milestoneDiffs}
        proposedBy={proposedBy}
        receivedAt={proposalDate}
      />

      {/* Proposal History Timeline */}
      {historyEntries.length > 0 && (
        <ProposalHistory entries={historyEntries} currentProposalId="current" />
      )}

      {/* Action Buttons - only show if user can respond */}
      {canRespond && (
        <div className="flex flex-wrap gap-2 pt-4 border-t border-theme-border">
          <button
            type="button"
            disabled={processing}
            onClick={onAccept}
            className="btn-primary py-2 px-4 text-sm flex items-center gap-2"
          >
            {processing ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <CheckCircle size={16} />
            )}
            Accept revision
          </button>
          <button
            type="button"
            disabled={processing}
            onClick={onReject}
            className="btn-secondary py-2 px-4 text-sm border-theme-error text-theme-error hover:bg-theme-error/10 flex items-center gap-2"
          >
            {processing ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <XCircle size={16} />
            )}
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
