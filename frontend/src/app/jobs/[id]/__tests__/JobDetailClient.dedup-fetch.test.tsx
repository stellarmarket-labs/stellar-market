/**
 * Tests for #972: Server-side initialData prevents duplicate fetch on mount.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import axios from "axios";

jest.mock("axios", () => ({ get: jest.fn(), put: jest.fn(), isAxiosError: jest.fn() }));
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock("next/navigation", () => ({ useParams: () => ({ id: "job-1" }) }));

jest.mock("@/context/WalletContext", () => ({
  useWallet: () => ({
    address: "GCLIENT_WALLET",
    balances: [],
    signAndBroadcastTransaction: jest.fn(),
  }),
}));

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "client-1", role: "CLIENT" },
  }),
}));

jest.mock("@/components/Toast", () => ({
  useToast: () => ({ toast: { success: jest.fn(), error: jest.fn() } }),
}));

jest.mock("@/components/ApplyModal", () => () => null);
jest.mock("@/components/RaiseDisputeModal", () => () => null);
jest.mock("@/components/ReviewModal", () => () => null);
jest.mock("@/components/MilestoneTimeline", () => ({
  __esModule: true,
  default: () => null,
  getMilestoneDraftKey: () => "draft",
}));
jest.mock("@/components/MilestoneProgressTracker", () => () => null);
jest.mock("@/components/TransactionConfirmationModal", () => () => null);
jest.mock("@/components/DepositRateInfo", () => () => null);
jest.mock("@/components/ProposeRevisionModal", () => () => null);
jest.mock("@/components/ApproveMilestoneModal", () => () => null);
jest.mock("@/components/ShareMenu", () => () => null);
jest.mock("@/components/StatusBadge", () => ({ status }: { status: string }) => <span>{status}</span>);
jest.mock("@/components/WalletAddress", () => ({ address }: { address: string }) => <span>{address}</span>);
jest.mock("next/link", () => ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>);
jest.mock("@/utils/stellar", () => ({ parseJobIdFromResult: jest.fn() }));
jest.mock("@/constants/jobs", () => ({
  PAYMENT_TOKENS: ["XLM"],
  TOKEN_EXCHANGE_RATES: { XLM: 1 },
}));

import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";

function makeApp(children: React.ReactNode, queryClient?: QueryClient) {
  const qc = queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function buildJob(override: object = {}) {
  return {
    id: "job-1",
    title: "Test Job",
    description: "Desc",
    budget: 100,
    category: "Dev",
    skills: [],
    status: "OPEN",
    escrowStatus: "UNFUNDED",
    contractJobId: null,
    createdAt: new Date().toISOString(),
    deadline: new Date().toISOString(),
    client: { id: "client-1", username: "Client", walletAddress: "GCLIENT_WALLET", bio: "" },
    freelancer: null,
    milestones: [],
    revisionProposal: null,
    ...override,
  };
}

describe("JobDetailClient initialData dedup fetch (#972)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders without fetching when initialData is provided", async () => {
    mockedAxios.get.mockImplementation((url: string) => {
      // Only respond to reviews/application queries but NOT the job query
      if (url.includes("/reviews")) {
        return Promise.resolve({ data: { data: [], total: 0 } });
      }
      if (url.includes("/applications")) {
        return Promise.resolve({ data: { data: [], total: 0 } });
      }
      return Promise.reject(new Error("Unexpected fetch"));
    });

    const initialJob = buildJob();
    const { default: JobDetailClient } = await import("../JobDetailClient");

    render(makeApp(<JobDetailClient initialJob={initialJob} />));

    await waitFor(() => {
      expect(screen.getByText("Test Job")).toBeInTheDocument();
    });

    // Job endpoint should NOT have been called — initialData was used
    const jobCalls = mockedAxios.get.mock.calls.filter(
      ([url]: [string]) => url.includes("/jobs/job-1") && !url.includes("applications"),
    );
    expect(jobCalls).toHaveLength(0);
  });

  it("still re-fetches when query is invalidated (live refresh)", async () => {
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes("/jobs/job-1") && !url.includes("applications")) {
        return Promise.resolve({ data: buildJob({ title: "Updated Job" }) });
      }
      if (url.includes("/reviews")) {
        return Promise.resolve({ data: { data: [], total: 0 } });
      }
      if (url.includes("/applications")) {
        return Promise.resolve({ data: { data: [], total: 0 } });
      }
      return Promise.resolve({ data: {} });
    });

    const initialJob = buildJob({ title: "Initial Job" });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { default: JobDetailClient } = await import("../JobDetailClient");

    render(makeApp(<JobDetailClient initialJob={initialJob} />, queryClient));

    await waitFor(() => {
      expect(screen.getByText("Initial Job")).toBeInTheDocument();
    });

    // Invalidate the job query to simulate a live refresh trigger
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ["job", "job-1"] });
    });

    await waitFor(() => {
      expect(screen.getByText("Updated Job")).toBeInTheDocument();
    });

    // Job endpoint should have been called once (after invalidation)
    const jobCalls = mockedAxios.get.mock.calls.filter(
      ([url]: [string]) => url.includes("/jobs/job-1") && !url.includes("applications"),
    );
    expect(jobCalls).toHaveLength(1);
  });
});
