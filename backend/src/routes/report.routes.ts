```ts
import { Router, Response, Request, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { asyncHandler } from "../middleware/error";
import { validate } from "../middleware/validation";
import RedisClient from "../lib/redis";
import { NotificationService } from "../services/notification.service";
import { logger } from "../lib/logger";

const router = Router();
const prisma = new PrismaClient();

const REPORT_WINDOW_LIMIT = 10;
const REPORT_WINDOW_TTL_S = 24 * 60 * 60;
const AUTO_FLAG_THRESHOLD = 3;

const isTest = process.env.NODE_ENV === "test";

const bypassLimiter = (_req: Request, _res: Response, next: NextFunction) => next();

const reportRateLimiter = isTest
  ? bypassLimiter
  : rateLimit({
      windowMs: 60 * 60 * 1000,
      max: 5,
      keyGenerator: (req: Request) => {
        const userId = (req as AuthRequest).userId;
        if (userId) return String(userId);

        const ip =
          req.ip ||
          req.socket?.remoteAddress ||
          (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          "anon";

        return ip.replace(/^::ffff:/i, "");
      },
      validate: { ip: false },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({
          error: "Report limit reached — max 5 reports per hour",
        });
      },
    });

const TARGET_TYPES = ["JOB", "USER", "MESSAGE"] as const;

const createReportSchema = z.object({
  targetType: z.enum(TARGET_TYPES),
  targetId: z.string().min(1),
  reason: z.string().min(10).max(1000),
});

function reporterCountKey(reporterId: string): string {
  return `reporter:24h:${reporterId}`;
}

async function incrementReporterCount(reporterId: string): Promise<number> {
  try {
    if (!RedisClient.isRedisConnected()) {
      await RedisClient.connect();
    }
    const redis = RedisClient.getInstance();
    const key = reporterCountKey(reporterId);

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, REPORT_WINDOW_TTL_S);
    }
    return count;
  } catch (err) {
    logger.warn({ err }, "Redis unavailable — skipping abuse check");
    return 0;
  }
}

async function notifyAdminsOfSuspiciousReporter(reporterId: string) {
  try {
    const admins = await (prisma.user as any).findMany({
      where: { role: "ADMIN" },
      select: { id: true },
    });

    await Promise.all(
      admins.map((admin: any) =>
        NotificationService.sendNotification({
          userId: admin.id,
          type: "DISPUTE_RAISED",
          title: "Suspicious Reporter Flagged",
          message: `User ${reporterId} exceeded report threshold`,
          metadata: { reporterId },
        })
      )
    );
  } catch (err) {
    logger.error({ err }, "Failed to notify admins");
  }
}

router.post(
  "/",
  authenticate,
  reportRateLimiter,
  validate({ body: createReportSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const reporterId = req.userId!;
    const { targetType, targetId, reason } = req.body;

    const reporter = await (prisma.user as any).findUnique({
      where: { id: reporterId },
      select: { isSuspiciousReporter: true },
    });

    const alreadySuspicious = reporter?.isSuspiciousReporter ?? false;

    const reportCount = await incrementReporterCount(reporterId);

    const requiresReview =
      alreadySuspicious || reportCount > REPORT_WINDOW_LIMIT;

    const report = await (prisma as any).report.create({
      data: {
        reporterId,
        targetType,
        targetId,
        reason,
        requiresReview,
      },
    });

    if (!alreadySuspicious && reportCount >= REPORT_WINDOW_LIMIT) {
      await (prisma.user as any).update({
        where: { id: reporterId },
        data: { isSuspiciousReporter: true },
      });

      await notifyAdminsOfSuspiciousReporter(reporterId);
    }

    if (targetType === "USER" && !requiresReview) {
      const pendingCount = await (prisma as any).report.count({
        where: { targetId, targetType: "USER", status: "PENDING" },
      });

      if (pendingCount >= AUTO_FLAG_THRESHOLD) {
        await (prisma.user as any).update({
          where: { id: targetId },
          data: {
            isFlagged: true,
            flagReason: `Auto-flagged: ${pendingCount} reports`,
          },
        });
      }
    }

    res.status(201).json({
      report,
      ...(requiresReview && {
        notice: "Report submitted for admin review",
      }),
    });
  })
);

export default router;
```

