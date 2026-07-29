/**
 * Stable identity for client-side apiFetch in-flight coalescing.
 * Query must be part of the key so filtered and unfiltered GETs stay distinct.
 */

export function serializeQuery(
  query: Record<string, unknown> | undefined,
): string {
  if (!query) return "";
  return Object.keys(query)
    .sort()
    .flatMap((key) => {
      const raw = query[key];
      if (raw == null) return [];
      const values = Array.isArray(raw) ? raw : [raw];
      return values
        .filter((value) => value != null)
        .map((value) => `${key}=${String(value)}`);
    })
    .join("&");
}

export function requestKey(
  url: string,
  method: string,
  query?: Record<string, unknown>,
): string {
  const q = serializeQuery(query);
  const base = `${method.toUpperCase()}:${url}`;
  return q ? `${base}?${q}` : base;
}
