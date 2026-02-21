import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

const updateMilestoneStatusSchema = z.object({
  status: z.enum(["IN_PROGRESS", "SUBMITTED", "APPROVED", "REJECTED"]),
});

// Valid status transitions per role
const freelancerTransitions: Record<string, string[]> = {
  PENDING: ["IN_PROGRESS", "SUBMITTED"],
  IN_PROGRESS: ["SUBMITTED"],
};

const clientTransitions: Record<string, string[]> = {
  SUBMITTED: ["APPROVED", "REJECTED"],
};

// List milestones for a job
router.get("/jobs/:jobId/milestones", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const jobId = req.params.jobId as string;

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      res.status(404).json({ error: "Job not found." });
      return;
    }

    const milestones = await prisma.milestone.findMany({
      where: { jobId },
      orderBy: { order: "asc" },
    });

    res.json(milestones);
  } catch (error) {
    console.error("Get milestones error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Update milestone status
router.put("/milestones/:id/status", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updateMilestoneStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Status must be IN_PROGRESS, SUBMITTED, APPROVED, or REJECTED." });
      return;
    }

    const { status } = parsed.data;
    const milestoneId = req.params.id as string;

    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: { job: true },
    });

    if (!milestone) {
      res.status(404).json({ error: "Milestone not found." });
      return;
    }

    const job = milestone.job;
    const isClient = job.clientId === req.userId;
    const isFreelancer = job.freelancerId === req.userId;

    if (!isClient && !isFreelancer) {
      res.status(403).json({ error: "Not authorized to update this milestone." });
      return;
    }

    // Determine allowed transitions based on role
    const currentStatus = milestone.status;
    const allowedStatuses = isFreelancer
      ? freelancerTransitions[currentStatus] || []
      : clientTransitions[currentStatus] || [];

    if (!allowedStatuses.includes(status)) {
      res.status(403).json({
        error: isFreelancer
          ? "Freelancer can only move milestones to IN_PROGRESS or SUBMITTED."
          : "Client can only APPROVE or REJECT a submitted milestone.",
      });
      return;
    }

    const updated = await prisma.milestone.update({
      where: { id: milestoneId },
      data: { status },
    });

    // Auto-complete job when all milestones are approved
    if (status === "APPROVED") {
      const allMilestones = await prisma.milestone.findMany({
        where: { jobId: job.id },
      });

      const allApproved = allMilestones.every((m) => m.status === "APPROVED");
      if (allApproved) {
        await prisma.job.update({
          where: { id: job.id },
          data: { status: "COMPLETED" },
        });
      }
    }

    res.json(updated);
  } catch (error) {
    console.error("Update milestone status error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

export default router;
