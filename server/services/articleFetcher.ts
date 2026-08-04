/**
 * RSS / Atom / ArXiv feed sources for the automated article pipeline.
 * Maps each of the 7 core directories to reputable public feeds.
 */

import type { PipelineCategorySlug } from "~/types/article";
import { PIPELINE_CATEGORY_SLUGS } from "~/types/article";

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
  // Atom: <link href="..." /> or <link rel="alternate" href="..."/>
  const atom = /<link[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i.exec(block);
  if (atom?.[1]) {
    const rel = /\brel=["']([^"']+)["']/i.exec(atom[0]);
    if (!rel || rel[1] === "alternate" || rel[1] === "self") {
      // Prefer alternate; fall through to first href
    }
    if (!rel || rel[1] === "alternate") return atom[1].trim();
  }
  const allLinks = [
    ...block.matchAll(/<link[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/gi),
  ];
  for (const m of allLinks) {
    const href = m[1];
    if (!href) continue;
    const rel = /\brel=["']([^"']+)["']/i.exec(m[0]);
    if (!rel || rel[1] === "alternate") return href.trim();
  }
  const firstHref = allLinks[0]?.[1];
  if (firstHref) return firstHref.trim();

  const rssLink = tagContent(block, "link");
  if (rssLink && /^https?:\/\//i.test(rssLink)) return rssLink.trim();

  const id = tagContent(block, "id");
  if (id && /^https?:\/\//i.test(id)) return id.trim();
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
    if (!title || !url) continue;

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

async function fetchFeedXml(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        "User-Agent": USER_AGENT,
      },
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
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

  for (const source of sources) {
    try {
      const xml = await fetchFeedXml(source.url);
      const parsed = parseItems(xml).slice(0, maxPerSource);
      for (const item of parsed) {
        const key = item.url.toLowerCase();
        if (seenUrls.has(key)) continue;
        seenUrls.add(key);
        items.push({
          title: item.title,
          url: item.url,
          sourceName: source.name,
          rawContent: item.content,
          publishedAt: item.publishedAt,
          categorySlug: source.categorySlug,
        });
      }
    } catch (err) {
      errors.push({
        source: source.name,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { items, errors };
}
