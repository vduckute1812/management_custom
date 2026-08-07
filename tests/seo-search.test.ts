import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildApiContentSecurityPolicy,
  buildDocumentContentSecurityPolicy,
} from "../server/utils/content-security-policy";
import { THEME_BOOT_SCRIPT } from "../utils/themeBootScript";

describe("CONTENT_SECURITY_POLICY", () => {
  const apiCsp = buildApiContentSecurityPolicy();
  const docCsp = buildDocumentContentSecurityPolicy("testdocnonce+/=");

  it("allows the Cloudflare Insights beacon script host", () => {
    expect(apiCsp).toContain(
      "script-src 'self' https://static.cloudflareinsights.com",
    );
    expect(docCsp).toContain(
      "script-src 'self' 'nonce-testdocnonce+/=' https://static.cloudflareinsights.com",
    );
  });

  it("does not allow script unsafe-inline", () => {
    expect(apiCsp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(docCsp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("blocks inline script event handlers", () => {
    expect(apiCsp).toContain("script-src-attr 'none'");
    expect(docCsp).toContain("script-src-attr 'none'");
  });

  it("allows Google Fonts used by the manuscript feed", () => {
    expect(apiCsp).toContain(
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    );
    expect(apiCsp).toContain("font-src 'self' data: https://fonts.gstatic.com");
  });

  it("keeps connect-src narrow (no wildcard https:)", () => {
    expect(apiCsp).toContain(
      "connect-src 'self' https://static.cloudflareinsights.com https://accounts.google.com https://oauth2.googleapis.com",
    );
    expect(apiCsp).not.toMatch(/connect-src 'self' https:(;|$)/);
  });

  it("rejects empty or unsafe nonce tokens", () => {
    expect(() => buildDocumentContentSecurityPolicy("")).toThrow(/nonce/);
    expect(() => buildDocumentContentSecurityPolicy("a b")).toThrow(/nonce/);
  });
});

describe("THEME_BOOT_SCRIPT", () => {
  it("is the shared pre-hydration theme boot used by nuxt.config", () => {
    expect(THEME_BOOT_SCRIPT).toContain("mgmt:settings:v1");
    expect(THEME_BOOT_SCRIPT).toContain("dataset.theme");
    const nuxtConfig = readFileSync(
      new URL("../nuxt.config.ts", import.meta.url),
      "utf8",
    );
    expect(nuxtConfig).toContain("THEME_BOOT_SCRIPT");
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
