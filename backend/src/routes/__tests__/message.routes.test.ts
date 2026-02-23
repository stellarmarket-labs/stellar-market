import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import { config } from "../../config";
import messageRouter from "../message.routes";

// ─── Prisma mock ─────────────────────────────────────────────────────────────
jest.mock("@prisma/client", () => {
  const mockPrisma = {
    message: {
      create: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

import { PrismaClient } from "@prisma/client";
const prismaMock = new PrismaClient() as jest.Mocked<PrismaClient>;
const messageMock = prismaMock.message as unknown as {
  create: jest.Mock;
  findMany: jest.Mock;
  updateMany: jest.Mock;
  count: jest.Mock;
};

// ─── App setup ────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/api/messages", messageRouter);

// ─── Helper: auth header ──────────────────────────────────────────────────────
function authHeader(userId = "user-test") {
  const token = jwt.sign({ userId }, config.jwtSecret, { expiresIn: "1h" });
  return { Authorization: `Bearer ${token}` };
}

afterEach(() => jest.clearAllMocks());

// ─── POST /api/messages ───────────────────────────────────────────────────────
describe("POST /api/messages", () => {
  const mockCreated = {
    id: "msg-1",
    senderId: "user-test",
    receiverId: "user-other",
    content: "Hi!",
    read: false,
    jobId: null,
    createdAt: new Date().toISOString(),
    sender: { id: "user-test", username: "alice", avatarUrl: null },
    receiver: { id: "user-other", username: "bob", avatarUrl: null },
  };

  it("creates a message and returns 201", async () => {
    messageMock.create.mockResolvedValueOnce(mockCreated);

    const res = await request(app)
      .post("/api/messages")
      .set(authHeader())
      .send({ receiverId: "user-other", content: "Hi!" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ content: "Hi!" });
    expect(messageMock.create).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when receiverId is missing", async () => {
    const res = await request(app)
      .post("/api/messages")
      .set(authHeader())
      .send({ content: "Hi!" });

    expect(res.status).toBe(400);
    expect(messageMock.create).not.toHaveBeenCalled();
  });

  it("returns 400 when content is missing", async () => {
    const res = await request(app)
      .post("/api/messages")
      .set(authHeader())
      .send({ receiverId: "user-other" });

    expect(res.status).toBe(400);
  });

  it("returns 401 with no auth token", async () => {
    const res = await request(app)
      .post("/api/messages")
      .send({ receiverId: "user-other", content: "Hi!" });

    expect(res.status).toBe(401);
  });
});

// ─── GET /api/messages/unread-count ──────────────────────────────────────────
describe("GET /api/messages/unread-count", () => {
  it("returns the unread count for the authenticated user", async () => {
    messageMock.count.mockResolvedValueOnce(5);

    const res = await request(app)
      .get("/api/messages/unread-count")
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 5 });
    expect(messageMock.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ receiverId: "user-test", read: false }),
      })
    );
  });

  it("returns 401 with no auth token", async () => {
    const res = await request(app).get("/api/messages/unread-count");
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/messages/conversations ─────────────────────────────────────────
describe("GET /api/messages/conversations", () => {
  it("returns a list of conversations", async () => {
    const now = new Date().toISOString();
    messageMock.findMany.mockResolvedValueOnce([
      {
        id: "msg-1",
        senderId: "user-test",
        receiverId: "user-bob",
        content: "Hey!",
        read: true,
        createdAt: now,
        sender: { id: "user-test", username: "alice", avatarUrl: null },
        receiver: { id: "user-bob", username: "bob", avatarUrl: null },
      },
    ]);

    const res = await request(app)
      .get("/api/messages/conversations")
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({
      partner: { username: "bob" },
    });
  });

  it("returns 401 with no auth token", async () => {
    const res = await request(app).get("/api/messages/conversations");
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/messages/:userId ────────────────────────────────────────────────
describe("GET /api/messages/:userId", () => {
  it("returns conversation history and marks messages as read", async () => {
    const mockMessages = [
      {
        id: "msg-1",
        senderId: "user-other",
        receiverId: "user-test",
        content: "Hello",
        read: false,
        createdAt: new Date().toISOString(),
        sender: { id: "user-other", username: "bob", avatarUrl: null },
      },
    ];
    messageMock.findMany.mockResolvedValueOnce(mockMessages);
    messageMock.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .get("/api/messages/user-other")
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(messageMock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          senderId: "user-other",
          receiverId: "user-test",
          read: false,
        }),
        data: { read: true },
      })
    );
  });

  it("returns 401 with no auth token", async () => {
    const res = await request(app).get("/api/messages/user-other");
    expect(res.status).toBe(401);
  });
});
