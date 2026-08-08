import { afterAll, beforeAll, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { UserRole } from "../types/task";
import {
  signAccessToken,
  verifyAccessToken,
  type AccessTokenClaims,
} from "../server/utils/auth";

const SECRET = "test-jwt-secret-at-least-32-chars!!";
const ISSUER = "management-app";

const claims: AccessTokenClaims = {
  sub: "user_test1",
  email: "a@example.com",
  role: UserRole.Normal,
};

describe("access JWT", () => {
  const prev = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
  });

  afterAll(() => {
    if (prev === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prev;
  });

  it("round-trips sign → verify", () => {
    const token = signAccessToken(claims);
    expect(verifyAccessToken(token)).toEqual(claims);
  });

  it("rejects expired tokens", () => {
    const token = jwt.sign(claims, SECRET, {
      algorithm: "HS256",
      issuer: ISSUER,
      expiresIn: -10,
    });
    expect(() => verifyAccessToken(token)).toThrow(/expired/i);
  });

  it("rejects bad signatures", () => {
    const token = jwt.sign(claims, "wrong-secret-value!!", {
      algorithm: "HS256",
      issuer: ISSUER,
      expiresIn: 60,
    });
    expect(() => verifyAccessToken(token)).toThrow(/invalid token/i);
  });

  it("rejects wrong issuer", () => {
    const token = jwt.sign(claims, SECRET, {
      algorithm: "HS256",
      issuer: "other-app",
      expiresIn: 60,
    });
    expect(() => verifyAccessToken(token)).toThrow(/invalid token/i);
  });

  it("rejects non-numeric role claims", () => {
    const token = jwt.sign(
      { sub: claims.sub, email: claims.email, role: "admin" },
      SECRET,
      { algorithm: "HS256", issuer: ISSUER, expiresIn: 60 },
    );
    expect(() => verifyAccessToken(token)).toThrow(/invalid token claims/i);
  });

  it("rejects out-of-range role numbers", () => {
    const token = jwt.sign(
      { sub: claims.sub, email: claims.email, role: 99 },
      SECRET,
      { algorithm: "HS256", issuer: ISSUER, expiresIn: 60 },
    );
    expect(() => verifyAccessToken(token)).toThrow(/invalid token claims/i);
  });

  it("requires JWT_SECRET >= 32 chars", () => {
    process.env.JWT_SECRET = "short-but-over-sixteen!";
    expect(() => signAccessToken(claims)).toThrow(/JWT_SECRET/);
    process.env.JWT_SECRET = SECRET;
  });
});
