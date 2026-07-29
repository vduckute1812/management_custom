/** Extract the client IP from proxy headers or the socket. */
export function clientIp(event: {
  node: {
    req: {
      headers: Record<string, string | string[] | undefined>;
      socket?: { remoteAddress?: string };
    };
  };
}): string {
  const headers = event.node.req.headers;
  const forwarded = headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded)
    ? forwarded[0]?.split(",")[0]?.trim()
    : forwarded?.split(",")[0]?.trim();
  const realIp = headers["x-real-ip"];
  return (
    ip ||
    (Array.isArray(realIp) ? realIp[0] : realIp) ||
    event.node.req.socket?.remoteAddress ||
    "unknown"
  );
}
