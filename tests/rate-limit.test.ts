import { describe, expect, it } from "vitest";
import { checkRateLimit } from "../server/utils/rateLimit";

describe("checkRateLimit", () => {
  it("allows requests within the limit", () => {
    const opts = { limit: 3, windowMs: 60_000 };
    expect(checkRateLimit("test-a", opts).allowed).toBe(true);
    expect(checkRateLimit("test-a", opts).allowed).toBe(true);
    expect(checkRateLimit("test-a", opts).allowed).toBe(true);
    expect(checkRateLimit("test-a", opts).allowed).toBe(false);
  });

  it("tracks separate keys independently", () => {
    const opts = { limit: 1, windowMs: 60_000 };
    expect(checkRateLimit("test-b", opts).allowed).toBe(true);
    expect(checkRateLimit("test-b", opts).allowed).toBe(false);
    expect(checkRateLimit("test-c", opts).allowed).toBe(true);
  });
});
