import { describe, expect, it } from "vitest";
import { CacheKeys, CacheTTL, cacheKeyHash } from "../server/utils/cache";

describe("CacheKeys.feedPublic", () => {
  it("includes limit so different page sizes do not collide", () => {
    const a = CacheKeys.feedPublic(null, null, null, 20);
    const b = CacheKeys.feedPublic(null, null, null, 50);
    expect(a).not.toBe(b);
    expect(a).toContain("feed:public:");
  });

  it("hashes keys stably regardless of object key order", () => {
    expect(cacheKeyHash({ b: 1, a: 2 })).toBe(cacheKeyHash({ a: 2, b: 1 }));
  });
});

describe("CacheKeys.feedAuth", () => {
  it("scopes keys by viewer id outside the hash", () => {
    const a = CacheKeys.feedAuth("user_a", null, null, null, 20);
    const b = CacheKeys.feedAuth("user_b", null, null, null, 20);
    expect(a).not.toBe(b);
    expect(a.startsWith("feed:auth:user_a:")).toBe(true);
    expect(b.startsWith("feed:auth:user_b:")).toBe(true);
    expect(CacheKeys.feedAuthPrefix("user_a")).toBe("feed:auth:user_a:");
    expect(CacheKeys.feedAuthAllPrefix()).toBe("feed:auth:");
  });

  it("varies by cursor / locale / limit like the public key", () => {
    const base = CacheKeys.feedAuth("u1", null, null, "en", 20);
    expect(base).not.toBe(CacheKeys.feedAuth("u1", "c1", null, "en", 20));
    expect(base).not.toBe(CacheKeys.feedAuth("u1", null, null, "vi", 20));
    expect(base).not.toBe(CacheKeys.feedAuth("u1", null, null, "en", 50));
  });

  it("uses a shorter TTL than the public feed", () => {
    expect(CacheTTL.feedAuth).toBeLessThan(CacheTTL.feedPublic);
    expect(CacheTTL.feedAuth).toBe(10);
  });
});
