/**
 * Example usage of useDisputeStatus hook
 * 
 * This file demonstrates how to integrate the useDisputeStatus hook
 * into a dispute detail page to get real-time updates with exponential backoff.
 */

import { useDisputeStatus } from "./useDisputeStatus";
import { useParams } from "next/navigation";

export function DisputeDetailExample() {
  const { id } = useParams();
  
  // Basic usage - polls every 2s initially, backing off to max 30s
  const { dispute, isLoading, error, refetch } = useDisputeStatus({
    disputeId: id as string,
  });

  // Custom intervals
  const customPolling = useDisputeStatus({
    disputeId: id as string,
    initialInterval: 3000,  // Start at 3s
    maxInterval: 60000,     // Max 60s
  });

  // Conditional polling (e.g., only poll when user is on the page)
  const conditionalPolling = useDisputeStatus({
    disputeId: id as string,
    enabled: true, // Can be controlled by state/props
  });

  if (isLoading) {
    return <div>Loading dispute...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!dispute) {
    return <div>Dispute not found</div>;
  }

  return (
    <div>
      <h1>Dispute Status: {dispute.status}</h1>
      
      {/* Display vote counts */}
      <div>
        <p>Votes for Client: {dispute.votesForClient}</p>
        <p>Votes for Freelancer: {dispute.votesForFreelancer}</p>
        <p>Minimum Votes Required: {dispute.minVotes}</p>
      </div>

      {/* Manual refresh button */}
      <button onClick={refetch}>
        Refresh Now
      </button>

      {/* Show polling status */}
      {dispute.status === "RESOLVED_CLIENT" || 
       dispute.status === "RESOLVED_FREELANCER" || 
       dispute.status === "ESCALATED" ? (
        <p>✓ Dispute resolved - polling stopped</p>
      ) : (
        <p>⟳ Polling for updates...</p>
      )}

      {/* Display votes */}
      <div>
        <h2>Votes</h2>
        {dispute.votes.map((vote) => (
          <div key={vote.id}>
            <p>{vote.voter.username} voted for {vote.choice}</p>
            <p>{vote.reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Integration with existing dispute page
 * 
 * Replace the manual polling logic in frontend/src/app/disputes/[id]/page.tsx:
 * 
 * BEFORE:
 * ```tsx
 * const [dispute, setDispute] = useState<Dispute | null>(null);
 * const [loading, setLoading] = useState(true);
 * const [error, setError] = useState<string | null>(null);
 * 
 * const fetchDispute = useCallback(async () => {
 *   // ... fetch logic
 * }, [id]);
 * 
 * useEffect(() => {
 *   fetchDispute();
 *   const interval = setInterval(() => {
 *     fetchDispute();
 *   }, 5000);
 *   return () => clearInterval(interval);
 * }, [fetchDispute]);
 * ```
 * 
 * AFTER:
 * ```tsx
 * const { dispute, isLoading, error, refetch } = useDisputeStatus({
 *   disputeId: id as string,
 * });
 * 
 * // Use refetch() after voting or resolving to immediately update
 * const handleVote = async () => {
 *   // ... vote logic
 *   await refetch(); // Immediately fetch updated dispute
 * };
 * ```
 */
