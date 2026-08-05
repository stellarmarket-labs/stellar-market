import fs from "fs";
import path from "path";
import os from "os";
import { Buffer } from "buffer";
import crypto from "crypto";

// Mock the environment variable for SESSION_ROOT before importing the service
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-session-test-"));
process.env.EVIDENCE_SESSION_DIR = tempDir;
process.env.UPLOAD_DIR = tempDir;

import {
  validateInitiateInput,
  initiateSession,
  saveChunk,
  assembleAndVerify,
  cleanupSession,
  getSession,
  deriveSessionId,
  CHUNK_SIZE,
  MIN_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  MAX_TOTAL_CHUNKS,
} from "../services/evidence-upload-session.service";

describe("Evidence Upload Session Service", () => {
  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("validateInitiateInput", () => {
    const validInput = {
      size: 5 * 1024 * 1024,
      chunkSize: CHUNK_SIZE,
      totalChunks: 3,
      sha256: "a".repeat(64),
    };

    it("should accept valid input", () => {
      expect(validateInitiateInput(validInput)).toBeNull();
    });

    it("should reject invalid sha256", () => {
      expect(validateInitiateInput({ ...validInput, sha256: "short" })).toBe("sha256 must be a 64-character hex digest");
    });

    it("should reject invalid size", () => {
      expect(validateInitiateInput({ ...validInput, size: -1 })).toBe("size must be a non-negative integer");
      expect(validateInitiateInput({ ...validInput, size: 10 * 1024 * 1024 + 1 })).toBe("File exceeds the maximum allowed size");
    });

    it("should reject invalid chunkSize", () => {
      expect(validateInitiateInput({ ...validInput, chunkSize: MIN_CHUNK_SIZE - 1 })).toBe(`chunkSize must be an integer >= ${MIN_CHUNK_SIZE}`);
      expect(validateInitiateInput({ ...validInput, chunkSize: MAX_CHUNK_SIZE + 1 })).toBe("chunkSize exceeds the maximum allowed");
    });

    it("should reject invalid totalChunks", () => {
      expect(validateInitiateInput({ ...validInput, totalChunks: -1 })).toBe("totalChunks must be a positive integer");
      expect(validateInitiateInput({ ...validInput, totalChunks: MAX_TOTAL_CHUNKS + 1 })).toBe("Too many chunks");
    });

    it("should reject mismatched chunks", () => {
      expect(validateInitiateInput({ ...validInput, totalChunks: 5 })).toBe("totalChunks is inconsistent with size and chunkSize");
    });
  });

  describe("Session Lifecycle", () => {
    const input = {
      disputeId: "dispute123",
      uploaderId: "user123",
      originalName: "test.mp4",
      sha256: "a".repeat(64),
      size: CHUNK_SIZE + 1024,
      mimeType: "video/mp4",
      chunkSize: CHUNK_SIZE,
      totalChunks: 2,
      createdAt: new Date().toISOString(),
    };

    let sessionId: string;

    it("should initiate session idempotently", () => {
      const result1 = initiateSession(input);
      sessionId = result1.sessionId;
      expect(result1.manifest.disputeId).toBe(input.disputeId);
      
      const result2 = initiateSession(input);
      expect(result2.sessionId).toBe(sessionId);
      expect(result2.receivedChunks).toEqual([]);
    });

    it("should wipe session on identity mismatch", () => {
      // Modify size, which creates an identity mismatch
      const mismatchedInput = { ...input, size: CHUNK_SIZE + 2048 };
      
      // Since deriveSessionId uses only dispute, uploader, sha256
      // the sessionId is the same, but the identity differs!
      const result = initiateSession(mismatchedInput);
      expect(result.sessionId).toBe(sessionId);
      expect(result.manifest.size).toBe(mismatchedInput.size);
    });

    it("should validate chunk sizes and indexes", () => {
      const data = Buffer.alloc(CHUNK_SIZE);
      
      // Index out of range
      expect(() => saveChunk(sessionId, 5, data)).toThrow("Chunk index out of range");
      
      // Too large
      expect(() => saveChunk(sessionId, 0, Buffer.alloc(MAX_CHUNK_SIZE + 1))).toThrow("Chunk larger than declared chunkSize");
      
      // Non-final chunk wrong size
      expect(() => saveChunk(sessionId, 0, Buffer.alloc(CHUNK_SIZE - 1))).toThrow("Non-final chunk must be exactly chunkSize bytes");
    });

    it("should save valid chunks", () => {
      // Create fresh session
      initiateSession(input);

      const chunk0 = Buffer.alloc(CHUNK_SIZE, "0");
      const result0 = saveChunk(sessionId, 0, chunk0);
      expect(result0.receivedChunks).toEqual([0]);

      const chunk1 = Buffer.alloc(1024, "1");
      const result1 = saveChunk(sessionId, 1, chunk1);
      expect(result1.receivedChunks).toEqual([0, 1]);
    });

    it("should assemble and verify (verified: false on mismatch)", () => {
      // Re-initiate with an actual hash mismatch
      const chunk0 = Buffer.alloc(CHUNK_SIZE, "0");
      const chunk1 = Buffer.alloc(1024, "1");
      
      const fakeSha256 = crypto.createHash("sha256").update(Buffer.concat([chunk0, chunk1])).digest("hex");
      
      const realSha256 = "b".repeat(64); // Intentionally wrong
      const mismatchedHashInput = { ...input, sha256: realSha256 };
      initiateSession(mismatchedHashInput);
      
      const sid = mismatchedHashInput.sha256 === input.sha256 ? sessionId : deriveSessionId(input.disputeId, input.uploaderId, realSha256);
      
      saveChunk(sid, 0, chunk0);
      saveChunk(sid, 1, chunk1);
      
      const assembled = assembleAndVerify(sid);
      expect(assembled.verified).toBe(false);
      expect(assembled.computedSha256).toBe(fakeSha256);
    });
    
    it("should assemble and verify (verified: true on match)", () => {
      const chunk0 = Buffer.alloc(CHUNK_SIZE, "0");
      const chunk1 = Buffer.alloc(1024, "1");
      
      const realSha256 = crypto.createHash("sha256").update(Buffer.concat([chunk0, chunk1])).digest("hex");
      
      const matchedHashInput = { ...input, sha256: realSha256 };
      initiateSession(matchedHashInput);
      const sid = deriveSessionId(input.disputeId, input.uploaderId, realSha256);
      
      saveChunk(sid, 0, chunk0);
      saveChunk(sid, 1, chunk1);
      
      const assembled = assembleAndVerify(sid);
      expect(assembled.verified).toBe(true);
      expect(assembled.computedSha256).toBe(realSha256);
    });

    it("should cleanup session", () => {
      const sid = deriveSessionId(input.disputeId, input.uploaderId, input.sha256);
      initiateSession(input);
      expect(getSession(sid)).not.toBeNull();
      
      cleanupSession(sid);
      expect(getSession(sid)).toBeNull();
    });
  });
});
