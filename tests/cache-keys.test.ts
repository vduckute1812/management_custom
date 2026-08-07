import { describe, expect, it } from "vitest";
import { CacheKeys, cacheKeyHash } from "../server/utils/cache";

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
