import fs from "fs";
import path from "path";
import Redis from "ioredis";
import {
  SESSION_ROOT,
  cleanupSession,
  getSession,
} from "../services/evidence-upload-session.service";
import { logger } from "../lib/logger";

/** Only directories whose name looks like a derived session id are considered. */
const HEX64 = /^[a-f0-9]{64}$/;

/** Sessions older than this with no assembled file are purged. Default: 24 h. */
export const SESSION_TTL_MS =
  Number(process.env.EVIDENCE_SESSION_TTL_MS) || 24 * 60 * 60 * 1000;

/** How often the sweep runs. Default: 1 h. */
const SWEEP_INTERVAL_MS =
  Number(process.env.EVIDENCE_SESSION_SWEEP_INTERVAL_MS) || 60 * 60 * 1000;

const LOCK_KEY = "lock:evidence-session-cleanup-job";
const LOCK_TTL_MS = 55_000;

// ---------------------------------------------------------------------------
// Redis distributed lock helpers (mirrors expiry.job.ts)
// ---------------------------------------------------------------------------

function getRedisClient(): Redis | null {
  const url = process.env.REDIS_URL || "redis://localhost:6379";
  if (!url) return null;
  try {
    return new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableReadyCheck: false,
    });
  } catch {
    return null;
  }
}

async function acquireLock(redis: Redis): Promise<boolean> {
  const result = await redis.set(LOCK_KEY, "1", "PX", LOCK_TTL_MS, "NX");
  return result === "OK";
}

async function releaseLock(redis: Redis): Promise<void> {
  await redis.del(LOCK_KEY);
}

// ---------------------------------------------------------------------------
// Core sweep logic (pure, no Redis dependency — testable in isolation)
// ---------------------------------------------------------------------------

/**
 * Inspect SESSION_ROOT and remove every session directory that:
 *   1. Has a parseable manifest.json with a valid `createdAt` timestamp, AND
 *   2. Was created more than `ttlMs` milliseconds ago, AND
 *   3. Has no `assembled.bin` file (i.e. the upload was never completed).
 *
 * Directories that cannot be parsed (corrupted / no manifest) and are older
 * than the TTL are also removed — they are definitively unrecoverable.
 *
 * @param now     - Current time (injectable for testing)
 * @param ttlMs   - Age threshold in milliseconds (injectable for testing)
 * @returns       - Number of sessions cleaned up
 */
export function sweepStaleSessions(
  now: Date = new Date(),
  ttlMs: number = SESSION_TTL_MS,
): number {
  if (!fs.existsSync(SESSION_ROOT)) {
    logger.debug(
      { sessionRoot: SESSION_ROOT },
      "[EvidenceSessionCleanup] SESSION_ROOT does not exist — nothing to sweep",
    );
    return 0;
  }

  let entries: string[];
  try {
    entries = fs.readdirSync(SESSION_ROOT);
  } catch (err) {
    logger.error(
      { err, sessionRoot: SESSION_ROOT },
      "[EvidenceSessionCleanup] Failed to read SESSION_ROOT",
    );
    return 0;
  }

  const cutoff = new Date(now.getTime() - ttlMs);
  let cleaned = 0;

  for (const entry of entries) {
    const sessionId = entry;
    const sessionPath = path.join(SESSION_ROOT, entry);

    // Skip anything that is not a directory (e.g. stray files at root level)
    let stat: fs.Stats;
    try {
      stat = fs.statSync(sessionPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    // Skip entries that are not valid session IDs (e.g. temp dirs from test runners)
    if (!HEX64.test(sessionId)) continue;

    // Attempt to read the manifest to get createdAt
    const manifest = getSession(sessionId);

    // Determine age —
    //   • If manifest is readable, trust its createdAt field.
    //   • If manifest is missing/corrupt, fall back to the directory mtime so
    //     truly orphaned directories are still eventually cleaned up.
    let sessionAge: Date;
    if (manifest?.createdAt) {
      const parsed = new Date(manifest.createdAt);
      sessionAge = isNaN(parsed.getTime()) ? new Date(stat.mtimeMs) : parsed;
    } else {
      sessionAge = new Date(stat.mtimeMs);
    }

    if (sessionAge > cutoff) {
      // Session is still within the TTL window — leave it alone.
      continue;
    }

    // Check if the upload was already completed (assembled.bin present).
    // A completed session should have been cleaned up reactively; if somehow
    // it wasn't, a completed assembled.bin represents a finished upload that
    // still needs DB post-processing — leave it for the route to handle.
    const assembledPath = path.join(sessionPath, "assembled.bin");
    if (fs.existsSync(assembledPath)) {
      logger.warn(
        { sessionId, sessionAge: sessionAge.toISOString() },
        "[EvidenceSessionCleanup] Stale session has assembled.bin — skipping to avoid interfering with completion",
      );
      continue;
    }

    // Session is stale and unfinished — purge it.
    try {
      cleanupSession(sessionId);
      logger.info(
        { sessionId, sessionAge: sessionAge.toISOString(), ttlMs },
        "[EvidenceSessionCleanup] Removed stale evidence session",
      );
      cleaned += 1;
    } catch (err) {
      logger.error(
        { err, sessionId },
        "[EvidenceSessionCleanup] Failed to remove stale session",
      );
    }
  }

  return cleaned;
}

// ---------------------------------------------------------------------------
// Scheduled execution with distributed lock
// ---------------------------------------------------------------------------

async function executeWithLock(): Promise<void> {
  const redis = getRedisClient();

  if (redis) {
    try {
      await redis.connect();
      const acquired = await acquireLock(redis);
      if (!acquired) {
        logger.debug(
          "[EvidenceSessionCleanup] Lock not acquired — another instance is handling the sweep",
        );
        await redis.quit();
        return;
      }
    } catch (err) {
      logger.warn(
        { err },
        "[EvidenceSessionCleanup] Redis lock error, proceeding without lock",
      );
    }
  } else {
    logger.debug(
      "[EvidenceSessionCleanup] No Redis configured, proceeding without distributed lock",
    );
  }

  try {
    logger.info(
      { at: new Date().toISOString(), ttlMs: SESSION_TTL_MS },
      "[EvidenceSessionCleanup] Running sweep",
    );
    const cleaned = sweepStaleSessions();
    logger.info(
      { cleaned },
      "[EvidenceSessionCleanup] Sweep complete",
    );
  } finally {
    if (redis) {
      try {
        await releaseLock(redis);
        await redis.quit();
      } catch {
        // Best-effort lock release
      }
    }
  }
}

export function startEvidenceSessionCleanupJob(): void {
  void executeWithLock();
  setInterval(() => void executeWithLock(), SWEEP_INTERVAL_MS);
  logger.info(
    {
      intervalMs: SWEEP_INTERVAL_MS,
      ttlMs: SESSION_TTL_MS,
    },
    "[EvidenceSessionCleanup] Scheduled — runs periodically with distributed lock",
  );
}
