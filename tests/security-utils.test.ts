import { describe, expect, it } from "vitest";
import { DomainError } from "../server/utils/http";
import {
  evaluatePassword,
  isPasswordStrong,
  passwordStrengthError,
} from "../utils/passwordPolicy";
import { hashOpaqueToken, tokensEqual } from "../server/utils/auth";

describe("DomainError", () => {
  it("carries a status code", () => {
    const err = new DomainError(404, "missing");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("missing");
  });
});

describe("passwordPolicy", () => {
  it("requires complexity", () => {
    expect(isPasswordStrong("short")).toBe(false);
    expect(isPasswordStrong("Password1!")).toBe(true);
    expect(passwordStrengthError("weak")).toMatch(/Password must/);
  });

  it("reports individual rule failures", () => {
    const rules = evaluatePassword("abcdefg");
    expect(rules.find((r) => r.id === "minLength")?.ok).toBe(false);
    expect(rules.find((r) => r.id === "upper")?.ok).toBe(false);
  });
});

describe("opaque token hashing", () => {
  it("hashes deterministically and compares safely", () => {
    const a = hashOpaqueToken("abc");
    const b = hashOpaqueToken("abc");
    const c = hashOpaqueToken("abd");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(tokensEqual(a, b)).toBe(true);
    expect(tokensEqual(a, c)).toBe(false);
  });
});
