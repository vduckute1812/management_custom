import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetRateLimitStoreForTests,
  checkRateLimit,
  rateLimitKey,
  rateLimitScope,
  resolvePolicy,
} from "../server/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    _resetRateLimitStoreForTests();
  });

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

  it("reports remaining correctly", () => {
    const opts = { limit: 2, windowMs: 60_000 };
    expect(checkRateLimit("test-remain", opts).remaining).toBe(1);
    expect(checkRateLimit("test-remain", opts).remaining).toBe(0);
    const third = checkRateLimit("test-remain", opts);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });
});

describe("rateLimitScope / rateLimitKey", () => {
  it("shares a global bucket for ordinary APIs", () => {
    expect(rateLimitScope("/api/tasks")).toBe("global");
    expect(rateLimitScope("/api/posts/post_abc")).toBe("global");
    expect(rateLimitKey("1.2.3.4", "/api/tasks")).toBe("1.2.3.4:global");
  });

  it("isolates strict auth/upload paths", () => {
    expect(rateLimitScope("/api/auth/login")).toBe("/api/auth/login");
    expect(rateLimitKey("1.2.3.4", "/api/auth/signup")).toBe(
      "1.2.3.4:/api/auth/signup",
    );
    expect(rateLimitScope("/api/uploads")).toBe("/api/uploads");
  });
});

describe("resolvePolicy", () => {
  it("applies strict auth/upload limits", () => {
    expect(resolvePolicy("/api/auth/login")).toEqual({
      limit: 10,
      windowMs: 60_000,
    });
    expect(resolvePolicy("/api/auth/signup")).toEqual({
      limit: 5,
      windowMs: 60_000,
    });
    expect(resolvePolicy("/api/uploads")).toEqual({
      limit: 30,
      windowMs: 60_000,
    });
  });

  it("defaults other APIs to 120/min", () => {
    expect(resolvePolicy("/api/tasks")).toEqual({
      limit: 120,
      windowMs: 60_000,
    });
  });
});
