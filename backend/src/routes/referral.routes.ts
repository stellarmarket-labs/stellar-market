import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest } from "../middleware/auth";
import { asyncHandler } from "../middleware/error";

const router = Router();
const prisma = new PrismaClient();

/**
 * @swagger
 * /referrals/stats:
 *   get:
 *     summary: Get referral stats for the authenticated user
 *     tags: [Referrals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Referral statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 referralCode:
 *                   type: string
 *                 totalReferrals:
 *                   type: number
 *                 bonusEarned:
 *                   type: number
 *                 referrals:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       username:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/stats",
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        referralCode: true,
        referralBonusEarned: true,
        referrals: {
          select: { id: true, username: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({
      referralCode: user.referralCode,
      totalReferrals: user.referrals.length,
      bonusEarned: user.referralBonusEarned,
      referrals: user.referrals,
    });
  }),
);

export default router;
