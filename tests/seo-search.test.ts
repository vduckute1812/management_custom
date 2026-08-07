import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY } from "../server/utils/content-security-policy";

describe("CONTENT_SECURITY_POLICY", () => {
  it("allows the Cloudflare Insights beacon script host", () => {
    expect(CONTENT_SECURITY_POLICY).toContain(
      "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
    );
  });

  it("allows Google Fonts used by the manuscript feed", () => {
    expect(CONTENT_SECURITY_POLICY).toContain(
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    );
    expect(CONTENT_SECURITY_POLICY).toContain(
      "font-src 'self' data: https://fonts.gstatic.com",
    );
  });

  it("keeps connect-src narrow (no wildcard https:)", () => {
    expect(CONTENT_SECURITY_POLICY).toContain(
      "connect-src 'self' https://static.cloudflareinsights.com https://accounts.google.com https://oauth2.googleapis.com",
    );
    expect(CONTENT_SECURITY_POLICY).not.toMatch(
      /connect-src 'self' https:(;|$)/,
    );
  });
});

describe("public/llms.txt", () => {
  const body = readFileSync(new URL("../public/llms.txt", import.meta.url), {
    encoding: "utf8",
  });

  it("starts with a required H1 heading", () => {
    expect(body.trimStart().startsWith("# ")).toBe(true);
  });

  it("includes absolute Markdown links for agents", () => {
    expect(body).toMatch(/\[.+\]\(https:\/\/dntechx\.com\/\)/);
    expect(body).toMatch(/\[.+\]\(https:\/\/dntechx\.com\/feed\)/);
    expect(body).toMatch(/\[.+\]\(https:\/\/dntechx\.com\/sitemap\.xml\)/);
  });
});
