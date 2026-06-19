/**
 * Datetime + JSON helpers used at the DB boundary.
 *
 * MySQL's DATETIME(3) doesn't carry a timezone — we always store UTC and
 * always serialize as ISO 8601. The `dateStrings: true` pool option means
 * the driver hands us back `"2026-06-18 16:04:10.047"` shaped strings,
 * which we promote to ISO on read.
 */

export function isoToDB(iso: string): string {
  // "2026-06-18T16:04:10.047Z" → "2026-06-18 16:04:10.047" (UTC, no tz suffix)
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.` +
    `${pad(d.getUTCMilliseconds(), 3)}`
  );
}

export function dbToISO(value: string | null): string {
  if (!value) return "";
  // "2026-06-18 16:04:10.047" → "2026-06-18T16:04:10.047Z" (treat as UTC)
  const normalized = value.replace(" ", "T");
  return normalized.endsWith("Z") ? normalized : `${normalized}Z`;
}

export function dateOnlyOrNull(input: string | null | undefined): string | null {
  if (!input) return null;
  // Accept either "YYYY-MM-DD" directly or an ISO datetime; coerce to date.
  const m = /^\d{4}-\d{2}-\d{2}/.exec(input);
  return m ? m[0] : null;
}

export function jsonOrNull<T>(value: T | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

export function parseJsonArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}
