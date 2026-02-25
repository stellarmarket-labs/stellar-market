import { z } from "zod";

export const flagJobSchema = z.object({
    flagReason: z.string().min(1, "Flag reason is required").max(500, "Flag reason must be less than 500 characters"),
});

export const suspendUserSchema = z.object({
    suspendReason: z.string().min(1, "Suspension reason is required").max(500, "Suspension reason must be less than 500 characters"),
});

export type FlagJobInput = z.infer<typeof flagJobSchema>;
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;
