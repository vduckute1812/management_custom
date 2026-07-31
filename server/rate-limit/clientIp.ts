/**
 * Client IP for rate limiting.
 *
 * Trust order matches the production proxy chain (Cloudflare Tunnel → nginx →
 * Nitro). Earlier versions took the *first* `X-Forwarded-For` hop, which is
 * client-controlled: anyone who can reach the origin (or whose proxy appends
 * rather than replaces) could rotate a fresh bucket per request and bypass
 * the auth budgets entirely.
 *
 *   1. CF-Connecting-IP — set by Cloudflare at the edge; not forgeable once
 *      the request has gone through the tunnel.
 *   2. X-Real-IP — nginx overwrites this with `$remote_addr` on every proxy
 *      hop (`docker/nginx.prod.conf.template`), so it is the TCP peer nginx
 *      saw, not a client-supplied value.
 *   3. Socket remoteAddress — last resort (direct connections, tests).
 *
 * `X-Forwarded-For` is intentionally ignored: with `$proxy_add_x_forwarded_for`
 * the first hop is spoofable and the last hop is usually cloudflared/loopback,
 * neither of which is a useful bucket key.
 */
export function clientIp(event: {
  node: {
    req: {
      headers: Record<string, string | string[] | undefined>;
      socket?: { remoteAddress?: string };
    };
  };
}): string {
  const headers = event.node.req.headers;

  const cf = headerValue(headers["cf-connecting-ip"]);
  if (cf) return cf;

  const realIp = headerValue(headers["x-real-ip"]);
  if (realIp) return realIp;

  return event.node.req.socket?.remoteAddress || "unknown";
}

function headerValue(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed || undefined;
}
