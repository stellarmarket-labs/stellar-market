export function formatTimeAgo(from: number, to: number) {
  const diff = Math.max(0, to - from);

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days > 0) return `Opened ${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `Opened ${hours} hour${hours > 1 ? "s" : ""} ago`;
  return `Opened ${minutes} minute${minutes > 1 ? "s" : ""} ago`;
}

export function formatCountdown(now: number, deadline: number) {
  const diff = deadline - now;

  if (diff <= 0) return "Voting closed";

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (hours > 0) {
    return `Vote closes in ${hours} hour${hours > 1 ? "s" : ""}`;
  }

  return `Vote closes in ${minutes} minute${minutes > 1 ? "s" : ""}`;
}