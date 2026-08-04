/**
 * Client IP for rate limiting.
 *
 * Trust order matches the production proxy chain (Cloudflare Tunnel → nginx →
 * Nitro). Earlier versions took the *first* `X-Forwarded-For` hop, which is
 * client-controlled: anyone who can reach the origin (or whose proxy appends
 * rather than replaces) could rotate a fresh bucket per request and bypass
 * the auth budgets entirely.
 *
 * Forwarded headers (`CF-Connecting-IP`, `X-Real-IP`) are trusted **only** when
 * the TCP peer is a configured proxy (loopback, `LAN_IP`, and
 * `TRUSTED_PROXY_IPS`). A direct LAN hit to `:3000` can forge those headers —
 * those requests fall back to the socket address.
 *
 *   1. CF-Connecting-IP — set by Cloudflare at the edge (when peer is trusted).
 *   2. X-Real-IP — nginx overwrites this with `$remote_addr` on every proxy hop.
 *   3. Socket remoteAddress — last resort (direct connections, tests).
 *
 * `X-Forwarded-For` is intentionally ignored.
 */
export function clientIp(event: {
  node: {
    req: {
      headers: Record<string, string | string[] | undefined>;
      socket?: { remoteAddress?: string };
    };
  };
}): string {
  const socket = normalizeIp(event.node.req.socket?.remoteAddress || "");
  const headers = event.node.req.headers;

  if (socket && isTrustedProxy(socket)) {
    const cf = headerValue(headers["cf-connecting-ip"]);
    if (cf) return cf;

    const realIp = headerValue(headers["x-real-ip"]);
    if (realIp) return realIp;
  }

  return socket || "unknown";
}

/** Exported for tests. */
export function isTrustedProxy(ip: string): boolean {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  return trustedProxyIps().has(normalized);
}

function trustedProxyIps(): Set<string> {
  const ips = new Set<string>(["127.0.0.1", "::1"]);
  const lan = process.env.LAN_IP?.trim();
  if (lan) ips.add(normalizeIp(lan));
  const extra = process.env.TRUSTED_PROXY_IPS?.trim();
  if (extra) {
    for (const part of extra.split(",")) {
      const ip = normalizeIp(part.trim());
      if (ip) ips.add(ip);
    }
  }
  return ips;
}

function normalizeIp(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("::ffff:")) return trimmed.slice(7);
  return trimmed;
}

function headerValue(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed || undefined;
}
