import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockPrismaJobFindMany = jest.fn();
const mockPrismaJobUpdate = jest.fn();
const mockSendNotification = jest.fn();

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    job: {
      findMany: mockPrismaJobFindMany,
      update: mockPrismaJobUpdate,
    },
  })),
  NotificationType: {
    JOB_EXPIRED: "JOB_EXPIRED",
    JOB_REMOVED: "JOB_REMOVED",
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("../../services/notification.service", () => ({
  NotificationService: {
    sendNotification: mockSendNotification,
  },
}));

import { expireJobs } from "../expiry.job";

describe("expiry job notifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a notification when an OPEN job expires", async () => {
    mockPrismaJobFindMany.mockResolvedValueOnce([
      { id: "job-open-1", title: "Open job", clientId: "client-1" },
    ]);
    mockPrismaJobUpdate.mockResolvedValueOnce({});

    await expireJobs();

    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "client-1",
        type: "JOB_EXPIRED",
        title: "Job Expired",
      }),
    );
  });

  it("creates a notification when a funded job expires", async () => {
    mockPrismaJobFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "job-funded-1", title: "Funded job", clientId: "client-2", contractJobId: "contract-1" },
      ]);
    mockPrismaJobUpdate.mockResolvedValueOnce({});

    await expireJobs();

    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "client-2",
        type: "JOB_EXPIRED",
        title: "Funded Job Expired",
      }),
    );
  });
});
