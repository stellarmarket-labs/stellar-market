import { Router, Request, Response } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { asyncHandler } from "../middleware/error";
import { DisputeService } from "../services/dispute.service";
import { 
  createDisputeSchema, 
  castVoteSchema, 
  queryDisputesSchema, 
  resolveDisputeSchema,
  webhookPayloadSchema 
} from "../schemas/dispute";

const router = Router();

/**
 * GET /api/disputes
 * Get all disputes with optional filtering and pagination
 */
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const query = queryDisputesSchema.parse(req.query);
    
    const result = await DisputeService.getDisputes(
      { status: query.status },
      { page: query.page, limit: query.limit }
    );

    res.json(result);
  })
);

/**
 * GET /api/disputes/:id
 * Get specific dispute details
 */
router.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const dispute = await DisputeService.getDisputeById(req.params.id as string);
    res.json(dispute);
  })
);

/**
 * POST /api/disputes
 * Create a new dispute
 */
router.post(
  "/",
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createDisputeSchema.parse(req.body);
    
    const dispute = await DisputeService.createDispute(
      data.jobId,
      req.userId!,
      data.reason
    );

    res.status(201).json(dispute);
  })
);

/**
 * POST /api/disputes/:id/votes
 * Cast a vote on a dispute
 */
router.post(
  "/:id/votes",
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = castVoteSchema.parse(req.body);
    
    const vote = await DisputeService.castVote(
      req.params.id as string,
      req.userId!,
      data.choice,
      data.reason
    );

    res.status(201).json(vote);
  })
);

/**
 * PUT /api/disputes/:id/resolve
 * Resolve a dispute (admin only or automated)
 */
router.put(
  "/:id/resolve",
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = resolveDisputeSchema.parse(req.body);
    
    const dispute = await DisputeService.resolveDispute(
      req.params.id as string,
      data.outcome
    );

    res.json(dispute);
  })
);

/**
 * GET /api/disputes/:id/stats
 * Get vote statistics for a dispute
 */
router.get(
  "/:id/stats",
  asyncHandler(async (req: Request, res: Response) => {
    const stats = await DisputeService.getVoteStats(req.params.id as string);
    res.json(stats);
  })
);

/**
 * POST /api/disputes/webhook
 * Process blockchain webhook events
 */
router.post(
  "/webhook",
  asyncHandler(async (req: Request, res: Response) => {
    const payload = webhookPayloadSchema.parse(req.body);
    
    const result = await DisputeService.processWebhook(payload);
    
    res.json(result);
  })
);

export default router;
