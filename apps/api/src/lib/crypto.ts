// Encryption helpers — AES-256-GCM with envelope encryption.
//
// Threat model defended:
//   • DB-only compromise (backup leak, SQL injection, read-only access):
//     plaintext content is never on disk in the DB. Attacker sees ciphertext
//     and per-user encrypted keys but cannot decrypt without KMS_ROOT_KEY.
//
// Threat model NOT defended (Sprint 4 v1):
//   • API host compromise — process holds the root key.
//   • Memory dump while plaintext is in flight — unavoidable for any
//     server-side processing model.
//
// The path to zero-knowledge (where the server holds *encrypted-with-passkey*
// user keys and can only decrypt when the user is present) is documented in
// docs/PRIVACY.md and is a Sprint 4+ stretch.
//
// Wire format: "v1:<base64url(iv)>:<base64url(ciphertext+authTag)>"

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../env.js";

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const KEY_LEN = 32;

// Lazy-loaded root key. Parsed from KMS_ROOT_KEY (64-hex-char string =
// 32 bytes). In test mode falls back to a deterministic test key so we
// don't blow up unit tests without secret material.
let rootKey: Buffer | null = null;
function getRootKey(): Buffer {
  if (rootKey) return rootKey;
  const raw = env.KMS_ROOT_KEY;
  if (raw) {
    if (raw.length !== 64) {
      throw new Error("KMS_ROOT_KEY must be 64 hex chars (32 bytes). Generate with: openssl rand -hex 32");
    }
    rootKey = Buffer.from(raw, "hex");
    return rootKey;
  }
  if (env.NODE_ENV === "test") {
    rootKey = Buffer.alloc(KEY_LEN, 0x11);
    return rootKey;
  }
  throw new Error("KMS_ROOT_KEY is not set. Generate with: openssl rand -hex 32 and add to .env");
}

/**
 * Generate a new random user-level key, encrypted with the root key.
 * Store the *return value* in User.encKey.
 */
export function generateUserKey(): string {
  const userKey = randomBytes(KEY_LEN);
  return encryptWithKey(getRootKey(), userKey.toString("hex"));
}

/**
 * Given an encrypted user key (from User.encKey), return the raw user key Buffer.
 */
function unwrapUserKey(wrapped: string): Buffer {
  const hex = decryptWithKey(getRootKey(), wrapped);
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt a plaintext string using the user's key.
 */
export function encrypt(plaintext: string, userEncKey: string): string {
  const userKey = unwrapUserKey(userEncKey);
  return encryptWithKey(userKey, plaintext);
}

/**
 * Decrypt a "v1:..." ciphertext string using the user's key.
 * Returns the plaintext.
 */
export function decrypt(ciphertext: string, userEncKey: string): string {
  const userKey = unwrapUserKey(userEncKey);
  return decryptWithKey(userKey, ciphertext);
}

/**
 * Is a value already a v1 ciphertext? Used for back-compat reads where some
 * rows may not be encrypted yet (Sprint 4 migration is opt-in per table).
 */
export function isCiphertext(s: string): boolean {
  return typeof s === "string" && s.startsWith(`${VERSION}:`);
}

// ── Internals ──────────────────────────────────────────────────────────────

function encryptWithKey(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("base64url")}:${Buffer.concat([enc, tag]).toString("base64url")}`;
}

function decryptWithKey(key: Buffer, blob: string): string {
  if (!blob.startsWith(`${VERSION}:`)) {
    throw new Error("ciphertext missing v1 prefix");
  }
  const parts = blob.split(":");
  if (parts.length !== 3) throw new Error("malformed ciphertext (expected 3 parts)");
  const iv = Buffer.from(parts[1]!, "base64url");
  const combined = Buffer.from(parts[2]!, "base64url");
  if (iv.length !== IV_LEN) throw new Error("bad IV length");
  // Last 16 bytes are the auth tag; rest is ciphertext.
  const tag = combined.subarray(combined.length - 16);
  const ciphertext = combined.subarray(0, combined.length - 16);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return dec.toString("utf8");
}
