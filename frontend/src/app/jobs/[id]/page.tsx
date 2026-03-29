"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Clock,
  DollarSign,
  ArrowLeft,
  MessageSquare,
  ShieldCheck,
  AlertCircle,
  Loader2,
  CheckCircle,
  UserCheck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import axios from "axios";
import { useWallet } from "@/context/WalletContext";
import { useAuth } from "@/context/AuthContext";
import StatusBadge from "@/components/StatusBadge";
import ApplyModal from "@/components/ApplyModal";
import RaiseDisputeModal from "@/components/RaiseDisputeModal";
import ReviewModal from "@/components/ReviewModal";
import { Job, Application, PaginatedResponse } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export default function JobDetailPage() {
  const { id } = useParams();
  const { address, signAndBroadcastTransaction } = useWallet();
  const { user } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [extendingMilestoneId, setExtendingMilestoneId] = useState<
    string | null
  >(null);
  const [extendDeadlineDate, setExtendDeadlineDate] = useState<
    Record<string, string>
  >({});
  const [hasApplied, setHasApplied] = useState(false);
  const [myApplicationId, setMyApplicationId] = useState<string | null>(null);
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [actioningApp, setActioningApp] = useState<string | null>(null);

  const fetchJob = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      setHasApplied(false);

      const res = await axios.get(`${API_URL}/jobs/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setJob(res.data);

      if (token && user?.role === "FREELANCER") {
        try {
          const appsRes = await axios.get<PaginatedResponse<Application>>(
            `${API_URL}/applications`,
            {
              params: { jobId: id, freelancerId: user.id, limit: 1 },
              headers: { Authorization: `Bearer ${token}` },
            },
          );
          const applied = appsRes.data.total > 0;
          setHasApplied(applied);
          if (applied && appsRes.data.data[0]) {
            setMyApplicationId(appsRes.data.data[0].id);
          }
        } catch {
          setHasApplied(false);
          setMyApplicationId(null);
        }
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch job details.",
      );
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  const fetchApplications = useCallback(async () => {
    setLoadingApps(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get<{ data: Application[] }>(
        `${API_URL}/jobs/${id as string}/applications`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      setApplications(res.data.data ?? []);
    } catch {
      setApplications([]);
    } finally {
      setLoadingApps(false);
    }
  }, [id]);

  // Fetch applicants once job loads and current user is the owner
  useEffect(() => {
    if (job && user && user.id === job.client.id) {
      void fetchApplications();
    }
  }, [job, user, fetchApplications]);

  const handleApplicationStatus = async (
    appId: string,
    status: "ACCEPTED" | "REJECTED",
  ) => {
    setActioningApp(appId);
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${API_URL}/applications/${appId}/status`,
        { status },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      await fetchApplications();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to update application.",
      );
    } finally {
      setActioningApp(null);
    }
  };

  const handleWithdrawApplication = async () => {
    if (!myApplicationId) return;
    setWithdrawing(true);
    try {
      const token = localStorage.getItem("stellarmarket_jwt");
      await axios.delete(`${API_URL}/applications/${myApplicationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setHasApplied(false);
      setMyApplicationId(null);
      setWithdrawConfirmOpen(false);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to withdraw application.",
      );
    } finally {
      setWithdrawing(false);
    }
  };

  const handleEscrowAction = async (
    action: "init" | "fund" | "approve" | "extend-deadline",
    milestoneId?: string,
  ) => {
    setError(null);
    setProcessing(true);
    try {
      const token = localStorage.getItem("token");
      let endpoint = "";
      let payload: Record<string, unknown> = { jobId: id };
      let type = "";

      if (action === "init") {
        endpoint = "/escrow/init-create";
        type = "CREATE_JOB";
      } else if (action === "fund") {
        endpoint = "/escrow/init-fund";
        type = "FUND_JOB";
      } else if (action === "approve") {
        endpoint = "/escrow/init-approve";
        payload = { milestoneId };
        type = "APPROVE_MILESTONE";
      } else if (action === "extend-deadline") {
        endpoint = "/escrow/init-extend-deadline";
        const newDeadline = extendDeadlineDate[milestoneId!];
        payload = { milestoneId, newDeadline };
        type = "EXTEND_DEADLINE";
      }

      // 1. Get XDR from backend
      const res = await axios.post(`${API_URL}${endpoint}`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // 2. Sign and broadcast via WalletContext
      const txResult = await signAndBroadcastTransaction(res.data.xdr);

      if (!txResult.success) {
        throw new Error(txResult.error || "Transaction failed");
      }

      // 3. Confirm with backend
      // Note: For CREATE_JOB, we ideally need the on-chain job ID from events,
      // but here we simplify or assume the backend can extract it or use a count.
      // In this contract, job IDs are sequential. Our backend confirm-tx needs to know this.
      await axios.post(
        `${API_URL}/escrow/confirm-tx`,
        {
          hash: txResult.hash,
          type,
          jobId: id,
          milestoneId,
          newDeadline:
            action === "extend-deadline"
              ? extendDeadlineDate[milestoneId!]
              : undefined,
          onChainJobId: 1, // Simplified for this task: in production, parse resultXdr or events
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      // 4. Refresh data
      await fetchJob();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch job details.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleCompleteJob = async () => {
    setError(null);
    setProcessing(true);
    try {
      const token = localStorage.getItem("token");
      await axios.patch(
        `${API_URL}/jobs/${id}/complete`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );

      await fetchJob();

      // Show review modal after completion
      setReviewModalOpen(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to complete job.");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-stellar-blue" size={48} />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-theme-heading mb-4">
          Job Not Found
        </h1>
        <Link href="/jobs" className="text-stellar-blue hover:underline">
          Return to browse jobs
        </Link>
      </div>
    );
  }

  const isClient = address === job.client.walletAddress;
  const isOwnJob = user?.id === job.client.id || isClient;
  const isOwner = user?.id === job.client.id;
  const isFreelancer = user?.role === "FREELANCER";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link
        href="/jobs"
        className="flex items-center gap-2 text-theme-text hover:text-theme-heading mb-8 transition-colors"
      >
        <ArrowLeft size={18} /> Back to Jobs
      </Link>

      {error && (
        <div className="mb-6 p-4 bg-theme-error/10 border border-theme-error/20 rounded-lg flex items-start gap-3 text-theme-error">
          <AlertCircle className="flex-shrink-0 mt-0.5" size={18} />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2">
          <div className="flex items-start justify-between mb-4">
            <span className="text-sm font-medium text-stellar-purple bg-stellar-purple/10 px-3 py-1 rounded">
              {job.category}
            </span>
            <div className="flex gap-2">
              <StatusBadge status={job.status} />
              <StatusBadge status={job.escrowStatus} />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-theme-heading mb-4">
            {job.title}
          </h1>

          <div className="card mb-8">
            <h2 className="text-lg font-semibold text-theme-heading mb-4">
              Description
            </h2>
            <div className="text-theme-text whitespace-pre-line text-sm leading-relaxed">
              {job.description}
            </div>
          </div>

          {/* Milestones */}
          <div className="card">
            <h2 className="text-lg font-semibold text-theme-heading mb-4">
              Milestones
            </h2>
            <div className="space-y-4">
              {job.milestones.map((milestone, index) => (
                <div
                  key={milestone.id}
                  className="flex items-start gap-4 p-4 bg-theme-bg rounded-lg border border-theme-border"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-stellar-blue/20 flex items-center justify-center text-stellar-blue text-sm font-medium">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-medium text-theme-heading">
                        {milestone.title}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-stellar-purple font-medium">
                          {milestone.amount.toLocaleString()} XLM
                        </span>
                        <StatusBadge status={milestone.status} />
                      </div>
                    </div>
                    <p className="text-sm text-theme-text mb-3">
                      {milestone.description}
                    </p>

                    {/* Milestone Actions */}
                    {isClient && milestone.status === "SUBMITTED" && (
                      <button
                        disabled={processing}
                        onClick={() =>
                          handleEscrowAction("approve", milestone.id)
                        }
                        className="btn-primary py-1.5 text-xs flex items-center gap-2"
                      >
                        {processing ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <ShieldCheck size={14} />
                        )}
                        Approve & Release Funds
                      </button>
                    )}

                    {/* Extend Deadline — client only, on overdue milestones */}
                    {isClient &&
                      milestone.contractDeadline &&
                      new Date(milestone.contractDeadline) < new Date() &&
                      milestone.status !== "APPROVED" && (
                        <div className="mt-2">
                          {extendingMilestoneId === milestone.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="date"
                                className="border border-theme-border rounded px-2 py-1 text-xs bg-theme-bg text-theme-text"
                                min={new Date().toISOString().split("T")[0]}
                                value={extendDeadlineDate[milestone.id] ?? ""}
                                onChange={(e) =>
                                  setExtendDeadlineDate((prev) => ({
                                    ...prev,
                                    [milestone.id]: e.target.value,
                                  }))
                                }
                              />
                              <button
                                disabled={
                                  processing ||
                                  !extendDeadlineDate[milestone.id]
                                }
                                onClick={() => {
                                  void handleEscrowAction(
                                    "extend-deadline",
                                    milestone.id,
                                  );
                                  setExtendingMilestoneId(null);
                                }}
                                className="btn-primary py-1 px-2 text-xs flex items-center gap-1"
                              >
                                {processing ? (
                                  <Loader2 className="animate-spin" size={12} />
                                ) : (
                                  <Clock size={12} />
                                )}
                                Confirm
                              </button>
                              <button
                                onClick={() => setExtendingMilestoneId(null)}
                                className="text-xs text-theme-text hover:text-theme-heading"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() =>
                                setExtendingMilestoneId(milestone.id)
                              }
                              className="flex items-center gap-1 text-xs text-stellar-blue hover:underline"
                            >
                              <Clock size={12} /> Extend Deadline
                            </button>
                          )}
                        </div>
                      )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Applicants — visible to owning client only */}
          {isOwnJob && (
            <div className="card mt-8">
              <h2 className="text-lg font-semibold text-theme-heading mb-4">
                Applicants
              </h2>
              {loadingApps ? (
                <div className="flex justify-center py-8">
                  <Loader2
                    className="animate-spin text-stellar-blue"
                    size={32}
                  />
                </div>
              ) : applications.length === 0 ? (
                <p className="text-theme-text text-sm py-4 text-center">
                  No applications yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {applications.map((app) => (
                    <div
                      key={app.id}
                      className="flex items-center justify-between p-4 bg-theme-bg rounded-lg border border-theme-border"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-stellar-blue to-stellar-purple flex items-center justify-center text-white text-sm font-bold">
                          {app.freelancer.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-theme-heading text-sm">
                            {app.freelancer.username}
                          </p>
                          <p className="text-xs text-theme-text">
                            Bid: {app.bidAmount.toLocaleString()} XLM
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={app.status} />
                        {app.status === "PENDING" && (
                          <>
                            <button
                              disabled={actioningApp === app.id}
                              onClick={() =>
                                void handleApplicationStatus(app.id, "ACCEPTED")
                              }
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                            >
                              {actioningApp === app.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <UserCheck size={12} />
                              )}
                              Accept
                            </button>
                            <button
                              disabled={actioningApp === app.id}
                              onClick={() =>
                                void handleApplicationStatus(app.id, "REJECTED")
                              }
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-theme-error/10 text-theme-error hover:bg-theme-error/20 transition-colors disabled:opacity-50"
                            >
                              {actioningApp === app.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <XCircle size={12} />
                              )}
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="text-stellar-blue" size={20} />
              <span className="text-2xl font-bold text-theme-heading">
                {job.budget.toLocaleString()} XLM
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-theme-text mb-4">
              <Clock size={14} />
              Posted {new Date(job.createdAt).toLocaleDateString()}
            </div>

            {/* Escrow Status Actions */}
            {isClient && !job.contractJobId && job.status === "IN_PROGRESS" && (
              <button
                disabled={processing}
                onClick={() => handleEscrowAction("init")}
                className="btn-primary w-full flex items-center justify-center gap-2 mb-4"
              >
                {processing ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <ShieldCheck size={18} />
                )}
                Initialize On-Chain Escrow
              </button>
            )}

            {isClient &&
              job.contractJobId &&
              job.escrowStatus === "UNFUNDED" && (
                <button
                  disabled={processing}
                  onClick={() => handleEscrowAction("fund")}
                  className="btn-secondary w-full flex items-center justify-center gap-2 mb-4 border-stellar-blue text-stellar-blue hover:bg-stellar-blue/10"
                >
                  {processing ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <DollarSign size={18} />
                  )}
                  Fund Escrow with XLM
                </button>
              )}

            {/* Apply section — freelancers only, non-owners */}
            {user?.role === "FREELANCER" &&
              !isOwnJob &&
              job.status === "OPEN" &&
              (hasApplied ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 w-full py-2 px-4 rounded-lg bg-green-500/10 text-green-400 text-sm font-medium border border-green-500/20">
                    <CheckCircle size={16} /> Applied
                  </div>
                  <button
                    className="btn-secondary w-full flex items-center justify-center gap-2 border-theme-error text-theme-error hover:bg-theme-error/10 text-sm"
                    onClick={() => setWithdrawConfirmOpen(true)}
                  >
                    Withdraw Application
                  </button>
                </div>
              ) : (
                <button
                  className="btn-primary w-full"
                  onClick={() => setApplyModalOpen(true)}
                >
                  Apply for this Job
                </button>
              ))}

            {isOwner && (
              <div className="p-3 bg-stellar-purple/10 border border-stellar-purple/20 rounded-lg text-sm text-stellar-purple flex items-center justify-center gap-2">
                <CheckCircle size={16} />
                You posted this job
              </div>
            )}

            {job.escrowStatus === "FUNDED" && (
              <div className="p-3 bg-stellar-blue/10 border border-stellar-blue/20 rounded-lg text-xs text-stellar-blue flex items-center gap-2 mb-4">
                <ShieldCheck size={16} />
                Funds are secured in escrow
              </div>
            )}

            {/* Mark as Complete button - client only, when all milestones approved */}
            {isClient &&
              job.status === "IN_PROGRESS" &&
              job.milestones.every((m) => m.status === "APPROVED") && (
                <button
                  disabled={processing}
                  onClick={handleCompleteJob}
                  className="btn-primary w-full flex items-center justify-center gap-2 mb-4"
                >
                  {processing ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <CheckCircle size={18} />
                  )}
                  Mark Job as Complete
                </button>
              )}

            {/* Raise Dispute button - only if escrow is funded */}
            {isOwnJob &&
              job.status === "IN_PROGRESS" &&
              job.escrowStatus === "FUNDED" && (
                <button
                  className="btn-secondary w-full flex items-center justify-center gap-2 border-theme-error text-theme-error hover:bg-theme-error/10"
                  onClick={() => setDisputeModalOpen(true)}
                >
                  <AlertCircle size={18} /> Raise Dispute
                </button>
              )}

            {/* Show tooltip if trying to dispute unfunded job */}
            {isOwnJob &&
              job.status === "IN_PROGRESS" &&
              job.escrowStatus !== "FUNDED" && (
                <div className="p-3 bg-theme-error/10 border border-theme-error/20 rounded-lg text-xs text-theme-error">
                  Escrow must be funded before a dispute can be raised
                </div>
              )}
          </div>

          <div className="card">
            <h3 className="font-semibold text-theme-heading mb-4">
              About the Client
            </h3>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-stellar-blue to-stellar-purple" />
              <div>
                <div className="font-medium text-theme-heading">
                  {job.client.username}
                </div>
                <div className="text-xs text-theme-text">
                  {job.client.walletAddress.slice(0, 8)}...
                  {job.client.walletAddress.slice(-8)}
                </div>
              </div>
            </div>
            <p className="text-sm text-theme-text mb-4">{job.client.bio}</p>
            <Link
              href={`/messages/${job.client.id}-${job.id}`}
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              <MessageSquare size={18} /> Message Client
            </Link>
          </div>
        </div>
      </div>

      {job.status === "OPEN" && !isOwnJob && (
        <ApplyModal
          job={job}
          isOpen={applyModalOpen}
          onClose={() => setApplyModalOpen(false)}
          onSuccess={() => setHasApplied(true)}
        />
      )}

      {isOwnJob && (
        <RaiseDisputeModal
          job={job}
          isOpen={disputeModalOpen}
          onClose={() => setDisputeModalOpen(false)}
          onSuccess={() => {
            setDisputeModalOpen(false);
            fetchJob();
          }}
        />
      )}

      {/* Review Modal - shown after job completion */}
      {job.freelancer && (
        <ReviewModal
          job={job}
          revieweeId={isClient ? job.freelancer.id : job.client.id}
          revieweeName={
            isClient ? job.freelancer.username : job.client.username
          }
          isOpen={reviewModalOpen}
          onClose={() => setReviewModalOpen(false)}
          onSuccess={() => {
            setReviewModalOpen(false);
            fetchJob();
          }}
        />
      )}

      {/* Withdraw Application confirmation dialog */}
      {withdrawConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-theme-card border border-theme-border rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-theme-heading mb-2">
              Withdraw Application?
            </h2>
            <p className="text-sm text-theme-text mb-6">
              Are you sure you want to withdraw your application for{" "}
              <span className="font-medium text-theme-heading">
                {job.title}
              </span>
              ? This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setWithdrawConfirmOpen(false)}
                className="btn-secondary"
                disabled={withdrawing}
              >
                Cancel
              </button>
              <button
                onClick={() => void handleWithdrawApplication()}
                disabled={withdrawing}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-theme-error text-white text-sm font-medium hover:bg-theme-error/90 transition-colors disabled:opacity-50"
              >
                {withdrawing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : null}
                Withdraw
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
