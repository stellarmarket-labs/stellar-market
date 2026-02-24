import { z } from "zod";

export const createDisputeSchema = z.object({
  jobId: z.string().min(1, "Job ID is required"),
  reason: z.string().min(10, "Reason must be at least 10 characters").max(1000, "Reason must not exceed 1000 characters"),
});

export const getDisputeByIdParamSchema = z.object({
  id: z.string().min(1, "Dispute ID is required"),
});

export const getDisputesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.string().optional(),
  jobId: z.string().optional(),
  userId: z.string().optional(),
});

export const createDisputeVoteSchema = z.object({
  choice: z.enum(["CLIENT", "FREELANCER"]),
  reason: z.string().min(10, "Reason must be at least 10 characters").max(500, "Reason must not exceed 500 characters").optional(),
});

export const resolveDisputeSchema = z.object({
  resolution: z.string().min(10, "Resolution must be at least 10 characters").max(1000, "Resolution must not exceed 1000 characters"),
  winningParty: z.enum(["CLIENT", "FREELANCER"]),
  onChainDisputeId: z.string().optional(),
});
