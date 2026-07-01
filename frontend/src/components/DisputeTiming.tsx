"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { useRelativeTime } from "@/hooks/useRelativeTime";

function formatCountdown(deadline: Date, now: Date): string {
  const diffMs = deadline.getTime() - now.getTime();
  if (diffMs <= 0) {
    return "Vote closed";
  }

  const minutes = Math.ceil(diffMs / 60000);
  const hours = Math.floor(minutes / 60);

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `Vote closes in ${days} day${days === 1 ? "" : "s"}`;
  }

  if (hours >= 1) {
    return `Vote closes in ${hours} hour${hours === 1 ? "" : "s"}`;
  }

  return `Vote closes in ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

interface DisputeTimingProps {
  createdAt: string;
  voteDeadline?: string;
}

export default function DisputeTiming({ createdAt, voteDeadline }: DisputeTimingProps) {
  const createdAtDate = useMemo(() => new Date(createdAt), [createdAt]);
  const openedLabel = useRelativeTime(createdAtDate, 60_000);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const countdown = useMemo(() => {
    if (!voteDeadline) return null;
    const deadlineDate = new Date(voteDeadline);
    if (Number.isNaN(deadlineDate.getTime())) return null;
    return formatCountdown(deadlineDate, now);
  }, [voteDeadline, now]);

  const isUrgent = useMemo(() => {
    if (!voteDeadline) return false;
    const deadlineDate = new Date(voteDeadline);
    const diffMs = deadlineDate.getTime() - now.getTime();
    return diffMs > 0 && diffMs <= 24 * 60 * 60 * 1000;
  }, [voteDeadline, now]);

  return (
    <div className="space-y-1 text-sm">
      <div className="inline-flex items-center gap-2 rounded-full bg-theme-bg-secondary px-3 py-1 text-theme-text">
        <Clock size={14} className="text-theme-text-muted" />
        <span className="font-medium">Opened {openedLabel}</span>
      </div>
      {countdown && (
        <div
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
            isUrgent
              ? "bg-theme-warning/10 text-theme-warning border border-theme-warning/20"
              : "bg-theme-bg-secondary text-theme-text"
          }`}
        >
          <span>{countdown}</span>
        </div>
      )}
    </div>
  );
}
