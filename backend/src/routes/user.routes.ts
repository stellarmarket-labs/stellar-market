import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// Get user profile by ID
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id;

    const user = await prisma.user.findUnique({
      where: { id: userId as string },
      select: {
        id: true,
        username: true,
        walletAddress: true,
        bio: true,
        avatarUrl: true,
        role: true,
        createdAt: true,
        reviewsReceived: {
          include: {
            reviewer: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        clientJobs: {
          where: { status: "COMPLETED" },
          orderBy: { updatedAt: "desc" },
        },
        freelancerJobs: {
          where: { status: "COMPLETED" },
          orderBy: { updatedAt: "desc" },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    // Calculate aggregate rating
    const ratings: number[] = user.reviewsReceived.map((r: any) => r.rating);
    const averageRating =
      ratings.length > 0
        ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length
        : 0;

    res.json({
      ...user,
      averageRating: parseFloat(averageRating.toFixed(1)),
      reviewCount: ratings.length,
    });
  } catch (error) {
    console.error("Get user profile error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

export default router;
