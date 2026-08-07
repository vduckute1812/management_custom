/**
 * RSS / Atom / ArXiv feed sources for the automated article pipeline.
 * Curated to well-known, reputable publishers and academic archives only.
 */

import type { PipelineCategorySlug } from "~/types/article";
import { PIPELINE_CATEGORY_SLUGS } from "~/types/article";
import { isSafeHttpUrl } from "~/utils/articleUrl";
import {
  fetchArticlePageText,
  fetchFeedXml,
} from "~/server/services/articleFetchHttp";
export { sameRegistrableHint } from "~/server/services/articleFetchHttp";

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

/** Reputable institutional / academic / long-standing tech journalism only. */
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
    name: "ArXiv cs.NI (IoT/networks)",
    url: "https://export.arxiv.org/api/query?search_query=all:iot+OR+all:%22internet+of+things%22&start=0&max_results=10&sortBy=submittedDate&sortOrder=descending",
    categorySlug: "iot",
  },
  {
    name: "Quanta Magazine",
    url: "https://www.quantamagazine.org/feed/",
    categorySlug: "math",
  },
  {
    name: "ArXiv math",
    url: "https://export.arxiv.org/api/query?search_query=cat:math.CO+OR+cat:math.PR+OR+cat:math.OC&start=0&max_results=10&sortBy=submittedDate&sortOrder=descending",
    categorySlug: "math",
  },
  {
    name: "Nature",
    url: "https://www.nature.com/nature.rss",
    categorySlug: "docs",
  },
  {
    name: "ArXiv cs.AI / cs.LG",
    url: "https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG&start=0&max_results=10&sortBy=submittedDate&sortOrder=descending",
    categorySlug: "docs",
  },
  {
    name: "ACM Queue",
    url: "https://queue.acm.org/rss/feeds/queuecontent.xml",
    categorySlug: "ideas",
  },
];

const FETCH_CONCURRENCY = 4;
const PAGE_EXPAND_CONCURRENCY = 2;
/** How many feed entries to consider before length-ranking. */
const CANDIDATES_PER_SOURCE = 16;

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
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Prefer `<article>` / `<main>` text when expanding a full page. */
export function extractMainTextFromHtml(html: string): string {
  const article =
    /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html)?.[1] ||
    /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ||
    /<div[^>]+(?:class|id)=["'][^"']*(?:article|post|entry|content|story)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(
      html,
    )?.[1] ||
    html;
  return stripHtml(article).slice(0, 50_000);
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
    // Soft floor while parsing; hard floor applied after optional page expand.
    if (content.length < 80) continue;

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

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

/** Minimum accepted raw body length after RSS (+ optional page expand). */
export function minRawContentChars(): number {
  return envInt("ARTICLES_FETCH_MIN_CHARS", 800);
}

/** Expand article HTML when RSS body is shorter than this. */
export function expandBelowChars(): number {
  return envInt("ARTICLES_EXPAND_BELOW_CHARS", 1500);
}

/**
 * Rank candidates by body length (desc) and keep the longest that clear the
 * minimum length floor.
 */
export function selectLongestItems<T extends { content: string }>(
  items: T[],
  maxKeep: number,
  minChars: number,
): T[] {
  return [...items]
    .filter((i) => i.content.trim().length >= minChars)
    .sort((a, b) => b.content.length - a.content.length)
    .slice(0, maxKeep);
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

async function maybeExpandItems(
  parsed: ReturnType<typeof parseItems>,
): Promise<ReturnType<typeof parseItems>> {
  const expandEnabled = envBool("ARTICLES_EXPAND_PAGES", true);
  const below = expandBelowChars();
  if (!expandEnabled) return parsed;

  return mapPool(parsed, PAGE_EXPAND_CONCURRENCY, async (item) => {
    if (item.content.length >= below) return item;
    const pageText = await fetchArticlePageText(
      item.url,
      extractMainTextFromHtml,
    );
    if (!pageText || pageText.length <= item.content.length) return item;
    return { ...item, content: pageText };
  });
}

/**
 * Pull recent items from all configured sources.
 * Dedupes by URL within this run; DB-level dedupe happens on insert.
 * Prefers the longest bodies per source (after optional full-page expand).
 */
export async function fetchArticlesFromSources(opts?: {
  maxPerSource?: number;
  slugs?: readonly PipelineCategorySlug[];
}): Promise<{
  items: FetchedFeedItem[];
  errors: { source: string; message: string }[];
}> {
  const maxPerSource =
    opts?.maxPerSource ?? envInt("ARTICLES_FETCH_MAX_PER_SOURCE", 1);
  const minChars = minRawContentChars();
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
        const candidates = parseItems(xml).slice(0, CANDIDATES_PER_SOURCE);
        const expanded = await maybeExpandItems(candidates);
        const selected = selectLongestItems(expanded, maxPerSource, minChars);
        return { ok: true, source, parsed: selected };
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
