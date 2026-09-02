import request from "supertest";
import express from "express";
import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import { config } from "../../config";

interface MockNotificationPreference {
  upsert: jest.Mock;
}

interface MockPrismaClient {
  notificationPreference: MockNotificationPreference;
}

// ─── Mocks ────────────────────────────────────────────────────────────────────
jest.mock("@prisma/client", () => {
  const mockPrisma = {
    notificationPreference: {
      upsert: jest.fn().mockResolvedValue({ userId: "user-1", marketingEmails: false }),
    },
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

import { PrismaClient } from "@prisma/client";
import unsubscribeRouter from "../unsubscribe.routes";

const prismaMock = new PrismaClient() as unknown as MockPrismaClient;
const prefMock = prismaMock.notificationPreference;

const app = express();
app.use("/api/unsubscribe", unsubscribeRouter);

afterEach(() => jest.clearAllMocks());

// ─── Helper ───────────────────────────────────────────────────────────────────
function makeToken(payload: Record<string, unknown>, expiresIn: string | number = "90d") {
  return jwt.sign(payload, config.jwtSecret, { expiresIn } as SignOptions);
}

// ─── HTML response tests (Accept: text/html) ─────────────────────────────────
describe("GET /api/unsubscribe — HTML responses", () => {
  it("returns 400 when no token is supplied", async () => {
    const res = await request(app).get("/api/unsubscribe").set("Accept", "text/html");
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/No unsubscribe token/);
    expect(prefMock.upsert).not.toHaveBeenCalled();
  });

  it("returns 400 for an expired token", async () => {
    const token = makeToken({ userId: "user-1", type: "unsubscribe" }, -1);
    const res = await request(app).get(`/api/unsubscribe?token=${token}`).set("Accept", "text/html");
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/expired/i);
    expect(prefMock.upsert).not.toHaveBeenCalled();
  });

  it("returns 400 for a token with the wrong type", async () => {
    const token = makeToken({ userId: "user-1", type: "access" });
    const res = await request(app).get(`/api/unsubscribe?token=${token}`).set("Accept", "text/html");
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/cannot be used to unsubscribe/i);
    expect(prefMock.upsert).not.toHaveBeenCalled();
  });

  it("sets marketingEmails to false for a valid unsubscribe token", async () => {
    const token = makeToken({ userId: "user-1", type: "unsubscribe" });
    const res = await request(app).get(`/api/unsubscribe?token=${token}`).set("Accept", "text/html");

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Unsubscribed/i);
    expect(prefMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        update: { marketingEmails: false },
        create: { userId: "user-1", marketingEmails: false },
      }),
    );
  });
});

// ─── JSON response tests (Accept: application/json) ──────────────────────────
describe("GET /api/unsubscribe — JSON responses (#1210)", () => {
  it("returns 400 JSON when no token is supplied", async () => {
    const res = await request(app)
      .get("/api/unsubscribe")
      .set("Accept", "application/json");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No unsubscribe token/);
    expect(prefMock.upsert).not.toHaveBeenCalled();
  });

  it("returns 400 JSON for an expired token", async () => {
    const token = makeToken({ userId: "user-1", type: "unsubscribe" }, -1);
    const res = await request(app)
      .get(`/api/unsubscribe?token=${token}`)
      .set("Accept", "application/json");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
    expect(prefMock.upsert).not.toHaveBeenCalled();
  });

  it("returns 400 JSON for a token with the wrong type", async () => {
    const token = makeToken({ userId: "user-1", type: "access" });
    const res = await request(app)
      .get(`/api/unsubscribe?token=${token}`)
      .set("Accept", "application/json");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot be used to unsubscribe/i);
    expect(prefMock.upsert).not.toHaveBeenCalled();
  });

  it("returns 200 JSON and unsubscribes for a valid token", async () => {
    const token = makeToken({ userId: "user-1", type: "unsubscribe" });
    const res = await request(app)
      .get(`/api/unsubscribe?token=${token}`)
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/unsubscribed/i);
    expect(prefMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        update: { marketingEmails: false },
        create: { userId: "user-1", marketingEmails: false },
      }),
    );
  });
});

// ─── EmailService.generateUnsubscribeToken ────────────────────────────────────
describe("EmailService.generateUnsubscribeToken (#800)", () => {
  it("generates a verifiable JWT with userId and type=unsubscribe", async () => {
    const { EmailService } = await import("../../services/email.service");
    const token = EmailService.generateUnsubscribeToken("user-42");
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    expect(payload.userId).toBe("user-42");
    expect(payload.type).toBe("unsubscribe");
  });

  it("email body includes the unsubscribe URL when sent via sendEventEmail", async () => {
    jest.mock("nodemailer", () => ({
      createTransport: () => ({
        sendMail: jest.fn().mockResolvedValue({}),
      }),
    }));

    const { EmailService } = await import("../../services/email.service");
    const url = EmailService.buildUnsubscribeUrl("user-99");
    expect(url).toContain("unsubscribe?token=");
    expect(url).toContain(config.frontendUrl);
    // #1210 — should point at the frontend page, not the backend API path
    expect(url).not.toContain("/api/v1/unsubscribe");
  });
});
