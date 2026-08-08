import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isSafeHttpUrl } from "~/utils/articleUrl";

const FETCH_TIMEOUT_MS = 25_000;
const PAGE_FETCH_TIMEOUT_MS = 20_000;
const MAX_FEED_BYTES = 2_500_000;
const MAX_PAGE_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const USER_AGENT =
  "DNTechX-ArticlePipeline/1.0 (+https://dntechx.com; content aggregator)";

/** Block obvious private / link-local / metadata hosts (SSRF hardening). */
export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" ||
    host === "metadata.google.internal" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  if (isBlockedIpLiteral(host)) return true;
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

export function isBlockedIpLiteral(host: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (match) {
    const firstOctet = Number(match[1]);
    const secondOctet = Number(match[2]);
    if (firstOctet === 10 || firstOctet === 127 || firstOctet === 0) {
      return true;
    }
    if (firstOctet === 169 && secondOctet === 254) return true;
    if (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
    if (firstOctet === 192 && secondOctet === 168) return true;
    return false;
  }
  return false;
}

/** Resolve DNS and reject private / link-local answers (incl. DNS rebinding). */
export async function assertPublicResolvedHost(
  hostname: string,
): Promise<void> {
  if (isBlockedHostname(hostname)) {
    throw new Error("Private/metadata host blocked");
  }
  if (isIP(hostname)) {
    if (isBlockedIpLiteral(hostname) || isBlockedHostname(hostname)) {
      throw new Error("Private IP blocked");
    }
    return;
  }
  let records: { address: string; family: number }[];
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("DNS lookup failed");
  }
  if (!records.length) {
    throw new Error("DNS lookup returned no addresses");
  }
  for (const record of records) {
    if (
      isBlockedHostname(record.address) ||
      isBlockedIpLiteral(record.address)
    ) {
      throw new Error("Host resolves to a private address");
    }
  }
}

/** Approximate eTLD+1 for same-site redirect checks (no PSL dependency). */
export function registrableHint(hostname: string): string {
  const parts = hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .split(".")
    .filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

/**
 * True when hosts are the same site family: exact, parent/child subdomain, or
 * sibling subdomains of the same registrable domain (api.x.org → www.x.org).
 */
export function sameRegistrableHint(a: string, b: string): boolean {
  const left = a.toLowerCase().replace(/\.$/, "");
  const right = b.toLowerCase().replace(/\.$/, "");
  if (
    left === right ||
    left.endsWith(`.${right}`) ||
    right.endsWith(`.${left}`)
  ) {
    return true;
  }
  return registrableHint(left) === registrableHint(right);
}

export async function readBodyCapped(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const length = Number(response.headers.get("content-length") || 0);
  if (length > maxBytes) {
    throw new Error(`Body too large (${length} bytes)`);
  }
  if (!response.body) {
    const text = await response.text();
    if (text.length > maxBytes) {
      throw new Error(`Body too large (${text.length} bytes)`);
    }
    return text;
  }
  const reader = response.body.getReader();
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
      throw new Error(`Body too large (>${maxBytes} bytes)`);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

export async function fetchHttpText(
  url: string,
  options: {
    accept: string;
    maxBytes: number;
    timeoutMs: number;
    /** When set, redirects must stay on this host family. */
    lockHost?: string;
  },
): Promise<string> {
  if (!isSafeHttpUrl(url)) {
    throw new Error("URL must be http(s)");
  }
  const originHost = options.lockHost || new URL(url).hostname;
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(current);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Redirect to non-http(s) blocked");
    }
    if (isBlockedHostname(parsed.hostname)) {
      throw new Error("Redirect to private/metadata host blocked");
    }
    await assertPublicResolvedHost(parsed.hostname);
    if (!sameRegistrableHint(parsed.hostname, originHost)) {
      throw new Error(
        `Cross-host redirect blocked (${originHost} → ${parsed.hostname})`,
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(current, {
        signal: controller.signal,
        headers: {
          Accept: options.accept,
          "User-Agent": USER_AGENT,
        },
        redirect: "manual",
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new Error(`Redirect ${response.status} without Location`);
        }
        current = new URL(location, current).toString();
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await readBodyCapped(response, options.maxBytes);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Too many redirects (>${MAX_REDIRECTS})`);
}

export async function fetchFeedXml(url: string): Promise<string> {
  return fetchHttpText(url, {
    accept:
      "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    maxBytes: MAX_FEED_BYTES,
    timeoutMs: FETCH_TIMEOUT_MS,
  });
}

export async function fetchArticlePageText(
  url: string,
  extractText: (html: string) => string,
): Promise<string | null> {
  try {
    const html = await fetchHttpText(url, {
      accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      maxBytes: MAX_PAGE_BYTES,
      timeoutMs: PAGE_FETCH_TIMEOUT_MS,
      lockHost: new URL(url).hostname,
    });
    const text = extractText(html);
    return text.length >= 200 ? text : null;
  } catch {
    return null;
  }
}
