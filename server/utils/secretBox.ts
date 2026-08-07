/**
 * Authenticated encryption for short secrets that must temporarily live in
 * MySQL job payloads (email verification / password-reset tokens).
 *
 * Uses AES-256-GCM. Key material is derived from JWT_SECRET so we do not
 * require a second env var; the derived key never leaves this module.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function deriveKey(): Buffer {
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error(
      "JWT_SECRET must be set (>=16 chars) to seal job payload secrets",
    );
  }
  return createHash("sha256")
    .update(`mgmt:secret-box:v${VERSION}:`)
    .update(raw)
    .digest();
}

/** Seal plaintext into a versioned, URL-safe base64 payload. */
export function sealSecret(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([Buffer.from([VERSION]), iv, tag, ciphertext]);
  return packed.toString("base64url");
}

/** Open a sealed payload; throws on tamper / wrong key / corrupt input. */
export function openSecret(sealed: string): string {
  const packed = Buffer.from(sealed, "base64url");
  if (packed.length < 1 + IV_BYTES + TAG_BYTES + 1) {
    throw new Error("secretBox: sealed payload too short");
  }
  const version = packed[0];
  if (version !== VERSION) {
    throw new Error(`secretBox: unsupported version ${version}`);
  }
  const iv = packed.subarray(1, 1 + IV_BYTES);
  const tag = packed.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const ciphertext = packed.subarray(1 + IV_BYTES + TAG_BYTES);
  const key = deriveKey();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** Constant-time equality for tests / callers that compare sealed digests. */
export function sealedEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
