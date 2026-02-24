import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { app, httpServer } from "../../index";
import jwt from "jsonwebtoken";
import { config } from "../../config";

const prisma = new PrismaClient();

describe("Dispute Routes", () => {
  let clientToken: string;
  let freelancerToken: string;
  let voterToken: string;
  let clientId: string;
  let freelancerId: string;
  let voterId: string;
  let jobId: string;
  let disputeId: string;

  beforeAll(async () => {
    // Clean up test data
    await prisma.disputeVote.deleteMany({});
    await prisma.dispute.deleteMany({});
    await prisma.review.deleteMany({});
    await prisma.message.deleteMany({});
    await prisma.milestone.deleteMany({});
    await prisma.application.deleteMany({});
    await prisma.job.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ["client@test.com", "freelancer@test.com", "voter@test.com"],
        },
      },
    });

    // Create test users
    const client = await prisma.user.create({
      data: {
        walletAddress: "GCLIENT123",
        email: "client@test.com",
        username: "testclient",
        role: "CLIENT",
        password: "hashedpassword",
      },
    });
    clientId = client.id;
    clientToken = jwt.sign({ userId: clientId }, config.jwtSecret);

    const freelancer = await prisma.user.create({
      data: {
        walletAddress: "GFREELANCER123",
        email: "freelancer@test.com",
        username: "testfreelancer",
        role: "FREELANCER",
        password: "hashedpassword",
      },
    });
    freelancerId = freelancer.id;
    freelancerToken = jwt.sign({ userId: freelancerId }, config.jwtSecret);

    const voter = await prisma.user.create({
      data: {
        walletAddress: "GVOTER123",
        email: "voter@test.com",
        username: "testvoter",
        role: "FREELANCER",
        password: "hashedpassword",
      },
    });
    voterId = voter.id;
    voterToken = jwt.sign({ userId: voterId }, config.jwtSecret);

    // Create a test job
    const job = await prisma.job.create({
      data: {
        title: "Test Job for Dispute",
        description: "A job to test dispute functionality",
        budget: 1000,
        category: "Development",
        skills: ["JavaScript", "Node.js"],
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        clientId,
        freelancerId,
        status: "IN_PROGRESS",
      },
    });
    jobId = job.id;
  });

  afterAll(async () => {
    // Clean up
    await prisma.disputeVote.deleteMany({});
    await prisma.dispute.deleteMany({});
    await prisma.review.deleteMany({});
    await prisma.message.deleteMany({});
    await prisma.milestone.deleteMany({});
    await prisma.application.deleteMany({});
    await prisma.job.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ["client@test.com", "freelancer@test.com", "voter@test.com"],
        },
      },
    });
    await prisma.$disconnect();
    
    // Close the server
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  describe("POST /api/disputes", () => {
    it("should create a dispute when authenticated as job party", async () => {
      const response = await request(app)
        .post("/api/disputes")
        .set("Authorization", `Bearer ${clientToken}`)
        .send({
          jobId,
          reason: "The freelancer did not deliver the work as agreed upon in the contract.",
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
      expect(response.body.jobId).toBe(jobId);
      expect(response.body.clientId).toBe(clientId);
      expect(response.body.freelancerId).toBe(freelancerId);
      expect(response.body.initiatorId).toBe(clientId);
      expect(response.body.status).toBe("OPEN");
      disputeId = response.body.id;
    });

    it("should fail to create dispute without authentication", async () => {
      const response = await request(app)
        .post("/api/disputes")
        .send({
          jobId,
          reason: "Test reason",
        });

      expect(response.status).toBe(401);
    });

    it("should fail to create dispute if not a job party", async () => {
      const response = await request(app)
        .post("/api/disputes")
        .set("Authorization", `Bearer ${voterToken}`)
        .send({
          jobId,
          reason: "I am not part of this job but trying to create a dispute.",
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("Only job parties");
    });

    it("should fail to create duplicate dispute", async () => {
      const response = await request(app)
        .post("/api/disputes")
        .set("Authorization", `Bearer ${freelancerToken}`)
        .send({
          jobId,
          reason: "Another dispute for the same job.",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("active dispute already exists");
    });

    it("should fail with invalid reason (too short)", async () => {
      const newJob = await prisma.job.create({
        data: {
          title: "Another Job",
          description: "Test",
          budget: 500,
          category: "Design",
          skills: ["Photoshop"],
          deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          clientId,
          freelancerId,
          status: "IN_PROGRESS",
        },
      });

      const response = await request(app)
        .post("/api/disputes")
        .set("Authorization", `Bearer ${clientToken}`)
        .send({
          jobId: newJob.id,
          reason: "Short",
        });

      expect(response.status).toBe(400);

      // Clean up
      await prisma.job.delete({ where: { id: newJob.id } });
    });
  });

  describe("GET /api/disputes", () => {
    it("should list all disputes with pagination", async () => {
      const response = await request(app)
        .get("/api/disputes")
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(response.body).toHaveProperty("total");
      expect(response.body).toHaveProperty("page");
      expect(response.body).toHaveProperty("totalPages");
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it("should filter disputes by status", async () => {
      const response = await request(app)
        .get("/api/disputes")
        .query({ status: "OPEN", page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.data.every((d: any) => d.status === "OPEN")).toBe(true);
    });

    it("should filter disputes by jobId", async () => {
      const response = await request(app)
        .get("/api/disputes")
        .query({ jobId, page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.data.every((d: any) => d.jobId === jobId)).toBe(true);
    });

    it("should filter disputes by userId", async () => {
      const response = await request(app)
        .get("/api/disputes")
        .query({ userId: clientId, page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
    });
  });

  describe("GET /api/disputes/:id", () => {
    it("should get dispute details with votes", async () => {
      const response = await request(app).get(`/api/disputes/${disputeId}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(disputeId);
      expect(response.body).toHaveProperty("job");
      expect(response.body).toHaveProperty("client");
      expect(response.body).toHaveProperty("freelancer");
      expect(response.body).toHaveProperty("votes");
      expect(Array.isArray(response.body.votes)).toBe(true);
    });

    it("should return 404 for non-existent dispute", async () => {
      const response = await request(app).get("/api/disputes/nonexistent");

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/disputes/:id/votes", () => {
    it("should allow non-party user to vote", async () => {
      const response = await request(app)
        .post(`/api/disputes/${disputeId}/votes`)
        .set("Authorization", `Bearer ${voterToken}`)
        .send({
          choice: "FREELANCER",
          reason: "The freelancer provided sufficient evidence of work completion.",
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
      expect(response.body.disputeId).toBe(disputeId);
      expect(response.body.voterId).toBe(voterId);
      expect(response.body.choice).toBe("FREELANCER");
    });

    it("should reject vote from job party (client)", async () => {
      const response = await request(app)
        .post(`/api/disputes/${disputeId}/votes`)
        .set("Authorization", `Bearer ${clientToken}`)
        .send({
          choice: "CLIENT",
          reason: "I am the client trying to vote.",
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("Job parties cannot vote");
    });

    it("should reject vote from job party (freelancer)", async () => {
      const response = await request(app)
        .post(`/api/disputes/${disputeId}/votes`)
        .set("Authorization", `Bearer ${freelancerToken}`)
        .send({
          choice: "FREELANCER",
          reason: "I am the freelancer trying to vote.",
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("Job parties cannot vote");
    });

    it("should reject duplicate vote from same user", async () => {
      const response = await request(app)
        .post(`/api/disputes/${disputeId}/votes`)
        .set("Authorization", `Bearer ${voterToken}`)
        .send({
          choice: "CLIENT",
          reason: "Trying to vote again.",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("already voted");
    });

    it("should fail without authentication", async () => {
      const response = await request(app)
        .post(`/api/disputes/${disputeId}/votes`)
        .send({
          choice: "CLIENT",
          reason: "Voting without auth.",
        });

      expect(response.status).toBe(401);
    });
  });

  describe("PUT /api/disputes/:id/resolve", () => {
    it("should resolve dispute and update job status", async () => {
      const response = await request(app)
        .put(`/api/disputes/${disputeId}/resolve`)
        .set("Authorization", `Bearer ${clientToken}`)
        .send({
          resolution: "After reviewing the evidence and votes, the dispute is resolved in favor of the freelancer.",
          winningParty: "FREELANCER",
          onChainDisputeId: "dispute_123",
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("RESOLVED");
      expect(response.body.winningParty).toBe("FREELANCER");
      expect(response.body.resolution).toBeDefined();
      expect(response.body.resolvedAt).toBeDefined();

      // Verify job status was updated
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      expect(job?.status).toBe("COMPLETED");
    });

    it("should fail to resolve already resolved dispute", async () => {
      const response = await request(app)
        .put(`/api/disputes/${disputeId}/resolve`)
        .set("Authorization", `Bearer ${clientToken}`)
        .send({
          resolution: "Trying to resolve again.",
          winningParty: "CLIENT",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("already resolved");
    });

    it("should fail without authentication", async () => {
      const response = await request(app)
        .put(`/api/disputes/${disputeId}/resolve`)
        .send({
          resolution: "Test resolution",
          winningParty: "CLIENT",
        });

      expect(response.status).toBe(401);
    });
  });

  describe("Job status updates", () => {
    it("should set job to DISPUTED when dispute is created", async () => {
      const newJob = await prisma.job.create({
        data: {
          title: "Job for Status Test",
          description: "Testing status updates",
          budget: 800,
          category: "Writing",
          skills: ["Content Writing"],
          deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          clientId,
          freelancerId,
          status: "IN_PROGRESS",
        },
      });

      await request(app)
        .post("/api/disputes")
        .set("Authorization", `Bearer ${freelancerToken}`)
        .send({
          jobId: newJob.id,
          reason: "Client is not responding to messages and refusing to approve completed work.",
        });

      const updatedJob = await prisma.job.findUnique({ where: { id: newJob.id } });
      expect(updatedJob?.status).toBe("DISPUTED");

      // Clean up
      await prisma.dispute.deleteMany({ where: { jobId: newJob.id } });
      await prisma.job.delete({ where: { id: newJob.id } });
    });

    it("should set job to CANCELLED when client wins dispute", async () => {
      const newJob = await prisma.job.create({
        data: {
          title: "Job for Client Win",
          description: "Testing client win",
          budget: 600,
          category: "Marketing",
          skills: ["SEO"],
          deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          clientId,
          freelancerId,
          status: "IN_PROGRESS",
        },
      });

      const disputeResponse = await request(app)
        .post("/api/disputes")
        .set("Authorization", `Bearer ${clientToken}`)
        .send({
          jobId: newJob.id,
          reason: "Work was not delivered as specified.",
        });

      await request(app)
        .put(`/api/disputes/${disputeResponse.body.id}/resolve`)
        .set("Authorization", `Bearer ${clientToken}`)
        .send({
          resolution: "Client wins the dispute.",
          winningParty: "CLIENT",
        });

      const updatedJob = await prisma.job.findUnique({ where: { id: newJob.id } });
      expect(updatedJob?.status).toBe("CANCELLED");

      // Clean up
      await prisma.dispute.deleteMany({ where: { jobId: newJob.id } });
      await prisma.job.delete({ where: { id: newJob.id } });
    });
  });
});
