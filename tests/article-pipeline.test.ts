import { describe, expect, it } from "vitest";
import {
  pendingArticlesQuerySchema,
  pendingArticlePatchBodySchema,
  pendingArticleApproveBodySchema,
  pendingArticleRejectBodySchema,
  pendingArticleBulkDeleteBodySchema,
  pendingArticleSettingsPatchBodySchema,
} from "../server/schemas/article";
import { ArticleStatus, PIPELINE_CATEGORY_SLUGS } from "../types/article";
import { AppSettingKey } from "../types/appSettings";
import { normalizeArticleUrl, isSafeHttpUrl } from "../utils/articleUrl";
import { hashArticleUrl } from "../server/utils/articleUrlHash";
import { ensureSourceAttribution } from "../utils/articleAttribution";
import {
  redactSecrets,
  targetReadingMinutes,
} from "../server/services/admin/articleRewriter";
import {
  ARTICLE_FEED_SOURCES,
  extractMainTextFromHtml,
  selectLongestItems,
  sameRegistrableHint,
} from "../server/services/admin/articleFetcher";
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

  it("accepts bulk-delete id lists", () => {
    expect(
      pendingArticleBulkDeleteBodySchema.safeParse({
        ids: ["art_1", "art_2"],
      }).success,
    ).toBe(true);
    expect(
      pendingArticleBulkDeleteBodySchema.safeParse({ ids: [] }).success,
    ).toBe(false);
  });

  it("accepts daily-fetch settings patch", () => {
    expect(
      pendingArticleSettingsPatchBodySchema.safeParse({
        dailyFetchEnabled: true,
      }).success,
    ).toBe(true);
    expect(pendingArticleSettingsPatchBodySchema.safeParse({}).success).toBe(
      false,
    );
  });
});

describe("app setting keys", () => {
  it("uses an integer key for daily fetch", () => {
    expect(AppSettingKey.ArticlesDailyFetchEnabled).toBe(1);
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

describe("concise rewrite targets", () => {
  it("defaults to a ~2–3 minute reading window", () => {
    expect(targetReadingMinutes()).toEqual({ min: 2, max: 3 });
  });
});

describe("reputable feed sources", () => {
  it("only lists curated institutional/academic sources", () => {
    const names = ARTICLE_FEED_SOURCES.map((s) => s.name);
    expect(names).toContain("IEEE Spectrum");
    expect(names).toContain("MIT Technology Review");
    expect(names).toContain("Nature");
    expect(names).toContain("Quanta Magazine");
    expect(names).toContain("ACM Queue");
    expect(names).not.toContain("Hacker News");
    expect(names).not.toContain("TechCrunch");
    expect(names).not.toContain("Wired Science");
  });

  it("points Quanta at the canonical www feed URL", () => {
    const quanta = ARTICLE_FEED_SOURCES.find(
      (s) => s.name === "Quanta Magazine",
    );
    expect(quanta?.url).toBe("https://www.quantamagazine.org/feed/");
  });
});

describe("same-site redirect hint", () => {
  it("allows sibling subdomains of the same registrable domain", () => {
    expect(
      sameRegistrableHint("api.quantamagazine.org", "www.quantamagazine.org"),
    ).toBe(true);
    expect(sameRegistrableHint("www.example.com", "example.com")).toBe(true);
    expect(sameRegistrableHint("example.com", "evil.com")).toBe(false);
    expect(sameRegistrableHint("a.github.io", "b.evil.com")).toBe(false);
  });
});

describe("source attribution footer", () => {
  it("appends a Source markdown link", () => {
    const out = ensureSourceAttribution(
      "## Hello\n\nBody text.",
      "IEEE Spectrum",
      "https://spectrum.ieee.org/example",
    );
    expect(out).toContain("## Hello");
    expect(out).toContain(
      "**Source:** [IEEE Spectrum](https://spectrum.ieee.org/example)",
    );
  });

  it("replaces an older Adapted-from footer instead of duplicating", () => {
    const once = ensureSourceAttribution(
      "Story\n\n---\n*Adapted from [Old](https://example.com/a)*",
      "Nature",
      "https://www.nature.com/articles/x",
    );
    expect(once.match(/\*\*Source:\*\*/g)?.length).toBe(1);
    expect(once).toContain("https://www.nature.com/articles/x");
    expect(once).not.toContain("Adapted from");
  });

  it("skips unsafe URLs but still names the source", () => {
    const out = ensureSourceAttribution(
      "Body",
      "Local notes",
      "javascript:alert(1)",
    );
    expect(out).toContain("**Source:** Local notes");
    expect(out).not.toContain("javascript:");
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
