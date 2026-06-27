import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";

jest.mock("jsonwebtoken", () => ({
  sign: jest.fn().mockReturnValue("mock_token"),
  verify: jest.fn(),
}));

const mockUser = {
  findUnique: jest.fn(),
  update: jest.fn(),
};
const mockRefreshToken = {
  updateMany: jest.fn(),
};

jest.mock("@prisma/client", () => {
  const mockPrisma = {
    user: mockUser,
    refreshToken: mockRefreshToken,
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma),
    UserRole: {
      ADMIN: "ADMIN",
      CLIENT: "CLIENT",
      FREELANCER: "FREELANCER",
    },
  };
});

jest.mock("../../config", () => ({
  config: {
    jwtSecret: "test_secret",
    stellar: {
      networkPassphrase: "Test SDF Network ; September 2015",
      rpcUrl: "https://soroban-testnet.stellar.org",
      horizonUrl: "https://horizon-testnet.stellar.org",
      escrowContractId: "",
      disputeContractId: "",
      reputationContractId: "",
      nativeTokenId: "",
    },
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  installRequestIdConsolePatch: jest.fn(),
}));

jest.mock("../../lib/redis", () => ({ redis: null }));

jest.mock("../../lib/cache", () => ({
  cache: jest.fn(),
  generateUserCacheKey: jest.fn(),
  invalidateCacheKey: jest.fn(),
}));

import userRouter from "../user.routes";
import { PrismaClient } from "@prisma/client";
const prismaMock = new PrismaClient() as any;

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/users", userRouter);

describe("DELETE /users/me", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deletes the authenticated user account", async () => {
    const jwt = require("jsonwebtoken");
    jwt.verify.mockReturnValue({ userId: "user-123", tokenVersion: 0 });

    prismaMock.user.findUnique.mockResolvedValue({
      role: "CLIENT",
      emailVerified: true,
      deletedAt: null,
      tokenVersion: 0,
    });

    prismaMock.user.update.mockResolvedValue({
      id: "user-123",
      deletedAt: new Date(),
      tokenVersion: 1,
    });

    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 2 });

    const res = await request(app)
      .delete("/users/me")
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Account deleted successfully.");

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-123" },
      data: {
        deletedAt: expect.any(Date),
        tokenVersion: { increment: 1 },
      },
    });

    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-123", revoked: false },
      data: { revoked: true },
    });
  });

  it("returns 401 when user is deleted and uses old token", async () => {
    const jwt = require("jsonwebtoken");
    jwt.verify.mockReturnValue({ userId: "user-123", tokenVersion: 0 });

    prismaMock.user.findUnique.mockResolvedValue({
      role: "CLIENT",
      emailVerified: true,
      deletedAt: new Date(),
      tokenVersion: 1,
    });

    const res = await request(app)
      .delete("/users/me")
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("ACCOUNT_DELETED");
    expect(res.body.error).toBe("Account deleted.");
  });

  it("returns 401 when tokenVersion is stale", async () => {
    const jwt = require("jsonwebtoken");
    jwt.verify.mockReturnValue({ userId: "user-123", tokenVersion: 0 });

    prismaMock.user.findUnique.mockResolvedValue({
      role: "CLIENT",
      emailVerified: true,
      deletedAt: null,
      tokenVersion: 1,
    });

    const res = await request(app)
      .delete("/users/me")
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("TOKEN_EXPIRED");
    expect(res.body.error).toMatch(/Token expired/i);
  });

  it("allows non-deleted user with valid token to pass through", async () => {
    const jwt = require("jsonwebtoken");
    jwt.verify.mockReturnValue({ userId: "user-456", tokenVersion: 0 });

    prismaMock.user.findUnique.mockResolvedValue({
      role: "FREELANCER",
      emailVerified: true,
      deletedAt: null,
      tokenVersion: 0,
    });

    prismaMock.user.update.mockResolvedValue({
      id: "user-456",
      deletedAt: new Date(),
      tokenVersion: 1,
    });

    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .delete("/users/me")
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
  });
});
