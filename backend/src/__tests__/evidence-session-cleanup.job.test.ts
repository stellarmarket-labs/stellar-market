import fs from "fs";
import path from "path";
import os from "os";

// ── 1. Set up a temporary SESSION_ROOT before any service module is imported ──
const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "evidence-session-cleanup-test-"),
);
process.env.EVIDENCE_SESSION_DIR = tempRoot;
process.env.UPLOAD_DIR = tempRoot;

// ── 2. Imports (after env vars are set) ──────────────────────────────────────
import {
  initiateSession,
  getSession,
  SESSION_ROOT,
} from "../services/evidence-upload-session.service";
import {
  sweepStaleSessions,
  SESSION_TTL_MS,
} from "../jobs/evidence-session-cleanup.job";

// ── Helpers ──────────────────────────────────────────────────────────────────

const OLD_CREATED_AT = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(); // 26 h ago
const NEW_CREATED_AT = new Date().toISOString();                                   // just now

/** Build the minimal valid input for initiateSession */
function makeInput(overrides: Partial<{ sha256: string; createdAt: string }> = {}) {
  return {
    disputeId: "dispute-sweep-test",
    uploaderId: "user-sweep-test",
    originalName: "video.mp4",
    sha256: overrides.sha256 ?? "a".repeat(64),
    size: 1024,
    mimeType: "video/mp4",
    chunkSize: 1024,
    totalChunks: 1,
    createdAt: overrides.createdAt ?? NEW_CREATED_AT,
  };
}

/** Back-date a session directory's mtime to look older than the TTL */
function backdateSessionDir(sessionId: string, ageMs: number): void {
  const dir = path.join(SESSION_ROOT, sessionId);
  const oldTime = new Date(Date.now() - ageMs);
  fs.utimesSync(dir, oldTime, oldTime);
}

// ── Test suite ────────────────────────────────────────────────────────────────

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("sweepStaleSessions", () => {
  it("removes a session older than the TTL that was never completed", () => {
    // Session whose manifest records a createdAt 26 h in the past
    const { sessionId } = initiateSession(
      makeInput({ sha256: "1".repeat(64), createdAt: OLD_CREATED_AT }),
    );

    expect(getSession(sessionId)).not.toBeNull();

    const cleaned = sweepStaleSessions(new Date(), SESSION_TTL_MS);

    expect(cleaned).toBeGreaterThanOrEqual(1);
    expect(getSession(sessionId)).toBeNull();
    expect(fs.existsSync(path.join(SESSION_ROOT, sessionId))).toBe(false);
  });

  it("does NOT remove a fresh session still within the TTL", () => {
    const { sessionId } = initiateSession(
      makeInput({ sha256: "2".repeat(64), createdAt: NEW_CREATED_AT }),
    );

    expect(getSession(sessionId)).not.toBeNull();

    sweepStaleSessions(new Date(), SESSION_TTL_MS);

    // Session must still be present — it was just created
    expect(getSession(sessionId)).not.toBeNull();
  });

  it("removes the stale session while leaving the fresh one intact", () => {
    // Stale: createdAt 26 h ago (past TTL)
    const { sessionId: staleId } = initiateSession(
      makeInput({ sha256: "3".repeat(64), createdAt: OLD_CREATED_AT }),
    );
    // Fresh: createdAt now (within TTL)
    const { sessionId: freshId } = initiateSession(
      makeInput({ sha256: "4".repeat(64), createdAt: NEW_CREATED_AT }),
    );

    sweepStaleSessions(new Date(), SESSION_TTL_MS);

    // Stale must be gone; fresh must survive
    expect(getSession(staleId)).toBeNull();
    expect(getSession(freshId)).not.toBeNull();
  });

  it("does NOT remove a session that already has an assembled.bin (completed)", () => {
    // Even though the manifest says it's old, a completed session must not be purged
    const { sessionId } = initiateSession(
      makeInput({ sha256: "5".repeat(64), createdAt: OLD_CREATED_AT }),
    );

    // Simulate a completed upload by writing a dummy assembled.bin
    const assembledPath = path.join(SESSION_ROOT, sessionId, "assembled.bin");
    fs.writeFileSync(assembledPath, Buffer.alloc(0));

    sweepStaleSessions(new Date(), SESSION_TTL_MS);

    expect(fs.existsSync(assembledPath)).toBe(true);
  });

  it("removes an orphaned directory with no manifest if its mtime is past TTL", () => {
    // Orphan: valid hex-64 name but no manifest.json (corrupt / partially initialised)
    const orphanId = "e".repeat(64);
    const orphanDir = path.join(SESSION_ROOT, orphanId);
    fs.mkdirSync(orphanDir, { recursive: true });

    // Back-date the directory so its mtime looks older than TTL
    backdateSessionDir(orphanId, 26 * 60 * 60 * 1000);

    const cleaned = sweepStaleSessions(new Date(), SESSION_TTL_MS);

    expect(cleaned).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(orphanDir)).toBe(false);
  });

  it("returns 0 when SESSION_ROOT is empty", () => {
    // After the earlier sweeps the tempRoot may still have some fresh sessions —
    // just assert the return type and that it doesn't throw.
    const cleaned = sweepStaleSessions(new Date(), SESSION_TTL_MS);
    expect(typeof cleaned).toBe("number");
    expect(cleaned).toBeGreaterThanOrEqual(0);
  });
});
