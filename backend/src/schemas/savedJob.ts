import { z } from "zod";

export const getSavedJobsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
});

export const savedJobParamSchema = z.object({
  id: z.string().cuid("Invalid job ID format").or(z.string().min(1)), // Allowing non-cuid for now if needed, but the requirement said cuid.
});
