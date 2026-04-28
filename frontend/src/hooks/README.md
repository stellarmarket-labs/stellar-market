# Custom Hooks

## useDisputeStatus

A React hook for polling dispute status with exponential backoff and automatic terminal state detection.

### Features

- **Exponential Backoff**: Starts at 2s, doubles each poll (2s → 4s → 8s → 16s → 30s max)
- **Smart Polling**: Automatically stops when dispute reaches terminal status
- **Terminal States**: `RESOLVED_CLIENT`, `RESOLVED_FREELANCER`, `ESCALATED`
- **Error Handling**: Graceful error handling with error state
- **Manual Refresh**: Provides `refetch()` function for immediate updates
- **Configurable**: Customizable intervals and enable/disable polling

### Usage

```tsx
import { useDisputeStatus } from "@/hooks/useDisputeStatus";

function DisputePage() {
  const { id } = useParams();

  const { dispute, isLoading, error, refetch } = useDisputeStatus({
    disputeId: id as string,
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!dispute) return <div>Not found</div>;

  return (
    <div>
      <h1>Status: {dispute.status}</h1>
      <p>
        Votes: {dispute.votesForClient} vs {dispute.votesForFreelancer}
      </p>
      <button onClick={refetch}>Refresh</button>
    </div>
  );
}
```

### API

#### Parameters

```typescript
interface UseDisputeStatusOptions {
  disputeId: string; // Required: The dispute ID to poll
  enabled?: boolean; // Optional: Enable/disable polling (default: true)
  initialInterval?: number; // Optional: Initial interval in ms (default: 2000)
  maxInterval?: number; // Optional: Max interval in ms (default: 30000)
}
```

#### Returns

```typescript
interface UseDisputeStatusReturn {
  dispute: Dispute | null; // The dispute data
  isLoading: boolean; // Loading state
  error: string | null; // Error message if any
  refetch: () => Promise<void>; // Manual refetch function
}
```

### Examples

#### Basic Usage

```tsx
const { dispute, isLoading, error } = useDisputeStatus({
  disputeId: "dispute-123",
});
```

#### Custom Intervals

```tsx
const { dispute } = useDisputeStatus({
  disputeId: "dispute-123",
  initialInterval: 3000, // Start at 3s
  maxInterval: 60000, // Max 60s
});
```

#### Conditional Polling

```tsx
const [isActive, setIsActive] = useState(true);

const { dispute } = useDisputeStatus({
  disputeId: "dispute-123",
  enabled: isActive, // Only poll when active
});
```

#### With Manual Refresh

```tsx
const { dispute, refetch } = useDisputeStatus({
  disputeId: "dispute-123",
});

const handleVote = async () => {
  await submitVote();
  await refetch(); // Immediately update
};
```

### Polling Behavior

1. **Initial Load**: Fetches immediately on mount
2. **Exponential Backoff**:
   - 1st poll: 2s after initial load
   - 2nd poll: 4s after 1st poll
   - 3rd poll: 8s after 2nd poll
   - 4th poll: 16s after 3rd poll
   - 5th+ poll: 30s (max) after previous poll
3. **Terminal Status**: Stops polling when status is:
   - `RESOLVED_CLIENT`
   - `RESOLVED_FREELANCER`
   - `ESCALATED`
4. **Cleanup**: Automatically cleans up timers on unmount

### Benefits

- **Reduced Server Load**: Exponential backoff reduces API calls over time
- **Real-time Updates**: Users see vote changes without manual refresh
- **Better UX**: Automatic updates improve perceived performance
- **Resource Efficient**: Stops polling when no longer needed

### Migration Guide

Replace manual polling in dispute pages:

**Before:**

```tsx
const [dispute, setDispute] = useState<Dispute | null>(null);
const [loading, setLoading] = useState(true);

useEffect(() => {
  const fetchDispute = async () => {
    const res = await axios.get(`/api/disputes/${id}`);
    setDispute(res.data);
    setLoading(false);
  };

  fetchDispute();
  const interval = setInterval(fetchDispute, 5000);
  return () => clearInterval(interval);
}, [id]);
```

**After:**

```tsx
const { dispute, isLoading } = useDisputeStatus({
  disputeId: id as string,
});
```

## useJobFilters

Hook for managing job filter state with URL synchronization.

See `useJobFilters.ts` for implementation details.
