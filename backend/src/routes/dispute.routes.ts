import { Router, Request, Response } from "express";
import { DisputeStatus, UserRole } from "@prisma/client";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authenticate, AuthRequest } from "../middleware/auth";
import { asyncHandler } from "../middleware/error";
import { validate } from "../middleware/validation";
import { DisputeService } from "../services/dispute.service";
import {
  confirmDisputeTransactionSchema,
  createDisputeSchema,
  castVoteSchema,
  disputeIdParamSchema,
  initRaiseDisputeSchema,
  queryDisputesSchema,
  resolveDisputeSchema,
  webhookPayloadSchema,
} from "../schemas/dispute";
import { UPLOAD_DIR } from "../config/upload";

const evidenceUploadDir = path.join(UPLOAD_DIR, "dispute-evidence");
if (!fs.existsSync(evidenceUploadDir)) {
  fs.mkdirSync(evidenceUploadDir, { recursive: true });
}

const evidenceStorage = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, evidenceUploadDir),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});

/**
 * GET /api/disputes/history
 * Get user's dispute history (initiated or involved)
 */
router.get(
  "/history",
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const {
      filter = "all",
      sortBy = "recent",
      page = 1,
      limit = 20,
    } = req.query;
    const userId = req.userId!;

    const disputes = await DisputeService.getUserDisputeHistory(
      userId,
      filter as "all" | "initiated" | "involved",
      sortBy as "recent" | "oldest",
      { page: Number(page), limit: Number(limit) },
    );

    res.json(disputes);
  }),
);

/**
 * GET /api/disputes
 * Get all disputes with optional filtering and pagination
 */
router.get(
  "/",
  authenticate,
  validate({ query: queryDisputesSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const query = req.query as unknown as { page: number; limit: number };

    const result = await DisputeService.getDisputes(
      { status: DisputeStatus.OPEN },
      { page: query.page, limit: query.limit },
    );

    const disputes = (result.disputes as any[]).map((dispute: any) => {
      const { walletAddress: _clientWalletAddress, ...client } = dispute.client;
      const { walletAddress: _freelancerWalletAddress, ...freelancer } =
        dispute.freelancer;
      const { walletAddress: _initiatorWalletAddress, ...initiator } =
        dispute.initiator;

      return {
        ...dispute,
        client,
        freelancer,
        initiator,
      };
    });

    // Community listing returns array for frontend compatibility
    res.json(disputes);
  }),
);

/**
 * GET /api/disputes/:id
 * Get specific dispute details
 */
router.get(
  "/:id",
  authenticate,
  validate({ params: disputeIdParamSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const dispute = (await DisputeService.getDisputeById(
      req.params.id as string,
    )) as any;

    const userId = req.userId!;
    const isParticipant =
      dispute.clientId === userId ||
      dispute.freelancerId === userId ||
      dispute.initiatorId === userId;

    const isRegisteredVoter = Array.isArray(dispute.votes)
      ? dispute.votes.some((vote: any) => vote.voterId === userId)
      : false;
    const isAdmin = req.userRole === UserRole.ADMIN;

    if (!isParticipant && !isRegisteredVoter && !isAdmin) {
      res.status(403).json({
        error:
          "Access denied. Only dispute participants or registered voters can view this dispute.",
      });
      return;
    }

    res.json(dispute);
  }),
);

/**
 * POST /api/disputes
 * Create a new dispute
 */
router.post(
  "/",
  authenticate,
  validate({ body: createDisputeSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = req.body as { jobId: string; reason: string };

    const dispute = await DisputeService.createDispute(
      data.jobId,
      req.userId!,
      data.reason,
    );

    res.status(201).json(dispute);
  }),
);

/**
 * POST /api/disputes/init-raise
 * Initialize dispute creation (get XDR for signing)
 */
router.post(
  "/init-raise",
  authenticate,
  validate({ body: initRaiseDisputeSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { jobId, reason, minVotes } = req.body;

    const dispute = await DisputeService.initRaiseDispute(
      jobId,
      req.userId!,
      reason,
      minVotes,
    );

    res.json(dispute);
  }),
);

/**
 * POST /api/disputes/confirm-tx
 * Confirm dispute transaction
 */
router.post(
  "/confirm-tx",
  authenticate,
  validate({ body: confirmDisputeTransactionSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { hash, type, jobId, onChainDisputeId, respondentId, reason } =
      req.body;

    const result = await DisputeService.confirmDisputeTransaction(
      hash,
      type,
      jobId,
      onChainDisputeId,
      respondentId,
      reason,
      req.userId!,
    );

    res.json(result);
  }),
);

/**
 * POST /api/disputes/:id/votes
 * Cast a vote on a dispute
 */
router.post(
  "/:id/votes",
  authenticate,
  validate({ params: disputeIdParamSchema, body: castVoteSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const dispute = await DisputeService.getDisputeById(
      req.params.id as string,
    );
    if (!dispute) {
      return res.status(404).json({ error: "Dispute not found." });
    }

    // Conflict-of-interest check: Job participants cannot vote
    if (
      dispute.job.clientId === req.userId ||
      dispute.job.freelancerId === req.userId
    ) {
      return res.status(403).json({
        error:
          "Job participants (client or freelancer) cannot vote on their own dispute.",
      });
    }
    const data = req.body as {
      choice: "CLIENT" | "FREELANCER";
      reason: string;
    };

    const vote = await DisputeService.castVote(
      req.params.id as string,
      req.userId!,
      data.choice,
      data.reason,
    );

    res.status(201).json(vote);
  }),
);

/**
 * PUT /api/disputes/:id/resolve
 * Resolve a dispute (admin only or automated)
 */
router.put(
  "/:id/resolve",
  authenticate,
  validate({ params: disputeIdParamSchema, body: resolveDisputeSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = req.body as { outcome: string };

    const dispute = await DisputeService.resolveDispute(
      req.params.id as string,
      data.outcome,
    );

    res.json(dispute);
  }),
);

/**
 * GET /api/disputes/:id/stats
 * Get vote statistics for a dispute
 */
router.get(
  "/:id/stats",
  validate({ params: disputeIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const stats = await DisputeService.getVoteStats(req.params.id as string);
    res.json(stats);
  }),
);

/**
 * POST /api/disputes/webhook
 * Process blockchain webhook events
 */
router.post(
  "/webhook",
  validate({ body: webhookPayloadSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const payload = req.body;

    const result = await DisputeService.processWebhook(payload);

    res.json(result);
  }),
);

/**
 * POST /api/disputes/:id/evidence
 * Upload evidence files for a dispute, hash them, and build Merkle tree
 */
router.post(
  "/:id/evidence",
  authenticate,
  validate({ params: disputeIdParamSchema }),
  evidenceStorage.array("files", 5),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const mappedFiles = files.map((f) => ({
      buffer: fs.readFileSync(f.path),
      originalName: f.originalname,
      mimeType: f.mimetype,
      size: f.size,
      savedPath: f.path,
      filename: f.filename,
    }));

    const result = await DisputeService.uploadEvidence(
      req.params.id as string,
      mappedFiles,
      req.userId!,
    );

    res.status(201).json(result);
  }),
);

/**
 * GET /api/disputes/:id/evidence
 * Get all evidence records for a dispute
 */
router.get(
  "/:id/evidence",
  authenticate,
  validate({ params: disputeIdParamSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await DisputeService.getDisputeEvidence(
      req.params.id as string,
    );
    res.json(result);
  }),
);

/**
 * GET /api/disputes/:id/evidence/:evidenceId/proof
 * Get Merkle proof data for a specific evidence file
 */
router.get(
  "/:id/evidence/:evidenceId/proof",
  authenticate,
  validate({ params: disputeIdParamSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await DisputeService.getEvidenceProof(
      req.params.id as string,
      req.params.evidenceId as string,
    );
    res.json(result);
  }),
);

export default router;
