/**
 * Display-name helpers shared by signup, OAuth create, and row mapping.
 */

/** Max length for `users.name` in app validation (column is VARCHAR(255)). */
export const DISPLAY_NAME_MAX = 120;

/**
 * Derive a display name from an email address when none was provided.
 * Uses the local-part before `@`, turns `.` / `_` / `-` into spaces, and
 * collapses whitespace. Falls back to `"User"` if nothing usable remains.
 */
export function nameFromEmail(email: string): string {
  const local =
    String(email ?? "")
      .trim()
      .split("@")[0]
      ?.trim() ?? "";
  const cleaned = local
    .replace(/[._+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const name = cleaned || "User";
  return name.length > DISPLAY_NAME_MAX
    ? name.slice(0, DISPLAY_NAME_MAX)
    : name;
}

/** Trim and cap a provided display name; empty → null. */
export function normalizeDisplayName(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.length > DISPLAY_NAME_MAX
    ? trimmed.slice(0, DISPLAY_NAME_MAX)
    : trimmed;
}

/** Prefer an explicit name; otherwise derive from email. Always non-empty. */
export function resolveDisplayName(
  name: string | null | undefined,
  email: string,
): string {
  return normalizeDisplayName(name) ?? nameFromEmail(email);
}
