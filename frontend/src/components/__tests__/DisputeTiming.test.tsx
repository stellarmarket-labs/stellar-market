import { act, render, screen } from "@testing-library/react";
import DisputeTiming from "@/components/DisputeTiming";

describe("DisputeTiming", () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date("2026-07-01T12:00:00.000Z") });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("shows opened time in days for a dispute opened 3 days ago", () => {
    render(
      <DisputeTiming createdAt="2026-06-28T12:00:00.000Z" />,
    );

    expect(screen.getByText(/Opened 3 days ago/i)).toBeInTheDocument();
  });

  it("shows amber countdown when vote deadline is under 24 hours", () => {
    render(
      <DisputeTiming
        createdAt="2026-06-28T12:00:00.000Z"
        voteDeadline="2026-07-01T14:00:00.000Z"
      />,
    );

    expect(screen.getByText(/Vote closes in 2 hours/i)).toBeInTheDocument();
    expect(screen.getByText(/Vote closes in 2 hours/i).closest("div")).toHaveClass(
      "text-theme-warning",
    );
  });

  it("updates the countdown every minute without remounting", () => {
    render(
      <DisputeTiming
        createdAt="2026-06-28T12:00:00.000Z"
        voteDeadline="2026-07-01T12:05:00.000Z"
      />,
    );

    expect(screen.getByText(/Vote closes in 5 minutes/i)).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    expect(screen.getByText(/Vote closes in 4 minutes/i)).toBeInTheDocument();
  });
});
