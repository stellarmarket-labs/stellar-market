import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// Send a message (kept for REST fallback)
router.post("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { receiverId, jobId, content } = req.body;

    if (!receiverId || !content) {
      res.status(400).json({ error: "Receiver and content are required." });
      return;
    }

    const message = await prisma.message.create({
      data: {
        senderId: req.userId!,
        receiverId,
        jobId: jobId || null,
        content,
      },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
        receiver: { select: { id: true, username: true, avatarUrl: true } },
      },
    });

    res.status(201).json(message);
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Get unread message count for the current user (used by Navbar badge)
router.get("/unread-count", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const count = await prisma.message.count({
      where: {
        receiverId: req.userId!,
        read: false,
      },
    });

    res.json({ count });
  } catch (error) {
    console.error("Unread count error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Get list of conversations for the current user (distinct partners) — used by Socket-based chat UI
router.get("/conversations", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const messages = await prisma.message.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
        receiver: { select: { id: true, username: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const conversationMap = new Map<
      string,
      {
        partner: { id: string; username: string; avatarUrl: string | null };
        lastMessage: (typeof messages)[number];
        unreadCount: number;
      }
    >();

    for (const msg of messages) {
      const partner = msg.senderId === userId ? msg.receiver : msg.sender;
      const partnerId = partner.id;

      if (!conversationMap.has(partnerId)) {
        conversationMap.set(partnerId, {
          partner,
          lastMessage: msg,
          unreadCount: 0,
        });
      }

      if (msg.senderId === partnerId && !msg.read) {
        const convo = conversationMap.get(partnerId)!;
        convo.unreadCount += 1;
      }
    }

    const conversations = Array.from(conversationMap.values());
    res.json(conversations);
  } catch (error) {
    console.error("Conversations error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Get conversation list OR conversation history (if jobId and participantId are provided)
router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { jobId, participantId } = req.query;

    if (participantId) {
      const messages = await prisma.message.findMany({
        where: {
          AND: [
            jobId ? { jobId: jobId as string } : {},
            {
              OR: [
                { senderId: req.userId!, receiverId: participantId as string },
                { senderId: participantId as string, receiverId: req.userId! },
              ],
            },
          ],
        },
        include: {
          sender: { select: { id: true, username: true, avatarUrl: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      res.json(messages);
      return;
    }

    // Fetch all messages involving the user to construct conversation list
    const allMessages = await prisma.message.findMany({
      where: {
        OR: [{ senderId: req.userId! }, { receiverId: req.userId! }],
      },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
        receiver: { select: { id: true, username: true, avatarUrl: true } },
        job: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const conversationsMap = new Map();

    allMessages.forEach((msg: any) => {
      const otherUser = msg.senderId === req.userId ? msg.receiver : msg.sender;
      const key = `${otherUser.id}-${msg.jobId || "no-job"}`;

      if (!conversationsMap.has(key)) {
        conversationsMap.set(key, {
          id: key,
          otherUser,
          job: msg.job,
          lastMessage: msg,
          unreadCount: 0,
        });
      }

      if (msg.receiverId === req.userId && !msg.read) {
        conversationsMap.get(key).unreadCount++;
      }
    });

    res.json(Array.from(conversationsMap.values()));
  } catch (error) {
    console.error("Get conversations error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Get conversation with a specific user (legacy/direct) — also marks as read
router.get(
  "/:userId",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const otherUserId = req.params.userId as string;
      const { jobId } = req.query;

      const messages = await prisma.message.findMany({
        where: {
          AND: [
            jobId ? { jobId: jobId as string } : {},
            {
              OR: [
                { senderId: req.userId!, receiverId: otherUserId },
                { senderId: otherUserId, receiverId: req.userId! },
              ],
            },
          ],
        },
        include: {
          sender: { select: { id: true, username: true, avatarUrl: true } },
        },
        orderBy: { createdAt: "asc" },
      });

      // Mark messages as read
      await prisma.message.updateMany({
        where: {
          senderId: otherUserId,
          receiverId: req.userId!,
          jobId: jobId ? (jobId as string) : undefined,
          read: false,
        },
        data: { read: true },
      });

      res.json(messages);
    } catch (error) {
      console.error("Get messages error:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  },
);

// Mark a specific message as read
router.put(
  "/:id/read",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      await prisma.message.update({
        where: {
          id: id as string,
          receiverId: req.userId!,
        },
        data: { read: true },
      });
      res.status(204).send();
    } catch (error) {
      console.error("Mark as read error:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  },
);

export default router;
