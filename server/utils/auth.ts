/**
 * Token + password primitives for the auth feature.
 *
 * Tokens
 * ------
 *   - Access tokens are short-lived (15 min) JWTs signed with HS256 using
 *     `JWT_SECRET`. They carry `sub` (user id), `email`, and `role`. They are
 *     stateless — verifying them never touches the DB.
 *
 *   - Refresh tokens are long-lived (30 day) opaque random strings. We store
 *     ONLY their SHA-256 hash in `auth_refresh_tokens` so a DB leak doesn't
 *     hand the attacker session reuse. Logout sets `revoked_at` so future
 *     uses of the same string fail.
 *
 * Passwords
 * ---------
 *   bcryptjs at cost factor 12. We use the pure-JS implementation rather
 *   than native bcrypt so the project doesn't need a C toolchain to install.
 */
import bcrypt from "bcryptjs";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { USER_ROLES, type UserRole } from "./db";

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 3600;
const TOKEN_ISSUER = "management-app";

export const TOKEN_TTL = {
  accessSeconds: ACCESS_TTL_SECONDS,
  refreshSeconds: REFRESH_TTL_SECONDS,
} as const;

export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: UserRole;
}

function getSecret(): string {
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error(
      "JWT_SECRET must be set (>=16 chars). Set it in your .env file."
    );
  }
  return raw;
}

// -------------------------------------------------------------------------
// Passwords
// -------------------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Password must be a string of at least 8 characters");
  }
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  if (typeof password !== "string" || typeof hash !== "string") return false;
  return bcrypt.compare(password, hash);
}

// -------------------------------------------------------------------------
// Access tokens (JWT)
// -------------------------------------------------------------------------

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, getSecret(), {
    algorithm: "HS256",
    issuer: TOKEN_ISSUER,
    expiresIn: ACCESS_TTL_SECONDS,
  });
}

/**
 * Throws (with a descriptive message) on any failure: bad signature, wrong
 * issuer, expired, malformed payload. Callers translate these into 401s.
 */
export function verifyAccessToken(token: string): AccessTokenClaims {
  let decoded: string | JwtPayload;
  try {
    decoded = jwt.verify(token, getSecret(), {
      algorithms: ["HS256"],
      issuer: TOKEN_ISSUER,
    });
  } catch (err: unknown) {
    const message = (err as { name?: string; message?: string })?.name ?? "";
    if (message === "TokenExpiredError") {
      throw new Error("Token expired");
    }
    throw new Error("Invalid token");
  }
  if (typeof decoded === "string" || !decoded) {
    throw new Error("Invalid token payload");
  }
  const { sub, email, role } = decoded as Record<string, unknown>;
  if (
    typeof sub !== "string" ||
    typeof email !== "string" ||
    typeof role !== "number" ||
    !USER_ROLES.includes(role as UserRole)
  ) {
    throw new Error("Invalid token claims");
  }
  return { sub, email, role: role as UserRole };
}

// -------------------------------------------------------------------------
// Refresh + email-verification tokens
// -------------------------------------------------------------------------

/** URL-safe random secret. 32 bytes ≈ 256 bits of entropy. */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time hex string comparison for any place we need to test token
 * equivalence outside of a DB lookup (we keep one for completeness even
 * though `findActiveRefreshToken` already hashes-and-queries directly).
 */
export function tokensEqual(a: string, b: string): boolean {
  const A = Buffer.from(a, "utf8");
  const B = Buffer.from(b, "utf8");
  if (A.length !== B.length) return false;
  return timingSafeEqual(A, B);
}

export function nowPlusSeconds(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}
