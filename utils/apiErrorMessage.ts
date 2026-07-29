/**
 * Extract a human-readable message from a `$fetch` / `apiFetch` error.
 * Prefer this over ad-hoc `data.statusMessage` casts at call sites.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const body = (err as { data?: Record<string, unknown> })?.data;
  const fromData =
    typeof body?.statusMessage === "string" ? body.statusMessage : undefined;
  const fromErr = (err as { statusMessage?: string })?.statusMessage;
  return fromData || fromErr || fallback;
}
