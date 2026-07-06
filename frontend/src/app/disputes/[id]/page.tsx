"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Loader2,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import axios, { AxiosError } from "axios";
import { useWallet } from "@/context/WalletContext";
import { useAuth } from "@/context/AuthContext";
import { Dispute, Vote } from "@/types";
import DisputeVoteProgress from "@/components/DisputeVoteProgress";
import DisputeTiming from "@/components/DisputeTiming";
import EvidenceViewer from "@/components/EvidenceViewer";
import EvidenceUpload from "@/components/EvidenceUpload";
import DisputeOutcomeBanner from "@/components/DisputeOutcomeBanner";
import DisputeTimeline from "@/components/DisputeTimeline";
import { useDisputeStream } from "@/hooks/useDisputeStream";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1";

export default function DisputeDetailPage() {
  const { id } = useParams();
  const { signAndBroadcastTransaction } = useWallet();
  const { user } = useAuth();

  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [voteChoice, setVoteChoice] = useState<
    "CLIENT" | "FREELANCER" | null
  >(null);
  const [voteReason, setVoteReason] = useState("");

  const fetchDispute = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API_URL}/disputes/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setDispute(res.data);
    } catch {
      setError("Failed to fetch dispute details.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDispute();
  }, [fetchDispute]);

  const { events: timelineEvents, isLive } = useDisputeStream(
    id as string,
    {
      enabled: Boolean(dispute),
      onEvent: () => fetchDispute(),
    }
  );

  const handleVote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voteChoice)
      return setError("Please select a side to vote for.");
    if (voteReason.length < 10)
      return setError("Please provide a reason for your vote.");

    setProcessing(true);
    setError(null);

    try {
      const token = localStorage.getItem("token");

      const res = await axios.post(
        `${API_URL}/disputes/init-vote`,
        { disputeId: id, choice: voteChoice, reason: voteReason },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const txResult = await signAndBroadcastTransaction(res.data.xdr);

      if (!txResult.success) {
        throw new Error(txResult.error || "Transaction failed");
      }

      await axios.post(
        `${API_URL}/disputes/confirm-tx`,
        {
          hash: txResult.hash,
          type: "CAST_VOTE",
          disputeId: id,
          choice: voteChoice,
          reason: voteReason,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setVoteChoice(null);
      setVoteReason("");
      fetchDispute();
    } catch (err: unknown) {
      let errorMsg = "An error occurred";
      if (err instanceof AxiosError) {
        errorMsg = err.response?.data?.error || err.message;
      } else if (err instanceof Error) {
        errorMsg = err.message;
      }
      setError(errorMsg);
    } finally {
      setProcessing(false);
    }
  };

  const handleResolve = async () => {
    setProcessing(true);
    setError(null);

    try {
      const token = localStorage.getItem("token");

      const res = await axios.post(
        `${API_URL}/disputes/init-resolve`,
        { disputeId: id },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const txResult = await signAndBroadcastTransaction(res.data.xdr);

      if (!txResult.success) {
        throw new Error(txResult.error || "Transaction failed");
      }

      await axios.post(
        `${API_URL}/disputes/confirm-tx`,
        {
          hash: txResult.hash,
          type: "RESOLVE_DISPUTE",
          disputeId: id,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      fetchDispute();
    } catch (err: unknown) {
      let errorMsg = "An error occurred";
      if (err instanceof AxiosError) {
        errorMsg = err.response?.data?.error || err.message;
      } else if (err instanceof Error) {
        errorMsg = err.message;
      }
      setError(errorMsg);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2
          className="animate-spin text-stellar-blue"
          size={48}
        />
      </div>
    );
  }

  if (!dispute) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold mb-4">
          Dispute Not Found
        </h1>
        <Link href="/disputes">Return to disputes</Link>
      </div>
    );
  }

  const isParticipant =
    user?.id === dispute.initiator.id ||
    user?.id === dispute.respondent.id;

  const hasVoted = dispute.votes.some(
    (v: Vote) => v.voter.walletAddress === user?.walletAddress
  );

  const totalVotes =
    dispute.votesForClient + dispute.votesForFreelancer;

  const canResolve =
    totalVotes >= dispute.minVotes &&
    (dispute.status === "OPEN" ||
      dispute.status === "VOTING");

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <Link href="/disputes" className="flex gap-2 mb-6">
        <ArrowLeft size={18} /> Back
      </Link>

      {error && <p className="text-red-500">{error}</p>}

      <DisputeOutcomeBanner status={dispute.status} />

      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-4">
            <DisputeTiming
              createdAt={dispute.createdAt}
              voteDeadline={dispute.voteDeadline}
            />

            <h1 className="text-xl font-bold mt-4 mb-2">
              Dispute Evidence & Reason
            </h1>

            <p>{dispute.reason}</p>

            <EvidenceViewer disputeId={dispute.id} />

            {isParticipant && (
              <EvidenceUpload
                disputeId={dispute.id}
                onUploadComplete={fetchDispute}
              />
            )}
          </div>
        </div>

        <div className="space-y-4">
          <DisputeTimeline
            events={timelineEvents}
            isLive={isLive}
          />

          <DisputeVoteProgress
            disputeId={id as string}
            showVoterDetails
          />

          <button
            onClick={handleResolve}
            disabled={!canResolve}
            className="btn-primary w-full"
          >
            Resolve Dispute
          </button>
        </div>
      </div>
    </div>
  );
}
