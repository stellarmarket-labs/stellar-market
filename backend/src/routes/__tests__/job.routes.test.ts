import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import { config } from "../../config";
import jobRouter from "../job.routes";

// --- Prisma mock ---
jest.mock("@prisma/client", () => {
  const mockPrisma = {
    user: { findUnique: jest.fn() },
    job: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    savedJob: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), delete: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

import { PrismaClient } from "@prisma/client";
const prismaMock = new PrismaClient() as jest.Mocked<PrismaClient>;

const app = express();
app.use(express.json());
app.use("/api/jobs", jobRouter);

function authHeader(userId = "user-freelancer") {
  const token = jwt.sign({ userId }, config.jwtSecret, { expiresIn: "1h" });
  return { Authorization: `Bearer ${token}` };
}

describe("Job Bookmarking Routes", () => {
  afterEach(() => jest.clearAllMocks());

  describe("POST /api/jobs/:id/save", () => {
    it("saves a job for a freelancer", async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({ id: "user-1", role: "FREELANCER" });
      (prismaMock.job.findUnique as jest.Mock).mockResolvedValue({ id: "clm1234567890123456789012" });
      (prismaMock.savedJob.findUnique as jest.Mock).mockResolvedValue(null);
      (prismaMock.savedJob.create as jest.Mock).mockResolvedValue({ id: "sj-1" });

      const res = await request(app)
        .post("/api/jobs/clm1234567890123456789012/save")
        .set(authHeader("user-1"));

      expect(res.status).toBe(201);
      expect(res.body.message).toBe("Job saved successfully.");
    });

    it("returns 403 if user is not a freelancer", async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({ id: "user-1", role: "CLIENT" });

      const res = await request(app)
        .post("/api/jobs/clm1234567890123456789012/save")
        .set(authHeader("user-1"));

      expect(res.status).toBe(403);
    });

    it("returns 409 if job is already saved", async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({ id: "user-1", role: "FREELANCER" });
      (prismaMock.job.findUnique as jest.Mock).mockResolvedValue({ id: "clm1234567890123456789012" });
      (prismaMock.savedJob.findUnique as jest.Mock).mockResolvedValue({ id: "sj-1" });

      const res = await request(app)
        .post("/api/jobs/clm1234567890123456789012/save")
        .set(authHeader("user-1"));

      expect(res.status).toBe(409);
    });
  });

  describe("DELETE /api/jobs/:id/save", () => {
    it("unsaves a job for a freelancer", async () => {
      (prismaMock.savedJob.findUnique as jest.Mock).mockResolvedValue({ id: "sj-1" });
      (prismaMock.savedJob.delete as jest.Mock).mockResolvedValue({ id: "sj-1" });

      const res = await request(app)
        .delete("/api/jobs/clm1234567890123456789012/save")
        .set(authHeader("user-1"));

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Job unsaved successfully.");
    });

    it("returns 404 if bookmark not found", async () => {
      (prismaMock.savedJob.findUnique as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .delete("/api/jobs/clm1234567890123456789012/save")
        .set(authHeader("user-1"));

      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/jobs/saved", () => {
    it("lists saved jobs for a freelancer", async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({ id: "user-1", role: "FREELANCER" });
      (prismaMock.savedJob.findMany as jest.Mock).mockResolvedValue([
        { jobId: "clm1234567890123456789012", job: { id: "clm1234567890123456789012", title: "Job 1", client: { id: "c1" }, _count: { applications: 0 } } }
      ]);
      (prismaMock.savedJob.count as jest.Mock).mockResolvedValue(1);

      const res = await request(app)
        .get("/api/jobs/saved")
        .set(authHeader("user-1"));

      expect(res.status).toBe(200);
      expect(res.body.data[0].isSaved).toBe(true);
      expect(res.body.data[0].id).toBe("clm1234567890123456789012");
    });

    it("returns 403 if not a freelancer", async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({ id: "user-1", role: "CLIENT" });

      const res = await request(app)
        .get("/api/jobs/saved")
        .set(authHeader("user-1"));

      expect(res.status).toBe(403);
    });
  });
});
