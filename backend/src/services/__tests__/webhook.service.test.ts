import crypto from "crypto";

// ─── Mock Prisma ─────────────────────────────────────────────────────────────
const mockWebhook = {
  id: "wh-1",
  userId: "user-1",
  url: "https://example.com/hook",
  event: "job.status_changed",
  secret: "super-secret-key-for-testing",
  active: true,
  createdAt: new Date("2024-01-01"),
};

const mockDelivery = {
  id: "del-1",
  webhookId: "wh-1",
  event: "job.status_changed",
  payload: { jobId: "job-42", status: "IN_PROGRESS" },
  status: "pending",
  attempts: 0,
  webhook: mockWebhook,
};

const mockCreate = jest.fn().mockResolvedValue(mockDelivery);
const mockFindUnique = jest.fn().mockResolvedValue(mockDelivery);
const mockUpdate = jest.fn().mockResolvedValue({});
const mockFindMany = jest.fn().mockResolvedValue([mockWebhook]);
const mockDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
const mockDeliveryFindMany = jest.fn().mockResolvedValue([]);

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    webhook: {
      create: jest.fn().mockResolvedValue({
        id: "wh-1",
        url: "https://example.com/hook",
        event: "job.status_changed",
        active: true,
        createdAt: new Date("2024-01-01"),
      }),
      findMany: mockFindMany,
      deleteMany: mockDeleteMany,
      findFirst: jest.fn().mockResolvedValue(null),
    },
    webhookDelivery: {
      create: mockCreate,
      findUnique: mockFindUnique,
      update: mockUpdate,
      findMany: mockDeliveryFindMany,
    },
  })),
  Prisma: { InputJsonValue: {} },
}));

// ─── Mock global fetch ────────────────────────────────────────────────────────
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ─── Mock logger ──────────────────────────────────────────────────────────────
jest.mock("../../lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

// ─── Mock IP validation ───────────────────────────────────────────────────────
jest.mock("../../lib/ip-validation", () => ({
  validateWebhookUrl: jest.fn(),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────
import { WebhookService } from "../webhook.service";
import { validateWebhookUrl } from "../../lib/ip-validation";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function computeExpectedSignature(secret: string, body: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("WebhookService — HMAC-SHA256 signature (#463)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    mockFindUnique.mockResolvedValue({ ...mockDelivery });
    mockUpdate.mockResolvedValue({});
    (validateWebhookUrl as jest.MockedFunction<typeof validateWebhookUrl>).mockResolvedValue({ valid: true });
  });

  it("includes X-StellarMarket-Signature header on every delivery", async () => {
    await WebhookService.deliver("del-1");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-StellarMarket-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("signature is correct HMAC-SHA256 of the serialised payload", async () => {
    await WebhookService.deliver("del-1");

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    const body = init.body as string;

    const expected = computeExpectedSignature(mockWebhook.secret, body);
    expect(headers["X-StellarMarket-Signature"]).toBe(expected);
  });

  it("signature changes when the payload changes", async () => {
    const bodyA = JSON.stringify({ event: "job.status_changed", data: { jobId: "job-1" } });
    const bodyB = JSON.stringify({ event: "job.status_changed", data: { jobId: "job-2" } });

    const sigA = computeExpectedSignature(mockWebhook.secret, bodyA);
    const sigB = computeExpectedSignature(mockWebhook.secret, bodyB);

    expect(sigA).not.toBe(sigB);
  });

  it("signature changes when the secret changes", async () => {
    const body = JSON.stringify({ event: "job.status_changed", data: { jobId: "job-42" } });
    const sig1 = computeExpectedSignature("secret-one", body);
    const sig2 = computeExpectedSignature("secret-two", body);

    expect(sig1).not.toBe(sig2);
  });

  it("includes X-StellarMarket-Event header matching the event type", async () => {
    await WebhookService.deliver("del-1");

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-StellarMarket-Event"]).toBe("job.status_changed");
  });

  it("marks delivery as success when endpoint returns 2xx", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    await WebhookService.deliver("del-1");

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "success" }),
      }),
    );
  });

  it("marks delivery as pending (retry) when endpoint returns non-2xx", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await WebhookService.deliver("del-1");

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "pending" }),
      }),
    );
  });

  it("does not deliver when webhook is inactive", async () => {
    mockFindUnique.mockResolvedValue({
      ...mockDelivery,
      webhook: { ...mockWebhook, active: false },
    });

    await WebhookService.deliver("del-1");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not deliver when max attempts reached", async () => {
    mockFindUnique.mockResolvedValue({
      ...mockDelivery,
      attempts: 3, // MAX_ATTEMPTS
    });

    await WebhookService.deliver("del-1");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("WebhookService — supported events", () => {
  it("recognises job.status_changed as a supported event", () => {
    expect(WebhookService.isSupportedEvent("job.status_changed")).toBe(true);
  });

  it("recognises milestone.approved as a supported event", () => {
    expect(WebhookService.isSupportedEvent("milestone.approved")).toBe(true);
  });

  it("rejects unknown event types", () => {
    expect(WebhookService.isSupportedEvent("unknown.event")).toBe(false);
  });
});

describe("WebhookService — URL validation (#872)", () => {
  const validateWebhookUrlMock = validateWebhookUrl as jest.MockedFunction<typeof validateWebhookUrl>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects webhook registration with localhost address", async () => {
    validateWebhookUrlMock.mockResolvedValue({
      valid: false,
      reason: "Webhook URL resolves to private IPv4 address: 127.0.0.1",
    });

    await expect(WebhookService.register("user-1", "http://localhost:8000/hook", "job.status_changed")).rejects.toThrow(
      /Webhook URL validation failed/,
    );
  });

  it("rejects webhook registration with RFC1918 private address", async () => {
    validateWebhookUrlMock.mockResolvedValue({
      valid: false,
      reason: "Webhook URL resolves to private IPv4 address: 192.168.1.1",
    });

    await expect(WebhookService.register("user-1", "http://192.168.1.1/hook", "job.status_changed")).rejects.toThrow(
      /Webhook URL validation failed/,
    );
  });

  it("rejects webhook registration with AWS metadata endpoint", async () => {
    validateWebhookUrlMock.mockResolvedValue({
      valid: false,
      reason: "Webhook URL resolves to AWS metadata endpoint (169.254.169.254)",
    });

    await expect(WebhookService.register("user-1", "http://169.254.169.254/hook", "job.status_changed")).rejects.toThrow(
      /Webhook URL validation failed/,
    );
  });

  it("accepts webhook registration with valid public URL", async () => {
    validateWebhookUrlMock.mockResolvedValue({ valid: true });

    const result = await WebhookService.register("user-1", "https://example.com/hook", "job.status_changed");
    expect(result.url).toBe("https://example.com/hook");
  });

  it("re-validates webhook URL at delivery time", async () => {
    mockFindUnique.mockResolvedValue({ ...mockDelivery });
    validateWebhookUrlMock.mockResolvedValue({
      valid: false,
      reason: "Webhook URL resolves to private IPv4 address: 10.0.0.1",
    });

    await WebhookService.deliver("del-1");

    expect(validateWebhookUrlMock).toHaveBeenCalledWith(mockDelivery.webhook.url);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed", attempts: 3 }),
      }),
    );
  });

  it("does not follow redirects to different hosts", async () => {
    mockFindUnique.mockResolvedValue({ ...mockDelivery });
    validateWebhookUrlMock.mockResolvedValue({ valid: true });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await WebhookService.deliver("del-1");

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.redirect).toBe("error");
  });
});

describe("WebhookService — durable retry sweep (#872)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateWebhookUrl as jest.MockedFunction<typeof validateWebhookUrl>).mockResolvedValue({ valid: true });
  });

  it("re-enqueues pending deliveries after a process restart", async () => {
    const now = new Date();
    const pastDelivery = {
      id: "del-2",
      webhookId: "wh-1",
      event: "job.status_changed",
      payload: { jobId: "job-42", status: "IN_PROGRESS" },
      status: "pending",
      attempts: 1,
      nextRetry: new Date(now.getTime() - 60_000),
      lastAttempt: new Date(),
      responseCode: null,
      createdAt: new Date(),
      webhook: mockWebhook,
    };

    mockDeliveryFindMany.mockResolvedValue([pastDelivery]);
    mockFindUnique.mockResolvedValue(pastDelivery);

    await WebhookService.sweepPendingRetries();

    expect(mockDeliveryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "pending",
          nextRetry: { lte: expect.any(Date) },
        }),
      }),
    );
  });
});
