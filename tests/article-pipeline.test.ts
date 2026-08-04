import { describe, expect, it } from "vitest";
import {
  pendingArticlesQuerySchema,
  pendingArticlePatchBodySchema,
  pendingArticleApproveBodySchema,
  pendingArticleRejectBodySchema,
} from "../server/schemas/article";
import { ArticleStatus, PIPELINE_CATEGORY_SLUGS } from "../types/article";
import { normalizeArticleUrl, hashArticleUrl } from "../utils/articleUrl";

describe("article status / pipeline constants", () => {
  it("uses integer statuses", () => {
    expect(ArticleStatus.Draft).toBe(0);
    expect(ArticleStatus.PendingApproval).toBe(1);
    expect(ArticleStatus.Approved).toBe(2);
    expect(ArticleStatus.Rejected).toBe(3);
  });

  it("targets exactly 7 core category slugs", () => {
    expect(PIPELINE_CATEGORY_SLUGS).toHaveLength(7);
    expect(PIPELINE_CATEGORY_SLUGS).toContain("electronics");
    expect(PIPELINE_CATEGORY_SLUGS).toContain("docs");
    expect(PIPELINE_CATEGORY_SLUGS).toContain("ideas");
  });
});

describe("pendingArticlesQuerySchema", () => {
  it("defaults limit/offset and accepts integer status", () => {
    const parsed = pendingArticlesQuerySchema.safeParse({ status: 1 });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe(1);
      expect(parsed.data.limit).toBe(50);
      expect(parsed.data.offset).toBe(0);
    }
  });

  it("rejects string status tokens", () => {
    expect(
      pendingArticlesQuerySchema.safeParse({ status: "pending_approval" })
        .success,
    ).toBe(false);
  });
});

describe("pending article mutation schemas", () => {
  it("accepts patch with rewritten fields", () => {
    expect(
      pendingArticlePatchBodySchema.safeParse({
        rewrittenTitle: "A story about chips",
        rewrittenContent: "## Lede\n\nOnce upon a fab…",
        categoryId: "cat_electronics",
      }).success,
    ).toBe(true);
  });

  it("accepts approve and reject bodies", () => {
    expect(pendingArticleApproveBodySchema.safeParse({}).success).toBe(true);
    expect(
      pendingArticleRejectBodySchema.safeParse({ delete: true }).success,
    ).toBe(true);
  });
});

describe("article URL normalize / hash", () => {
  it("strips fragments and trailing slashes for stable hashing", () => {
    const a = normalizeArticleUrl("https://Example.com/path/?q=1#section");
    const b = normalizeArticleUrl("https://example.com/path?q=1");
    expect(hashArticleUrl(a)).toBe(hashArticleUrl(b));
  });
});
