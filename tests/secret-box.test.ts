import { afterEach, describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "../server/utils/secretBox";

const ORIGINAL_SECRET = process.env.JWT_SECRET;

afterEach(() => {
  if (ORIGINAL_SECRET == null) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_SECRET;
});

describe("secretBox", () => {
  it("round-trips a token", () => {
    process.env.JWT_SECRET = "test-secret-at-least-16";
    const sealed = sealSecret("raw-action-token");
    expect(sealed).not.toContain("raw-action-token");
    expect(openSecret(sealed)).toBe("raw-action-token");
  });

  it("rejects tampered ciphertext", () => {
    process.env.JWT_SECRET = "test-secret-at-least-16";
    const sealed = sealSecret("token");
    const tweaked = `${sealed.slice(0, -2)}ab`;
    expect(() => openSecret(tweaked)).toThrow();
  });
});
