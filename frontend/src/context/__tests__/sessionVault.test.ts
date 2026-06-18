/**
 * Tests for the sessionVault module
 *
 * Verifies:
 * - Non-extractable CryptoKey import (subtle.exportKey() throws)
 * - AES-GCM encrypted vault round-trip (save + load)
 * - Wrong passphrase returns DecryptionFailed error
 * - Vault clear removes all data
 * - Missing vault returns VAULT_EMPTY error
 */

// Polyfill TextEncoder/TextDecoder for jsdom
import { TextEncoder, TextDecoder } from "util";
if (typeof globalThis.TextEncoder === "undefined") {
  (globalThis as any).TextEncoder = TextEncoder;
  (globalThis as any).TextDecoder = TextDecoder;
}

import "@testing-library/jest-dom";
import {
  saveToVault,
  loadFromVault,
  hasVault,
  clearVault,
  importAsNonExtractableKey,
  signWithCryptoKey,
  VaultError,
  type VaultPayload,
} from "@/services/sessionVault";

// ─── IndexedDB Mock ──────────────────────────────────────────────────────────

const mockStore: Record<string, any> = {};

function createMockIDBRequest(result?: any): IDBRequest {
  const request: Partial<IDBRequest> = {
    result,
    onsuccess: null,
    onerror: null,
  };
  setTimeout(() => {
    if (request.onsuccess) {
      (request.onsuccess as Function)({ target: request } as any);
    }
  }, 0);
  return request as IDBRequest;
}

function createMockObjectStore(): IDBObjectStore {
  return {
    put: jest.fn((value: any, key: string) => {
      mockStore[key] = value;
      return createMockIDBRequest();
    }),
    get: jest.fn((key: string) => {
      return createMockIDBRequest(mockStore[key]);
    }),
    delete: jest.fn((key: string) => {
      delete mockStore[key];
      return createMockIDBRequest();
    }),
  } as unknown as IDBObjectStore;
}

function createMockTransaction(): IDBTransaction {
  const store = createMockObjectStore();
  return {
    objectStore: jest.fn(() => store),
  } as unknown as IDBTransaction;
}

function createMockDB(): IDBDatabase {
  return {
    objectStoreNames: { contains: jest.fn(() => true) },
    createObjectStore: jest.fn(),
    transaction: jest.fn(() => createMockTransaction()),
    close: jest.fn(),
  } as unknown as IDBDatabase;
}

// Mock indexedDB.open
const mockDB = createMockDB();
const mockOpenRequest: Partial<IDBOpenDBRequest> = {
  result: mockDB,
  onsuccess: null,
  onerror: null,
  onupgradeneeded: null,
};

Object.defineProperty(global, "indexedDB", {
  value: {
    open: jest.fn(() => {
      setTimeout(() => {
        if (mockOpenRequest.onsuccess) {
          (mockOpenRequest.onsuccess as Function)({ target: mockOpenRequest } as any);
        }
      }, 0);
      return mockOpenRequest;
    }),
  },
  writable: true,
});

// ─── WebCrypto Setup ─────────────────────────────────────────────────────────

// jsdom provides a basic crypto.subtle — if not, we rely on Node's webcrypto
if (!globalThis.crypto?.subtle) {
  const { webcrypto } = require("crypto");
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    writable: true,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("sessionVault", () => {
  beforeEach(() => {
    // Clear mock store between tests
    Object.keys(mockStore).forEach((key) => delete mockStore[key]);
  });

  describe("importAsNonExtractableKey", () => {
    it("imports seed bytes as a non-extractable CryptoKey", async () => {
      const seedBytes = new Uint8Array(32);
      crypto.getRandomValues(seedBytes);

      const key = await importAsNonExtractableKey(seedBytes);

      expect(key).toBeDefined();
      expect(key.type).toBe("secret");
      expect(key.extractable).toBe(false);
      expect(key.algorithm).toEqual(
        expect.objectContaining({ name: "HMAC" }),
      );
      expect(key.usages).toContain("sign");
    });

    it("subtle.exportKey() throws on non-extractable key", async () => {
      const seedBytes = new Uint8Array(32);
      crypto.getRandomValues(seedBytes);

      const key = await importAsNonExtractableKey(seedBytes);

      // Attempting to export a non-extractable key must throw
      await expect(
        crypto.subtle.exportKey("raw", key),
      ).rejects.toThrow();
    });

    it("can sign data with the imported key", async () => {
      const seedBytes = new Uint8Array(32);
      crypto.getRandomValues(seedBytes);

      const key = await importAsNonExtractableKey(seedBytes);
      const message = new TextEncoder().encode("test message");

      const signature = await signWithCryptoKey(key, message);

      // Use constructor name check — ArrayBuffer from node:crypto may be a different realm
      expect(signature.constructor.name).toBe("ArrayBuffer");
      expect(signature.byteLength).toBeGreaterThan(0);
    });
  });

  describe("vault operations", () => {
    const testPayload: VaultPayload = {
      address: "GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ12345678",
      walletType: "freighter",
      connectedAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    it("saves and loads data with correct passphrase", async () => {
      const passphrase = "test-passphrase-123";

      await saveToVault(passphrase, testPayload);
      const loaded = await loadFromVault(passphrase);

      expect(loaded.address).toBe(testPayload.address);
      expect(loaded.walletType).toBe(testPayload.walletType);
      expect(loaded.connectedAt).toBe(testPayload.connectedAt);
    });

    it("rejects wrong passphrase with DECRYPTION_FAILED", async () => {
      const correctPassphrase = "correct-passphrase";
      const wrongPassphrase = "wrong-passphrase";

      await saveToVault(correctPassphrase, testPayload);

      try {
        await loadFromVault(wrongPassphrase);
        fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(VaultError);
        expect((err as VaultError).code).toBe("DECRYPTION_FAILED");
      }
    });

    it("returns VAULT_EMPTY when no vault exists", async () => {
      // Clear any existing vault
      Object.keys(mockStore).forEach((key) => delete mockStore[key]);

      try {
        await loadFromVault("any-passphrase");
        fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(VaultError);
        expect((err as VaultError).code).toBe("VAULT_EMPTY");
      }
    });

    it("hasVault returns true when vault exists", async () => {
      await saveToVault("test-pass", testPayload);
      const exists = await hasVault();
      expect(exists).toBe(true);
    });

    it("hasVault returns false when vault is empty", async () => {
      Object.keys(mockStore).forEach((key) => delete mockStore[key]);
      const exists = await hasVault();
      expect(exists).toBe(false);
    });

    it("clearVault removes vault data", async () => {
      await saveToVault("test-pass", testPayload);
      await clearVault();

      const exists = await hasVault();
      expect(exists).toBe(false);
    });

    it("ciphertext in store is not readable as plaintext", async () => {
      const passphrase = "encryption-test";
      await saveToVault(passphrase, testPayload);

      // The raw ciphertext in the store should not contain the plaintext address
      const storeKeys = Object.keys(mockStore);
      expect(storeKeys.length).toBe(1);

      const record = mockStore[storeKeys[0]];
      // Use constructor name check — types from node:crypto may be from a different realm
      expect(record.ciphertext.constructor.name).toBe("ArrayBuffer");
      expect(record.salt.constructor.name).toBe("Uint8Array");
      expect(record.iv.constructor.name).toBe("Uint8Array");

      // Verify ciphertext doesn't contain plaintext address
      const ciphertextStr = new TextDecoder().decode(record.ciphertext);
      expect(ciphertextStr).not.toContain(testPayload.address);
    });
  });

  describe("PBKDF2 key derivation", () => {
    it("uses different salt for each save (different ciphertext)", async () => {
      const passphrase = "same-passphrase";
      const payload: VaultPayload = {
        address: "GBTEST1234567890",
        walletType: "freighter",
        connectedAt: Date.now(),
        lastActivityAt: Date.now(),
      };

      await saveToVault(passphrase, payload);
      const record1Salt = new Uint8Array(mockStore["wallet_session"].salt);

      // Save again — should generate new salt
      await saveToVault(passphrase, payload);
      const record2Salt = new Uint8Array(mockStore["wallet_session"].salt);

      // Salts should be different (with overwhelming probability)
      const saltsMatch = record1Salt.every((byte, i) => byte === record2Salt[i]);
      expect(saltsMatch).toBe(false);
    });
  });
});
