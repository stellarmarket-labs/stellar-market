/**
 * Session Vault — WebCrypto + IndexedDB encrypted session storage
 *
 * Replaces plaintext localStorage session persistence with:
 * - PBKDF2-derived AES-GCM encryption key from user passphrase
 * - Encrypted session data stored in IndexedDB (not localStorage)
 * - Non-extractable CryptoKey references that cannot be read back
 *
 * Security guarantees:
 * - Session data is AES-256-GCM encrypted at rest
 * - PBKDF2 with ≥600k iterations resists brute-force
 * - Wrong passphrase returns a generic error (no oracle)
 * - CryptoKey objects are non-extractable
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const DB_NAME = "stellarmarket_vault";
const DB_VERSION = 1;
const STORE_NAME = "encrypted_sessions";
const VAULT_KEY = "wallet_session";
const PBKDF2_ITERATIONS = 600_000;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VaultPayload {
  /** The wallet address */
  address: string;
  /** The wallet provider type */
  walletType: string;
  /** Timestamp of when the session was created */
  connectedAt: number;
  /** Timestamp of last activity */
  lastActivityAt: number;
}

interface EncryptedVaultRecord {
  /** The encrypted session data */
  ciphertext: ArrayBuffer;
  /** Random salt for PBKDF2 derivation */
  salt: Uint8Array;
  /** Random IV for AES-GCM */
  iv: Uint8Array;
  /** Timestamp of when the vault was created */
  createdAt: number;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class VaultError extends Error {
  constructor(
    message: string,
    public readonly code: VaultErrorCode,
  ) {
    super(message);
    this.name = "VaultError";
  }
}

export type VaultErrorCode =
  | "DECRYPTION_FAILED"
  | "VAULT_EMPTY"
  | "DB_ERROR"
  | "CRYPTO_UNAVAILABLE";

// ─── IndexedDB helpers ───────────────────────────────────────────────────────

function openVaultDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new VaultError("IndexedDB is not available", "DB_ERROR"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new VaultError("Failed to open vault database", "DB_ERROR"));
  });
}

function idbPut(
  db: IDBDatabase,
  key: string,
  value: EncryptedVaultRecord,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(new VaultError("Failed to write to vault", "DB_ERROR"));
  });
}

function idbGet(
  db: IDBDatabase,
  key: string,
): Promise<EncryptedVaultRecord | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as EncryptedVaultRecord | undefined);
    request.onerror = () =>
      reject(new VaultError("Failed to read from vault", "DB_ERROR"));
  });
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(new VaultError("Failed to delete from vault", "DB_ERROR"));
  });
}

// ─── WebCrypto helpers ───────────────────────────────────────────────────────

function getSubtle(): SubtleCrypto {
  if (
    typeof window === "undefined" ||
    !window.crypto ||
    !window.crypto.subtle
  ) {
    throw new VaultError(
      "WebCrypto API is not available. A secure context (HTTPS) is required.",
      "CRYPTO_UNAVAILABLE",
    );
  }
  return window.crypto.subtle;
}

/**
 * Derive a non-extractable AES-GCM-256 key from a passphrase using PBKDF2.
 */
async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const encoder = new TextEncoder();
  const passphraseBytes = encoder.encode(passphrase);

  // Import the passphrase as a PBKDF2 base key (non-extractable)
  const baseKey = await subtle.importKey(
    "raw",
    passphraseBytes,
    "PBKDF2",
    false, // non-extractable
    ["deriveKey"],
  );

  // Derive the AES-GCM encryption key
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable — cannot be exported
    ["encrypt", "decrypt"],
  );
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Encrypt and store session data in IndexedDB, protected by a passphrase.
 *
 * - Generates a random 16-byte salt and 12-byte IV
 * - Derives AES-GCM-256 key via PBKDF2 (600k iterations)
 * - Encrypts session JSON with AES-GCM
 * - Stores { ciphertext, salt, iv } in IndexedDB
 */
export async function saveToVault(
  passphrase: string,
  payload: VaultPayload,
): Promise<void> {
  const subtle = getSubtle();
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const encryptionKey = await deriveKey(passphrase, salt);

  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(payload));

  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv },
    encryptionKey,
    plaintext,
  );

  const record: EncryptedVaultRecord = {
    ciphertext,
    salt,
    iv,
    createdAt: Date.now(),
  };

  const db = await openVaultDB();
  try {
    await idbPut(db, VAULT_KEY, record);
  } finally {
    db.close();
  }
}

/**
 * Decrypt and retrieve session data from the IndexedDB vault.
 *
 * @throws {VaultError} with code "VAULT_EMPTY" if no vault exists
 * @throws {VaultError} with code "DECRYPTION_FAILED" if passphrase is wrong
 */
export async function loadFromVault(
  passphrase: string,
): Promise<VaultPayload> {
  const subtle = getSubtle();

  const db = await openVaultDB();
  let record: EncryptedVaultRecord | undefined;
  try {
    record = await idbGet(db, VAULT_KEY);
  } finally {
    db.close();
  }

  if (!record) {
    throw new VaultError("No session vault found", "VAULT_EMPTY");
  }

  const decryptionKey = await deriveKey(passphrase, record.salt);

  let decrypted: ArrayBuffer;
  try {
    decrypted = await subtle.decrypt(
      { name: "AES-GCM", iv: record.iv },
      decryptionKey,
      record.ciphertext,
    );
  } catch {
    // AES-GCM authentication failure = wrong passphrase
    // We intentionally do not leak which part failed (no oracle)
    throw new VaultError(
      "Failed to decrypt session vault",
      "DECRYPTION_FAILED",
    );
  }

  const decoder = new TextDecoder();
  const json = decoder.decode(decrypted);
  return JSON.parse(json) as VaultPayload;
}

/**
 * Check if a vault exists in IndexedDB (without requiring the passphrase).
 */
export async function hasVault(): Promise<boolean> {
  try {
    const db = await openVaultDB();
    try {
      const record = await idbGet(db, VAULT_KEY);
      return record !== undefined;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

/**
 * Delete the vault from IndexedDB (used on disconnect / logout).
 */
export async function clearVault(): Promise<void> {
  try {
    const db = await openVaultDB();
    try {
      await idbDelete(db, VAULT_KEY);
    } finally {
      db.close();
    }
  } catch {
    // Best-effort cleanup — don't throw on disconnect
  }
}

/**
 * Import seed bytes as a non-extractable HMAC CryptoKey.
 * The returned key can be used for signing but its raw bytes
 * can never be exported back to JavaScript.
 *
 * @param seedBytes - Raw seed bytes (will NOT be zeroed by this function;
 *                    caller is responsible for zeroing after import)
 * @returns Non-extractable CryptoKey
 */
export async function importAsNonExtractableKey(
  seedBytes: Uint8Array,
): Promise<CryptoKey> {
  const subtle = getSubtle();

  const cryptoKey = await subtle.importKey(
    "raw",
    seedBytes,
    { name: "HMAC", hash: "SHA-512" },
    false, // extractable: false — key cannot be read back
    ["sign"],
  );

  return cryptoKey;
}

/**
 * Sign a message using a non-extractable HMAC key.
 * The raw key bytes never re-enter JavaScript.
 */
export async function signWithCryptoKey(
  key: CryptoKey,
  message: Uint8Array,
): Promise<ArrayBuffer> {
  const subtle = getSubtle();
  return subtle.sign("HMAC", key, message);
}
