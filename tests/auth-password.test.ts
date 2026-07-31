import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../server/utils/auth";

describe("password hashing", () => {
  it("hashes and verifies a valid password", async () => {
    const hash = await hashPassword("Password1!");
    expect(hash).toMatch(/^\$2[aby]?\$/);
    expect(await verifyPassword("Password1!", hash)).toBe(true);
    expect(await verifyPassword("wrong-pass", hash)).toBe(false);
  });

  it("rejects passwords shorter than 8 characters", async () => {
    await expect(hashPassword("short")).rejects.toThrow(/at least 8/);
  });

  it("verifyPassword returns false for non-strings", async () => {
    expect(await verifyPassword("x", null as unknown as string)).toBe(false);
  });
});
