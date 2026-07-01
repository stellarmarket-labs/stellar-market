"use client";

import { useNow } from "@/hooks/useTimeAgo";
import { formatTimeAgo, formatCountdown } from "@/utils/time";

type Props = {
  createdAt: string | number;
  voteDeadline?: string | number;
};

export default function DisputeTimeInfo({ createdAt, voteDeadline }: Props) {
  const now = useNow(); // updates every minute

  const created = new Date(createdAt).getTime();
  const deadline = voteDeadline ? new Date(voteDeadline).getTime() : null;

  const timeAgo = formatTimeAgo(created, now);

  let countdownText = null;
  let isUrgent = false;

  if (deadline) {
    const diff = deadline - now;

    countdownText = formatCountdown(now, deadline);

    // 🔥 urgency threshold (24h)
    isUrgent = diff > 0 && diff <= 24 * 60 * 60 * 1000;
  }

  return (
    <div className="space-y-1 text-sm">
      <p className="text-gray-500">{timeAgo}</p>
  {countdownText && (
        <p
          className={`font-medium ${
            isUrgent ? "text-amber-500" : "text-gray-600"
          }`}
        >
          {countdownText}
        </p>
      )}
    </div>
  );
}
