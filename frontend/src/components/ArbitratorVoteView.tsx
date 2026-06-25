"use client";

import { useState } from "react";
import { Loader2, Scale } from "lucide-react";
import type { Dispute } from "@/types";
import EvidenceVerifier from "./EvidenceVerifier";

interface ArbitratorVoteViewProps {
  dispute: Dispute;
  walletAddress?: string;
  onVoteSubmit: (choice: "CLIENT" | "FREELANCER", splitPercent?: number) => Promise<void>;
}

type VoteChoice = "CLIENT" | "FREELANCER" | "SPLIT";

export default function ArbitratorVoteView({
  dispute,
  walletAddress,
  onVoteSubmit,
}: ArbitratorVoteViewProps) {
  const [choice, setChoice] = useState<VoteChoice | null>(null);
  const [clientPct, setClientPct] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isArbitrator =
    !!walletAddress && (dispute.arbitrators ?? []).includes(walletAddress);

  const freelancerPct = 100 - clientPct;

  const handleClientSlider = (val: number) => {
    setClientPct(val);
  };

  const handleFreelancerSlider = (val: number) => {
    setClientPct(100 - val);
  };

  const handleSubmit = async () => {
    if (!choice) return;
    setSubmitError(null);
    setSubmitting(true);

    try {
      if (choice === "SPLIT") {
        await onVoteSubmit("CLIENT", clientPct);
      } else {
        await onVoteSubmit(choice);
      }
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to submit vote. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isArbitrator) {
    return (
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <Scale size={18} className="text-stellar-blue" />
          <h3 className="font-semibold text-theme-heading">Dispute Details</h3>
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-theme-border text-theme-text-muted border border-theme-border">
            View Only
          </span>
        </div>

        <div>
          <p className="text-xs font-medium text-theme-text-muted uppercase tracking-wider mb-1">
            Dispute Reason
          </p>
          <p className="text-sm text-theme-text">{dispute.reason}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-theme-card border border-theme-border rounded-lg p-3 text-center">
            <p className="text-xs text-theme-text-muted mb-1">Votes for Client</p>
            <p className="text-2xl font-bold text-theme-heading">{dispute.votesForClient}</p>
          </div>
          <div className="bg-theme-card border border-theme-border rounded-lg p-3 text-center">
            <p className="text-xs text-theme-text-muted mb-1">Votes for Freelancer</p>
            <p className="text-2xl font-bold text-theme-heading">{dispute.votesForFreelancer}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card space-y-5">
      <div className="flex items-center gap-2">
        <Scale size={18} className="text-stellar-blue" />
        <h3 className="font-semibold text-theme-heading">Arbitrator Panel</h3>
      </div>

      {dispute.evidence && dispute.evidence.length > 0 && (
        <EvidenceVerifier
          disputeId={dispute.id}
          evidence={dispute.evidence.map((item) => ({
            id: item.id,
            fileUrl: item.fileUrl ?? item.url ?? "#",
            fileHash: item.fileHash ?? item.sha256 ?? "",
            leafIndex: item.leafIndex ?? 0,
            merkleProof: item.merkleProof ?? [],
            fileName: item.fileName,
            fileType: item.fileType,
            sha256: item.sha256,
            anchorTxHash: item.anchorTxHash,
          }))}
          onChainRoot={dispute.evidenceMerkleRoot}
        />
      )}

      <div>
        <p className="text-xs font-medium text-theme-text-muted uppercase tracking-wider mb-1">
          Dispute Reason
        </p>
        <p className="text-sm text-theme-text">{dispute.reason}</p>
      </div>

      <div>
        <p className="text-xs font-medium text-theme-text-muted uppercase tracking-wider mb-2">
          Your Vote
        </p>
        <div className="space-y-2">
          {(
            [
              { value: "CLIENT", label: "Client Wins" },
              { value: "FREELANCER", label: "Freelancer Wins" },
              { value: "SPLIT", label: "Split Award" },
            ] as { value: VoteChoice; label: string }[]
          ).map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                choice === opt.value
                  ? "border-stellar-blue bg-stellar-blue/10 text-theme-heading"
                  : "border-theme-border bg-theme-card text-theme-text hover:border-stellar-blue/50"
              }`}
            >
              <input
                type="radio"
                name="vote-choice"
                value={opt.value}
                checked={choice === opt.value}
                onChange={() => setChoice(opt.value)}
                disabled={submitting}
                className="accent-stellar-blue"
              />
              <span className="text-sm font-medium">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {choice === "SPLIT" && (
        <div className="space-y-3 p-3 bg-theme-card border border-theme-border rounded-lg">
          <p className="text-xs font-medium text-theme-text-muted uppercase tracking-wider">
            Split Percentages
          </p>

          <div>
            <div className="flex justify-between text-xs text-theme-text mb-1">
              <span>Client</span>
              <span className="font-semibold text-theme-heading">{clientPct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={clientPct}
              onChange={(e) => handleClientSlider(Number(e.target.value))}
              disabled={submitting}
              className="w-full accent-stellar-blue"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs text-theme-text mb-1">
              <span>Freelancer</span>
              <span className="font-semibold text-theme-heading">{freelancerPct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={freelancerPct}
              onChange={(e) => handleFreelancerSlider(Number(e.target.value))}
              disabled={submitting}
              className="w-full accent-stellar-blue"
            />
          </div>

          <p className="text-[10px] text-theme-text-muted">
            Percentages always sum to 100. Adjusting one slider updates the other.
          </p>
        </div>
      )}

      {submitError && (
        <p className="text-xs text-theme-error">{submitError}</p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!choice || submitting}
        className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Submitting Vote...
          </>
        ) : (
          "Submit Vote"
        )}
      </button>
    </div>
  );
}
