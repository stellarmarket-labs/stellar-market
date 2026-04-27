"use client";

import { useState, useEffect, useMemo } from "react";
import { X, AlertCircle, Loader2, Plus, Trash2 } from "lucide-react";
import axios, { AxiosError } from "axios";
import { useWallet } from "@/context/WalletContext";
import { Job, Milestone } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

type ProposeRevisionModalProps = {
  job: Job;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

type EditableMilestone = {
  id: string;
  title: string;
  description: string;
  amount: number;
  order: number;
};

export default function ProposeRevisionModal({
  job,
  isOpen,
  onClose,
  onSuccess,
}: ProposeRevisionModalProps) {
  const { signAndBroadcastTransaction } = useWallet();
  const [milestones, setMilestones] = useState<EditableMilestone[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize milestones from job data when modal opens
  useEffect(() => {
    if (isOpen && job.milestones) {
      setMilestones(
        job.milestones.map((m) => ({
          id: m.id,
          title: m.title,
          description: m.description,
          amount: m.amount,
          order: m.order,
        }))
      );
      setError(null);
    }
  }, [isOpen, job.milestones]);

  // Calculate total from milestone amounts
  const calculatedTotal = useMemo(() => {
    return milestones.reduce((sum, m) => sum + (m.amount || 0), 0);
  }, [milestones]);

  // Validation: check if total matches sum
  const isValid = useMemo(() => {
    if (milestones.length === 0) return false;
    if (calculatedTotal <= 0) return false;
    
    // Check all milestones have valid amounts
    return milestones.every((m) => m.amount > 0 && m.title.trim() && m.description.trim());
  }, [milestones, calculatedTotal]);

  const handleMilestoneChange = (
    index: number,
    field: keyof EditableMilestone,
    value: string | number
  ) => {
    setMilestones((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleAddMilestone = () => {
    const newOrder = milestones.length > 0 
      ? Math.max(...milestones.map(m => m.order)) + 1 
      : 0;
    
    setMilestones((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        title: "",
        description: "",
        amount: 0,
        order: newOrder,
      },
    ]);
  };

  const handleRemoveMilestone = (index: number) => {
    if (milestones.length <= 1) {
      setError("At least one milestone is required");
      return;
    }
    setMilestones((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isValid) {
      setError("Please ensure all milestones have valid titles, descriptions, and positive amounts");
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const token = localStorage.getItem("token");

      // 1. Get XDR for propose_revision transaction
      const res = await axios.post(
        `${API_URL}/jobs/${job.id}/propose-revision`,
        { milestones },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // 2. Sign & Broadcast
      const txResult = await signAndBroadcastTransaction(res.data.xdr);

      if (!txResult.success) {
        throw new Error(txResult.error || "Transaction failed");
      }

      // 3. Confirm transaction
      await axios.post(
        `${API_URL}/jobs/${job.id}/confirm-revision`,
        {
          hash: txResult.hash,
          milestones,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const errorMsg =
        err instanceof AxiosError
          ? err.response?.data?.error
          : err instanceof Error
          ? err.message
          : "An error occurred";
      setError(errorMsg || "An error occurred");
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-theme-bg border border-theme-border rounded-xl w-full max-w-3xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-theme-border">
          <h2 className="text-lg font-semibold text-theme-heading">
            Propose Revision
          </h2>
          <button
            onClick={onClose}
            className="text-theme-text hover:text-theme-heading p-1 rounded-full hover:bg-theme-border/50"
            disabled={processing}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            {error && (
              <div className="p-3 text-sm text-theme-error bg-theme-error/10 border border-theme-error/20 rounded-lg flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="block text-sm font-medium text-theme-heading">
                  Milestones
                </label>
                <button
                  type="button"
                  onClick={handleAddMilestone}
                  disabled={processing}
                  className="text-xs btn-secondary flex items-center gap-1 py-1 px-2"
                >
                  <Plus size={14} /> Add Milestone
                </button>
              </div>

              {milestones.map((milestone, index) => (
                <div
                  key={milestone.id}
                  className="p-3 border border-theme-border rounded-lg space-y-2 bg-theme-bg/50"
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-xs font-medium text-theme-text">
                      Milestone {index + 1}
                    </span>
                    {milestones.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMilestone(index)}
                        disabled={processing}
                        className="text-theme-error hover:text-theme-error/80 p-1"
                        title="Remove milestone"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  <div>
                    <input
                      type="text"
                      placeholder="Milestone title"
                      className="input-field text-sm"
                      value={milestone.title}
                      onChange={(e) =>
                        handleMilestoneChange(index, "title", e.target.value)
                      }
                      disabled={processing}
                      required
                    />
                  </div>

                  <div>
                    <textarea
                      placeholder="Milestone description"
                      className="input-field text-sm min-h-[60px] resize-y"
                      value={milestone.description}
                      onChange={(e) =>
                        handleMilestoneChange(index, "description", e.target.value)
                      }
                      disabled={processing}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-theme-text mb-1">
                      Amount (XLM)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      className="input-field text-sm"
                      value={milestone.amount || ""}
                      onChange={(e) =>
                        handleMilestoneChange(
                          index,
                          "amount",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      disabled={processing}
                      required
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-theme-border/20 rounded-lg border border-theme-border">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-theme-heading">
                  Total Amount
                </span>
                <span className="text-lg font-bold text-theme-heading">
                  {calculatedTotal.toFixed(2)} XLM
                </span>
              </div>
              <p className="text-xs text-theme-text mt-1">
                Sum of all milestone amounts
              </p>
            </div>

            <div className="text-xs text-theme-text space-y-1">
              <p>• The other party must accept this revision for it to take effect</p>
              <p>• All milestone amounts must be positive</p>
              <p>• The total will be calculated from individual milestone amounts</p>
            </div>
          </div>

          <div className="flex gap-3 p-4 border-t border-theme-border">
            <button
              type="button"
              onClick={onClose}
              disabled={processing}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={processing || !isValid}
              className="btn-primary flex-1"
            >
              {processing ? (
                <span className="flex items-center gap-2 justify-center">
                  <Loader2 className="animate-spin" size={16} /> Proposing...
                </span>
              ) : (
                "Propose Revision"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
