import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { asyncHandler } from "../middleware/error";
import {
  createDisputeSchema,
  getDisputeByIdParamSchema,
  getDisputesQuerySchema,
  createDisputeVoteSchema,
  resolveDisputeSchema,
} from "../schemas";

const router = Router();
const prisma = new PrismaClient();

// Create a new dispute
router.post(
  "/",
  authenticate,
  validate({ body: createDisputeSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { jobId, reason } = req.body;
    const userId = req.userId!;

    // Fetch the job
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { disputes: true },
    });

    if (!job) {
      return res.status(404).json({ error: "Job not found." });
    }

    // Check if user is a party to the job
    if (job.clientId !== userId && job.freelancerId !== userId) {
      return res.status(403).json({ error: "Only job parties can create a dispute." });
    }

    // Check if freelancer is assigned
    if (!job.freelancerId) {
      return res.status(400).json({ error: "Cannot create dispute for a job without an assigned freelancer." });
    }

    // Check if there's already an open dispute
    const existingDispute = job.disputes.find(
      (d) => d.status === "OPEN" || d.status === "VOTING" || d.status === "APPEALED"
    );
    if (existingDispute) {
      return res.status(400).json({ error: "An active dispute already exists for this job." });
    }

    // Create the dispute
    const dispute = await prisma.dispute.create({
      data: {
        jobId,
        clientId: job.clientId,
        freelancerId: job.freelancerId,
        initiatorId: userId,
        reason,
      },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
        client: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
        freelancer: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
        initiator: {
          select: {
            id: true,
            username: true,
          },
        },
        votes: true,
      },
    });

    // Update job status to DISPUTED
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "DISPUTED" },
    });

    res.status(201).json(dispute);
  })
);

// Get all disputes with filters and pagination
router.get(
  "/",
  validate({ query: getDisputesQuerySchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { page, limit, status, jobId, userId } = req.query as any;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (status) {
      const statusList = (status as string).split(",").map((s: string) => s.trim());
      if (statusList.length === 1) {
        where.status = statusList[0];
      } else {
        where.status = { in: statusList };
      }
    }

    if (jobId) {
      where.jobId = jobId;
    }

    if (userId) {
      where.OR = [
        { clientId: userId },
        { freelancerId: userId },
        { initiatorId: userId },
      ];
    }

    const [disputes, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        include: {
          job: {
            select: {
              id: true,
              title: true,
              status: true,
              budget: true,
            },
          },
          client: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
            },
          },
          freelancer: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
            },
          },
          initiator: {
            select: {
              id: true,
              username: true,
            },
          },
          _count: {
            select: { votes: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.dispute.count({ where }),
    ]);

    res.json({
      data: disputes,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  })
);

// Get a single dispute by ID
router.get(
  "/:id",
  validate({ params: getDisputeByIdParamSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;

    const dispute = await prisma.dispute.findUnique({
      where: { id },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            budget: true,
            deadline: true,
          },
        },
        client: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            email: true,
          },
        },
        freelancer: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            email: true,
          },
        },
        initiator: {
          select: {
            id: true,
            username: true,
          },
        },
        votes: {
          include: {
            voter: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!dispute) {
      return res.status(404).json({ error: "Dispute not found." });
    }

    res.json(dispute);
  })
);

// Submit a vote on a dispute
router.post(
  "/:id/votes",
  authenticate,
  validate({
    params: getDisputeByIdParamSchema,
    body: createDisputeVoteSchema,
  }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const disputeId = req.params.id as string;
    const { choice, reason } = req.body;
    const voterId = req.userId!;

    // Fetch the dispute
    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        votes: true,
      },
    });

    if (!dispute) {
      return res.status(404).json({ error: "Dispute not found." });
    }

    // Check if dispute is open for voting
    if (dispute.status !== "OPEN" && dispute.status !== "VOTING") {
      return res.status(400).json({ error: "This dispute is not open for voting." });
    }

    // Check if voter is a job party (they should not be allowed to vote)
    if (voterId === dispute.clientId || voterId === dispute.freelancerId) {
      return res.status(403).json({ error: "Job parties cannot vote on their own dispute." });
    }

    // Check if user has already voted
    const existingVote = dispute.votes.find((v) => v.voterId === voterId);
    if (existingVote) {
      return res.status(400).json({ error: "You have already voted on this dispute." });
    }

    // Create the vote
    const vote = await prisma.disputeVote.create({
      data: {
        disputeId,
        voterId,
        choice,
        reason,
      },
      include: {
        voter: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Update dispute status to VOTING if it was OPEN
    if (dispute.status === "OPEN") {
      await prisma.dispute.update({
        where: { id: disputeId },
        data: { status: "VOTING" },
      });
    }

    res.status(201).json(vote);
  })
);

// Resolve a dispute (admin/system action)
router.put(
  "/:id/resolve",
  authenticate,
  validate({
    params: getDisputeByIdParamSchema,
    body: resolveDisputeSchema,
  }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const disputeId = req.params.id as string;
    const { resolution, winningParty, onChainDisputeId } = req.body;

    // Fetch the dispute
    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        job: true,
      },
    });

    if (!dispute) {
      return res.status(404).json({ error: "Dispute not found." });
    }

    // Check if dispute is already resolved
    if (dispute.status === "RESOLVED") {
      return res.status(400).json({ error: "This dispute is already resolved." });
    }

    // Update the dispute
    const updatedDispute = await prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: "RESOLVED",
        resolution,
        winningParty,
        resolvedAt: new Date(),
        onChainDisputeId: onChainDisputeId || dispute.onChainDisputeId,
      },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
        client: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
        freelancer: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
        votes: {
          include: {
            voter: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    // Update job status based on resolution
    // If client wins, job might be cancelled or refunded
    // If freelancer wins, job might be completed
    const newJobStatus = winningParty === "FREELANCER" ? "COMPLETED" : "CANCELLED";
    await prisma.job.update({
      where: { id: dispute.jobId },
      data: { status: newJobStatus },
    });

    res.json(updatedDispute);
  })
);

// Webhook endpoint for on-chain dispute updates
router.post(
  "/webhook/on-chain-update",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { onChainDisputeId, status, winningParty, signature } = req.body;

    // TODO: Verify webhook signature for security
    // if (!verifyWebhookSignature(signature, req.body)) {
    //   return res.status(401).json({ error: "Invalid signature" });
    // }

    if (!onChainDisputeId) {
      return res.status(400).json({ error: "onChainDisputeId is required" });
    }

    // Find dispute by on-chain ID
    const dispute = await prisma.dispute.findUnique({
      where: { onChainDisputeId },
    });

    if (!dispute) {
      return res.status(404).json({ error: "Dispute not found" });
    }

    // Map on-chain status
    const statusMap: Record<string, "OPEN" | "VOTING" | "RESOLVED" | "APPEALED"> = {
      open: "OPEN",
      voting: "VOTING",
      resolved: "RESOLVED",
      appealed: "APPEALED",
    };

    const mappedStatus = statusMap[status?.toLowerCase()] || dispute.status;

    // Update dispute
    const updateData: any = { status: mappedStatus };
    if (mappedStatus === "RESOLVED") {
      updateData.resolvedAt = new Date();
      if (winningParty) {
        updateData.winningParty = winningParty;
      }
    }

    const updated = await prisma.dispute.update({
      where: { id: dispute.id },
      data: updateData,
    });

    // Update job status if resolved
    if (mappedStatus === "RESOLVED" && winningParty) {
      const newJobStatus = winningParty === "FREELANCER" ? "COMPLETED" : "CANCELLED";
      await prisma.job.update({
        where: { id: dispute.jobId },
        data: { status: newJobStatus },
      });
    }

    res.json({ success: true, dispute: updated });
  })
);

export default router;
