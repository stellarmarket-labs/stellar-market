import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import DisputeTimeInfo from "@/components/DisputeTimeInfo";

// Mock the useNow hook
jest.mock("@/hooks/useTimeAgo", () => ({
  useNow: jest.fn(() => {
    // Return a fixed time for testing
    return new Date("2024-01-15T12:00:00Z").getTime();
  }),
}));

describe("DisputeTimeInfo", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders 'Opened 3 days ago' when dispute was opened 3 days ago", () => {
    const threeDaysAgo = new Date("2024-01-12T12:00:00Z");
    render(<DisputeTimeInfo createdAt={threeDaysAgo} />);

    expect(screen.getByText("Opened 3 days ago")).toBeInTheDocument();
  });

  it("renders 'Opened 1 day ago' for singular day", () => {
    const oneDayAgo = new Date("2024-01-14T12:00:00Z");
    render(<DisputeTimeInfo createdAt={oneDayAgo} />);

    expect(screen.getByText("Opened 1 day ago")).toBeInTheDocument();
  });

  it("renders 'Opened X hours ago' when dispute was opened within a day", () => {
    const twoHoursAgo = new Date("2024-01-15T10:00:00Z");
    render(<DisputeTimeInfo createdAt={twoHoursAgo} />);

    expect(screen.getByText("Opened 2 hours ago")).toBeInTheDocument();
  });

  it("renders 'Opened X minutes ago' when dispute was opened recently", () => {
    const tenMinutesAgo = new Date("2024-01-15T11:50:00Z");
    render(<DisputeTimeInfo createdAt={tenMinutesAgo} />);

    expect(screen.getByText("Opened 10 minutes ago")).toBeInTheDocument();
  });

  it("renders vote deadline countdown when voteDeadline is provided", () => {
    const twoDaysAgo = new Date("2024-01-13T12:00:00Z");
    const twoHoursFuture = new Date("2024-01-15T14:00:00Z");

    render(
      <DisputeTimeInfo
        createdAt={twoDaysAgo}
        voteDeadline={twoHoursFuture}
      />
    );

    expect(screen.getByText("Opened 2 days ago")).toBeInTheDocument();
    expect(screen.getByText("Vote closes in 2 hours")).toBeInTheDocument();
  });

  it("shows 'Vote closes in X minutes' when deadline is within an hour", () => {
    const threeDaysAgo = new Date("2024-01-12T12:00:00Z");
    const thirtyMinutesFuture = new Date("2024-01-15T12:30:00Z");

    render(
      <DisputeTimeInfo
        createdAt={threeDaysAgo}
        voteDeadline={thirtyMinutesFuture}
      />
    );

    expect(screen.getByText("Vote closes in 30 minutes")).toBeInTheDocument();
  });

  it("renders 'Voting closed' when deadline has passed", () => {
    const fiveDaysAgo = new Date("2024-01-10T12:00:00Z");
    const pastDeadline = new Date("2024-01-15T10:00:00Z");

    render(
      <DisputeTimeInfo
        createdAt={fiveDaysAgo}
        voteDeadline={pastDeadline}
      />
    );

    expect(screen.getByText("Voting closed")).toBeInTheDocument();
  });

  it("applies amber styling when deadline is within 24 hours", () => {
    const twoDaysAgo = new Date("2024-01-13T12:00:00Z");
    const twoHoursFuture = new Date("2024-01-15T14:00:00Z");

    const { container } = render(
      <DisputeTimeInfo
        createdAt={twoDaysAgo}
        voteDeadline={twoHoursFuture}
      />
    );

    const countdownText = screen.getByText("Vote closes in 2 hours");
    expect(countdownText).toHaveClass("text-amber-500");
  });

  it("applies gray styling when deadline is more than 24 hours away", () => {
    const twoDaysAgo = new Date("2024-01-13T12:00:00Z");
    const twoWeeksFuture = new Date("2024-01-29T12:00:00Z");

    const { container } = render(
      <DisputeTimeInfo
        createdAt={twoDaysAgo}
        voteDeadline={twoWeeksFuture}
      />
    );

    const countdownText = screen.getByText("Vote closes in 336 hours");
    expect(countdownText).toHaveClass("text-gray-600");
  });

  it("does not render countdown section when voteDeadline is not provided", () => {
    const threeDaysAgo = new Date("2024-01-12T12:00:00Z");
    const { container } = render(<DisputeTimeInfo createdAt={threeDaysAgo} />);

    expect(screen.getByText("Opened 3 days ago")).toBeInTheDocument();
    expect(screen.queryByText(/Vote closes in/)).not.toBeInTheDocument();
  });

  it("handles timestamp numbers as well as date objects", () => {
    const timestamp = new Date("2024-01-12T12:00:00Z").getTime();
    render(<DisputeTimeInfo createdAt={timestamp} />);

    expect(screen.getByText("Opened 3 days ago")).toBeInTheDocument();
  });

  it("handles ISO string dates", () => {
    const isoString = "2024-01-12T12:00:00Z";
    render(<DisputeTimeInfo createdAt={isoString} />);

    expect(screen.getByText("Opened 3 days ago")).toBeInTheDocument();
  });
});
