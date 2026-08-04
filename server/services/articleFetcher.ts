/**
 * RSS / Atom / ArXiv feed sources for the automated article pipeline.
 * Maps each of the 7 core directories to reputable public feeds.
 */

import type { PipelineCategorySlug } from "~/types/article";
import { PIPELINE_CATEGORY_SLUGS } from "~/types/article";
import { isSafeHttpUrl } from "~/utils/articleUrl";

export interface FeedSource {
  name: string;
  /** Absolute feed URL (RSS, Atom, or ArXiv API). */
  url: string;
  categorySlug: PipelineCategorySlug;
}

export interface FetchedFeedItem {
  title: string;
  url: string;
  sourceName: string;
  rawContent: string;
  publishedAt: string | null;
  categorySlug: PipelineCategorySlug;
}

export const ARTICLE_FEED_SOURCES: FeedSource[] = [
  {
    name: "IEEE Spectrum",
    url: "https://spectrum.ieee.org/feeds/feed.rss",
    categorySlug: "electronics",
  },
  {
    name: "ScienceDaily Engineering",
    url: "https://www.sciencedaily.com/rss/matter_energy/engineering.xml",
    categorySlug: "mechanical-engineering",
  },
  {
    name: "MIT Technology Review",
    url: "https://www.technologyreview.com/feed/",
    categorySlug: "information-technology",
  },
  {
    name: "Hacker News",
    url: "https://hnrss.org/frontpage",
    categorySlug: "information-technology",
  },
  {
    name: "ArXiv cs.NI (IoT/networks)",
    url: "https://export.arxiv.org/api/query?search_query=all:iot+OR+all:%22internet+of+things%22&start=0&max_results=8&sortBy=submittedDate&sortOrder=descending",
    categorySlug: "iot",
  },
  {
    name: "ArXiv math",
    url: "https://export.arxiv.org/api/query?search_query=cat:math*&start=0&max_results=8&sortBy=submittedDate&sortOrder=descending",
    categorySlug: "math",
  },
  {
    name: "Nature",
    url: "https://www.nature.com/nature.rss",
    categorySlug: "docs",
  },
  {
    name: "ArXiv recent CS",
    url: "https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG&start=0&max_results=8&sortBy=submittedDate&sortOrder=descending",
    categorySlug: "docs",
  },
  {
    name: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    categorySlug: "ideas",
  },
];

const FETCH_TIMEOUT_MS = 25_000;
const MAX_FEED_BYTES = 2_500_000;
const MAX_REDIRECTS = 3;
const FETCH_CONCURRENCY = 4;
const USER_AGENT =
  "DNTechX-ArticlePipeline/1.0 (+https://dntechx.com; content aggregator)";

function decodeXmlEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    );
}

function stripHtml(html: string): string {
  return decodeXmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tagContent(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = re.exec(block);
  const inner = m?.[1];
  return inner != null ? decodeXmlEntities(inner.trim()) : null;
}

function linkHref(block: string): string | null {
  const atom = /<link[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i.exec(block);
  if (atom?.[1]) {
    const rel = /\brel=["']([^"']+)["']/i.exec(atom[0]);
    if (!rel || rel[1] === "alternate") {
      return isSafeHttpUrl(atom[1]) ? atom[1].trim() : null;
    }
  }
  const allLinks = [
    ...block.matchAll(/<link[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/gi),
  ];
  for (const m of allLinks) {
    const href = m[1];
    if (!href || !isSafeHttpUrl(href)) continue;
    const rel = /\brel=["']([^"']+)["']/i.exec(m[0]);
    if (!rel || rel[1] === "alternate") return href.trim();
  }
  const firstHref = allLinks[0]?.[1];
  if (firstHref && isSafeHttpUrl(firstHref)) return firstHref.trim();

  const rssLink = tagContent(block, "link");
  if (rssLink && isSafeHttpUrl(rssLink)) return rssLink.trim();

  const id = tagContent(block, "id");
  if (id && isSafeHttpUrl(id)) return id.trim();
  return null;
}

function parseItems(xml: string): Array<{
  title: string;
  url: string;
  content: string;
  publishedAt: string | null;
}> {
  const chunks: string[] = [];
  const itemRe = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  const entryRe = /<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml))) {
    if (m[1]) chunks.push(m[1]);
  }
  while ((m = entryRe.exec(xml))) {
    if (m[1]) chunks.push(m[1]);
  }

  const out: Array<{
    title: string;
    url: string;
    content: string;
    publishedAt: string | null;
  }> = [];

  for (const block of chunks) {
    const titleRaw =
      tagContent(block, "title") || tagContent(block, "dc:title") || "";
    const title = stripHtml(titleRaw).slice(0, 512);
    const url = linkHref(block);
    if (!title || !url || !isSafeHttpUrl(url)) continue;

    const contentRaw =
      tagContent(block, "content:encoded") ||
      tagContent(block, "content") ||
      tagContent(block, "description") ||
      tagContent(block, "summary") ||
      tagContent(block, "arxiv:abstract") ||
      title;
    const content = stripHtml(contentRaw).slice(0, 50_000);
    if (content.length < 40) continue;

    const pubRaw =
      tagContent(block, "pubDate") ||
      tagContent(block, "published") ||
      tagContent(block, "updated") ||
      tagContent(block, "dc:date");
    let publishedAt: string | null = null;
    if (pubRaw) {
      const d = new Date(pubRaw);
      if (!Number.isNaN(d.getTime())) publishedAt = d.toISOString();
    }

    out.push({ title, url, content, publishedAt });
  }
  return out;
}

/** Block obvious private / link-local / metadata hosts (SSRF hardening). */
function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" ||
    host === "metadata.google.internal" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  // IPv4 literals
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  // IPv6 loopback / link-local (common forms)
  if (
    host === "::1" ||
    host.startsWith("fe80:") ||
    host.startsWith("fc") ||
    host.startsWith("fd")
  ) {
    return true;
  }
  return false;
}

function sameRegistrableHint(a: string, b: string): boolean {
  // Lightweight same-site check: exact host or subdomain of the original.
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return (
    left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`)
  );
}

async function readBodyCapped(
  res: Response,
  maxBytes: number,
): Promise<string> {
  const len = Number(res.headers.get("content-length") || 0);
  if (len > maxBytes) {
    throw new Error(`Feed body too large (${len} bytes)`);
  }
  if (!res.body) {
    const text = await res.text();
    if (text.length > maxBytes) {
      throw new Error(`Feed body too large (${text.length} bytes)`);
    }
    return text;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      throw new Error(`Feed body too large (>${maxBytes} bytes)`);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

async function fetchFeedXml(url: string): Promise<string> {
  if (!isSafeHttpUrl(url)) {
    throw new Error("Feed URL must be http(s)");
  }
  const originHost = new URL(url).hostname;
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(current);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Redirect to non-http(s) blocked");
    }
    if (isBlockedHostname(parsed.hostname)) {
      throw new Error("Redirect to private/metadata host blocked");
    }
    // Keep redirects on the same site family as the configured feed.
    if (!sameRegistrableHint(parsed.hostname, originHost)) {
      throw new Error(
        `Cross-host redirect blocked (${originHost} → ${parsed.hostname})`,
      );
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(current, {
        signal: ctrl.signal,
        headers: {
          Accept:
            "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
          "User-Agent": USER_AGENT,
        },
        redirect: "manual",
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) throw new Error(`Redirect ${res.status} without Location`);
        current = new URL(loc, current).toString();
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} fetching feed`);
      }
      return await readBodyCapped(res, MAX_FEED_BYTES);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Too many redirects (>${MAX_REDIRECTS})`);
}

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }
  const n = Math.min(concurrency, items.length || 1);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

/**
 * Pull recent items from all configured sources.
 * Dedupes by URL within this run; DB-level dedupe happens on insert.
 */
export async function fetchArticlesFromSources(opts?: {
  maxPerSource?: number;
  slugs?: readonly PipelineCategorySlug[];
}): Promise<{
  items: FetchedFeedItem[];
  errors: { source: string; message: string }[];
}> {
  const maxPerSource =
    opts?.maxPerSource ?? envInt("ARTICLES_FETCH_MAX_PER_SOURCE", 3);
  const slugSet = new Set(
    opts?.slugs ?? PIPELINE_CATEGORY_SLUGS,
  ) as Set<string>;
  const sources = ARTICLE_FEED_SOURCES.filter((s) =>
    slugSet.has(s.categorySlug),
  );

  const items: FetchedFeedItem[] = [];
  const errors: { source: string; message: string }[] = [];
  const seenUrls = new Set<string>();

  type SourceResult =
    | { ok: true; source: FeedSource; parsed: ReturnType<typeof parseItems> }
    | { ok: false; source: FeedSource; message: string };

  const results = await mapPool(
    sources,
    FETCH_CONCURRENCY,
    async (source): Promise<SourceResult> => {
      try {
        const xml = await fetchFeedXml(source.url);
        return {
          ok: true,
          source,
          parsed: parseItems(xml).slice(0, maxPerSource),
        };
      } catch (err) {
        return {
          ok: false,
          source,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  for (const result of results) {
    if (!result.ok) {
      errors.push({ source: result.source.name, message: result.message });
      continue;
    }
    for (const item of result.parsed) {
      if (!isSafeHttpUrl(item.url)) continue;
      const key = item.url.toLowerCase();
      if (seenUrls.has(key)) continue;
      seenUrls.add(key);
      items.push({
        title: item.title,
        url: item.url,
        sourceName: result.source.name,
        rawContent: item.content,
        publishedAt: item.publishedAt,
        categorySlug: result.source.categorySlug,
      });
    }
  }

  return { items, errors };
}
