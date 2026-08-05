import { describe, expect, it } from "vitest";
import {
  pendingArticlesQuerySchema,
  pendingArticlePatchBodySchema,
  pendingArticleApproveBodySchema,
  pendingArticleRejectBodySchema,
} from "../server/schemas/article";
import { ArticleStatus, PIPELINE_CATEGORY_SLUGS } from "../types/article";
import {
  normalizeArticleUrl,
  hashArticleUrl,
  isSafeHttpUrl,
} from "../utils/articleUrl";
import {
  redactSecrets,
  targetReadingMinutes,
} from "../server/services/articleRewriter";
import {
  extractMainTextFromHtml,
  selectLongestItems,
} from "../server/services/articleFetcher";
import { rateLimitScope, resolvePolicy } from "../server/rate-limit/policies";

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

describe("article URL normalize / hash / safety", () => {
  it("strips fragments and trailing slashes for stable hashing", () => {
    const a = normalizeArticleUrl("https://Example.com/path/?q=1#section");
    const b = normalizeArticleUrl("https://example.com/path?q=1");
    expect(hashArticleUrl(a)).toBe(hashArticleUrl(b));
  });

  it("rejects javascript and data URLs", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,hi")).toBe(false);
    expect(isSafeHttpUrl("https://example.com/a")).toBe(true);
  });
});

describe("LLM secret redaction", () => {
  it("redacts API key material from error strings", () => {
    expect(redactSecrets("key=AQ.secretvalue&x=1")).toContain("REDACTED");
    expect(redactSecrets("Bearer sk-abcdefghijklmnop")).toContain("REDACTED");
  });
});

describe("long-form fetch selection", () => {
  it("keeps the longest bodies above the minimum", () => {
    const selected = selectLongestItems(
      [
        { content: "x".repeat(200) },
        { content: "y".repeat(1200) },
        { content: "z".repeat(900) },
        { content: "short" },
      ],
      2,
      800,
    );
    expect(selected).toHaveLength(2);
    expect(selected[0]?.content.length).toBe(1200);
    expect(selected[1]?.content.length).toBe(900);
  });

  it("extracts article text from HTML shells", () => {
    const text = extractMainTextFromHtml(
      "<html><body><nav>Skip</nav><article><p>Hello engineers</p><p>More depth here.</p></article></body></html>",
    );
    expect(text).toContain("Hello engineers");
    expect(text).not.toContain("nav");
  });
});

describe("storytelling rewrite targets", () => {
  it("defaults to a 5–10 minute reading window", () => {
    expect(targetReadingMinutes()).toEqual({ min: 5, max: 10 });
  });
});

describe("article admin rate-limit scope", () => {
  it("shares one bucket for regenerate paths under pending prefix", () => {
    expect(rateLimitScope("/api/admin/articles/pending/art_1/regenerate")).toBe(
      "/api/admin/articles/pending",
    );
    expect(rateLimitScope("/api/admin/articles/pending/fetch")).toBe(
      "/api/admin/articles/pending/fetch",
    );
    expect(resolvePolicy("/api/admin/articles/pending/fetch").limit).toBe(2);
  });
});
