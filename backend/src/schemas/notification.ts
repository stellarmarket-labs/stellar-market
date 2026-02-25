import { z } from "zod";

export const getNotificationsQuerySchema = z.object({
    page: z.string().optional().default("1").transform(Number),
    limit: z.string().optional().default("20").transform(Number),
});

export const getNotificationByIdParamSchema = z.object({
    id: z.string().cuid(),
});
