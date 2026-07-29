import { describe, expect, it } from "vitest";
import { requestKey, serializeQuery } from "../utils/apiRequestKey";

describe("serializeQuery", () => {
  it("returns empty for missing or empty query", () => {
    expect(serializeQuery(undefined)).toBe("");
    expect(serializeQuery({})).toBe("");
  });

  it("sorts keys and skips nullish values", () => {
    expect(
      serializeQuery({
        locale: "vi",
        categoryId: "cat_electronics",
        limit: 20,
        cursor: undefined,
        unused: null,
      }),
    ).toBe("categoryId=cat_electronics&limit=20&locale=vi");
  });
});

describe("requestKey", () => {
  it("distinguishes feed filters that only differ by query", () => {
    const base = requestKey("/api/posts", "GET");
    const electronics = requestKey("/api/posts", "GET", {
      categoryId: "cat_electronics",
      limit: 20,
      locale: "en",
    });
    const ideas = requestKey("/api/posts", "GET", {
      categoryId: "cat_ideas",
      limit: 20,
      locale: "en",
    });

    expect(base).toBe("GET:/api/posts");
    expect(electronics).not.toBe(base);
    expect(electronics).not.toBe(ideas);
    expect(electronics).toContain("categoryId=cat_electronics");
  });
});
