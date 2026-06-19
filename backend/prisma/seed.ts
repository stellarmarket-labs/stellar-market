/**
 * Database seeding script for local development and staging.
 *
 * Usage:
 *   npx prisma db seed              # idempotent seed (safe to run repeatedly)
 *   npx prisma db seed -- --reset   # truncate all tables, then seed from scratch
 *
 * Idempotency: every record uses a fixed, deterministic primary key and is written
 * with `upsert`, so running the seed twice produces the exact same row counts.
 *
 * Fixture accounts and their passwords are documented in docs/dev-accounts.md.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// --- Fixture passwords (dev only — documented in docs/dev-accounts.md) ---------
const CLIENT_PASSWORD = "Client123!";
const FREELANCER_PASSWORD = "Freelancer123!";

// Job categories — must match backend/src/routes/categories.routes.ts
const CATEGORIES = [
  "Frontend",
  "Backend",
  "Smart Contract",
  "Design",
  "Mobile",
  "Documentation",
  "DevOps",
] as const;

const CLIENT_COUNT = 5;
const FREELANCER_COUNT = 10;
const JOB_COUNT = 20;

/**
 * Tables truncated by the --reset flag. Order does not matter because we use
 * RESTART IDENTITY CASCADE, but we list the data tables explicitly for clarity.
 */
const TRUNCATE_TABLES = [
  "WebhookDelivery",
  "Webhook",
  "RefreshToken",
  "PortfolioItem",
  "Badge",
  "Report",
  "Service",
  "SavedJob",
  "DisputeVote",
  "Dispute",
  "AuditLog",
  "Notification",
  "Attachment",
  "Transaction",
  "Review",
  "Message",
  "Application",
  "DeadlineExtensionRequest",
  "Milestone",
  "Job",
  "NotificationPreference",
  "User",
];

/** Build a deterministic, schema-valid Stellar address (G + 55 [A-Z0-9]). */
function devWallet(seed: string): string {
  const body = seed
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .padEnd(55, "X")
    .slice(0, 55);
  return `G${body}`;
}

/** Deterministic deadline N days from a fixed epoch (no Date.now → stable seed). */
const BASE_DATE = new Date("2026-01-01T00:00:00.000Z");
function daysFromBase(days: number): Date {
  return new Date(BASE_DATE.getTime() + days * 24 * 60 * 60 * 1000);
}

type Role = "CLIENT" | "FREELANCER";

interface SeedUser {
  id: string;
  username: string;
  email: string;
  role: Role;
  password: string;
  walletAddress: string;
  bio: string;
  skills: string[];
}

function buildUsers(): SeedUser[] {
  const users: SeedUser[] = [];

  for (let i = 1; i <= CLIENT_COUNT; i++) {
    users.push({
      id: `user-client-${i}`,
      username: `client${i}`,
      email: `client${i}@stellarmarket.dev`,
      role: "CLIENT",
      password: CLIENT_PASSWORD,
      walletAddress: devWallet(`CLIENT${i}`),
      bio: `Demo client account #${i} for local development.`,
      skills: [],
    });
  }

  const skillPool = [
    ["React", "TypeScript", "CSS"],
    ["Node.js", "Express", "PostgreSQL"],
    ["Rust", "Soroban", "Smart Contracts"],
    ["Figma", "UI/UX", "Branding"],
    ["React Native", "Flutter", "iOS"],
    ["Technical Writing", "Markdown", "API Docs"],
    ["Docker", "CI/CD", "AWS"],
  ];

  for (let i = 1; i <= FREELANCER_COUNT; i++) {
    users.push({
      id: `user-freelancer-${i}`,
      username: `freelancer${i}`,
      email: `freelancer${i}@stellarmarket.dev`,
      role: "FREELANCER",
      password: FREELANCER_PASSWORD,
      walletAddress: devWallet(`FREELANCER${i}`),
      bio: `Demo freelancer account #${i} specializing in ${
        CATEGORIES[(i - 1) % CATEGORIES.length]
      }.`,
      skills: skillPool[(i - 1) % skillPool.length],
    });
  }

  return users;
}

type JobStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "DISPUTED"
  | "EXPIRED";
type EscrowStatus =
  | "UNFUNDED"
  | "FUNDED"
  | "COMPLETED"
  | "CANCELLED"
  | "DISPUTED";

interface SeedJob {
  id: string;
  title: string;
  description: string;
  budget: number;
  category: string;
  status: JobStatus;
  escrowStatus: EscrowStatus;
  clientId: string;
  freelancerId: string | null;
  deadlineDay: number;
}

/**
 * 20 jobs spread across all 7 categories with a varied status mix:
 *   5 COMPLETED, 5 IN_PROGRESS, 5 DISPUTED, 3 OPEN, 1 CANCELLED, 1 EXPIRED.
 *
 * Escrow records ("10, mix of active and completed") =
 *   5 COMPLETED (escrow COMPLETED) + 5 IN_PROGRESS (escrow FUNDED).
 * Disputes (5) map to the 5 DISPUTED jobs.
 */
function buildJobs(): SeedJob[] {
  const statusPlan: JobStatus[] = [
    "COMPLETED",
    "IN_PROGRESS",
    "DISPUTED",
    "COMPLETED",
    "IN_PROGRESS",
    "DISPUTED",
    "COMPLETED",
    "IN_PROGRESS",
    "DISPUTED",
    "COMPLETED",
    "IN_PROGRESS",
    "DISPUTED",
    "COMPLETED",
    "IN_PROGRESS",
    "DISPUTED",
    "OPEN",
    "OPEN",
    "OPEN",
    "CANCELLED",
    "EXPIRED",
  ];

  const escrowForStatus: Record<JobStatus, EscrowStatus> = {
    COMPLETED: "COMPLETED",
    IN_PROGRESS: "FUNDED",
    DISPUTED: "DISPUTED",
    OPEN: "UNFUNDED",
    CANCELLED: "CANCELLED",
    EXPIRED: "UNFUNDED",
  };

  const jobs: SeedJob[] = [];
  for (let i = 0; i < JOB_COUNT; i++) {
    const n = i + 1;
    const status = statusPlan[i];
    const category = CATEGORIES[i % CATEGORIES.length];
    const clientId = `user-client-${(i % CLIENT_COUNT) + 1}`;
    // Jobs that are not OPEN have an assigned freelancer.
    const assigned = status !== "OPEN";
    const freelancerId = assigned
      ? `user-freelancer-${(i % FREELANCER_COUNT) + 1}`
      : null;

    jobs.push({
      id: `job-${String(n).padStart(2, "0")}`,
      title: `${category} project #${n}`,
      description: `Seed job #${n}: build a ${category.toLowerCase()} deliverable for the StellarMarket demo dataset.`,
      budget: 250 + i * 75,
      category,
      status,
      escrowStatus: escrowForStatus[status],
      clientId,
      freelancerId,
      // OPEN/IN_PROGRESS jobs deadline in the future; terminal ones in the past.
      deadlineDay: assigned && status !== "COMPLETED" ? 120 + i : 30 + i,
    });
  }

  return jobs;
}

async function reset(): Promise<void> {
  console.log("  --reset: truncating all tables…");
  const list = TRUNCATE_TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`
  );
}

async function seedUsers(users: SeedUser[]): Promise<void> {
  const clientHash = await bcrypt.hash(CLIENT_PASSWORD, 10);
  const freelancerHash = await bcrypt.hash(FREELANCER_PASSWORD, 10);

  for (const u of users) {
    const passwordHash = u.role === "CLIENT" ? clientHash : freelancerHash;
    const data = {
      username: u.username,
      email: u.email,
      role: u.role,
      password: passwordHash,
      walletAddress: u.walletAddress,
      bio: u.bio,
      skills: u.skills,
      emailVerified: true,
      completedOnboarding: true,
    };
    await prisma.user.upsert({
      where: { id: u.id },
      update: data,
      create: { id: u.id, ...data },
    });
  }
  console.log(`  Seeded ${users.length} users.`);
}

async function seedJobs(jobs: SeedJob[]): Promise<void> {
  for (const j of jobs) {
    const data = {
      title: j.title,
      description: j.description,
      budget: j.budget,
      category: j.category,
      status: j.status,
      escrowStatus: j.escrowStatus,
      clientId: j.clientId,
      freelancerId: j.freelancerId,
      skills: [] as string[],
      deadline: daysFromBase(j.deadlineDay),
    };
    await prisma.job.upsert({
      where: { id: j.id },
      update: data,
      create: { id: j.id, ...data },
    });
  }
  console.log(`  Seeded ${jobs.length} jobs.`);
}

async function seedApplications(jobs: SeedJob[]): Promise<void> {
  // Target: 30 applications. First 10 jobs get 2 applicants, next 10 get 1.
  let created = 0;
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const applicantCount = i < 10 ? 2 : 1;

    for (let k = 0; k < applicantCount; k++) {
      // Primary applicant (k=0) is the assigned freelancer when there is one.
      const freelancerId =
        k === 0 && job.freelancerId
          ? job.freelancerId
          : `user-freelancer-${((i + k * 3) % FREELANCER_COUNT) + 1}`;

      // Avoid colliding with the assigned freelancer on the secondary slot.
      const safeFreelancerId =
        k > 0 && freelancerId === job.freelancerId
          ? `user-freelancer-${((i + k * 3 + 1) % FREELANCER_COUNT) + 1}`
          : freelancerId;

      const isAssigned = safeFreelancerId === job.freelancerId;
      const status: "PENDING" | "ACCEPTED" | "REJECTED" = isAssigned
        ? "ACCEPTED"
        : k === 0
        ? "PENDING"
        : "REJECTED";

      const id = `app-${job.id}-${safeFreelancerId}`;
      const data = {
        jobId: job.id,
        freelancerId: safeFreelancerId,
        proposal: `Proposal from ${safeFreelancerId} for ${job.title}.`,
        bidAmount: Math.round(job.budget * 0.95),
        estimatedDuration: `${5 + (i % 4) * 5} days`,
        status,
      };
      await prisma.application.upsert({
        where: { jobId_freelancerId: { jobId: job.id, freelancerId: safeFreelancerId } },
        update: data,
        create: { id, ...data },
      });
      created++;
    }
  }
  console.log(`  Seeded ${created} applications.`);
}

async function seedEscrowTransactions(jobs: SeedJob[]): Promise<void> {
  // Escrow lifecycle lives on Job.escrowStatus + Transaction rows.
  // FUNDED jobs => 1 DEPOSIT; COMPLETED jobs => DEPOSIT + RELEASE.
  const usersById = new Map(
    buildUsers().map((u) => [u.id, u.walletAddress])
  );
  let txCount = 0;
  let escrowCount = 0;

  for (const job of jobs) {
    if (job.escrowStatus !== "FUNDED" && job.escrowStatus !== "COMPLETED") {
      continue;
    }
    escrowCount++;
    const clientWallet = usersById.get(job.clientId)!;
    const freelancerWallet = job.freelancerId
      ? usersById.get(job.freelancerId)!
      : clientWallet;

    const deposit = {
      id: `tx-${job.id}-deposit`,
      jobId: job.id,
      fromAddress: clientWallet,
      toAddress: freelancerWallet,
      amount: job.budget,
      tokenAddress: "native",
      txHash: `seedhash-${job.id}-deposit`,
      type: "DEPOSIT" as const,
    };
    await prisma.transaction.upsert({
      where: { txHash: deposit.txHash },
      update: deposit,
      create: deposit,
    });
    txCount++;

    if (job.escrowStatus === "COMPLETED") {
      const release = {
        id: `tx-${job.id}-release`,
        jobId: job.id,
        fromAddress: clientWallet,
        toAddress: freelancerWallet,
        amount: job.budget,
        tokenAddress: "native",
        txHash: `seedhash-${job.id}-release`,
        type: "RELEASE" as const,
      };
      await prisma.transaction.upsert({
        where: { txHash: release.txHash },
        update: release,
        create: release,
      });
      txCount++;
    }
  }
  console.log(
    `  Seeded ${escrowCount} escrow records (${txCount} transactions).`
  );
}

async function seedDisputes(jobs: SeedJob[]): Promise<void> {
  const disputed = jobs.filter((j) => j.status === "DISPUTED");
  const statuses: ("OPEN" | "IN_PROGRESS" | "RESOLVED")[] = [
    "OPEN",
    "IN_PROGRESS",
    "RESOLVED",
    "RESOLVED",
    "OPEN",
  ];

  for (let i = 0; i < disputed.length; i++) {
    const job = disputed[i];
    const status = statuses[i % statuses.length];
    const initiatorIsClient = i % 2 === 0;
    const data = {
      jobId: job.id,
      clientId: job.clientId,
      freelancerId: job.freelancerId!,
      initiatorId: initiatorIsClient ? job.clientId : job.freelancerId!,
      reason:
        i % 2 === 0
          ? "Delivered work does not match the agreed scope."
          : "Client is unresponsive and withholding milestone approval.",
      status,
      outcome: status === "RESOLVED" ? "Funds released to freelancer." : null,
      resolvedAt: status === "RESOLVED" ? daysFromBase(60 + i) : null,
    };
    await prisma.dispute.upsert({
      where: { jobId: job.id },
      update: data,
      create: { id: `dispute-${job.id}`, ...data },
    });
  }
  console.log(`  Seeded ${disputed.length} disputes.`);
}

async function seedReviews(jobs: SeedJob[]): Promise<void> {
  const completed = jobs.filter((j) => j.status === "COMPLETED");
  let count = 0;

  for (let i = 0; i < completed.length; i++) {
    const job = completed[i];
    const clientRating = 4 + (i % 2); // 4 or 5
    const freelancerRating = 5 - (i % 2); // 5 or 4

    // Client reviews freelancer.
    const clientReview = {
      jobId: job.id,
      reviewerId: job.clientId,
      revieweeId: job.freelancerId!,
      rating: clientRating,
      comment: "Great work, delivered on time and matched the spec.",
    };
    await prisma.review.upsert({
      where: { jobId_reviewerId: { jobId: job.id, reviewerId: job.clientId } },
      update: clientReview,
      create: { id: `review-${job.id}-client`, ...clientReview },
    });
    count++;

    // Freelancer reviews client.
    const freelancerReview = {
      jobId: job.id,
      reviewerId: job.freelancerId!,
      revieweeId: job.clientId,
      rating: freelancerRating,
      comment: "Clear requirements and prompt communication.",
    };
    await prisma.review.upsert({
      where: {
        jobId_reviewerId: { jobId: job.id, reviewerId: job.freelancerId! },
      },
      update: freelancerReview,
      create: { id: `review-${job.id}-freelancer`, ...freelancerReview },
    });
    count++;
  }
  console.log(`  Seeded ${count} reviews.`);
}

/** Recompute User.averageRating / reviewCount so seeded aggregates stay consistent. */
async function recomputeReviewAggregates(): Promise<void> {
  const grouped = await prisma.review.groupBy({
    by: ["revieweeId"],
    _avg: { rating: true },
    _count: { rating: true },
  });
  for (const g of grouped) {
    await prisma.user.update({
      where: { id: g.revieweeId },
      data: {
        averageRating: g._avg.rating ?? 0,
        reviewCount: g._count.rating,
      },
    });
  }
  console.log(`  Recomputed review aggregates for ${grouped.length} users.`);
}

async function main(): Promise<void> {
  const shouldReset = process.argv.includes("--reset");

  console.log("Seeding StellarMarket database…");
  if (shouldReset) {
    await reset();
  }

  const users = buildUsers();
  const jobs = buildJobs();

  await seedUsers(users);
  await seedJobs(jobs);
  await seedApplications(jobs);
  await seedEscrowTransactions(jobs);
  await seedDisputes(jobs);
  await seedReviews(jobs);
  await recomputeReviewAggregates();

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
