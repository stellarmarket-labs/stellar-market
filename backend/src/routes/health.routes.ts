import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { getHealthStatus } from "../lib/health";

const router = Router();
const prisma = new PrismaClient();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Deep dependency health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: All critical dependencies healthy (horizon listener may be degraded)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [ok, degraded]
 *                 service:
 *                   type: string
 *                 uptime:
 *                   type: number
 *                 checks:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: string
 *                       enum: [ok, error]
 *                     redis:
 *                       type: string
 *                       enum: [ok, error]
 *                     horizonListener:
 *                       type: string
 *                       enum: [ok, degraded]
 *       503:
 *         description: One or more critical dependencies (DB, Redis) are unhealthy
 */
router.get("/", async (_req, res) => {
  const health = await getHealthStatus(prisma);
  const httpStatus = health.checks.database === "error" || health.checks.redis === "error"
    ? 503
    : 200;
  res.status(httpStatus).json(health);
});

export default router;
