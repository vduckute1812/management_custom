/**
 * Shared signup password rules (client + server).
 *
 * Keep this module free of Nuxt/Vue context so Nitro handlers can import it.
 */

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordRuleId =
  "minLength" | "lower" | "upper" | "digit" | "special";

export interface PasswordRuleResult {
  id: PasswordRuleId;
  ok: boolean;
}

const SPECIAL_RE = /[^A-Za-z0-9]/;

export function evaluatePassword(password: string): PasswordRuleResult[] {
  return [
    { id: "minLength", ok: password.length >= PASSWORD_MIN_LENGTH },
    { id: "lower", ok: /[a-z]/.test(password) },
    { id: "upper", ok: /[A-Z]/.test(password) },
    { id: "digit", ok: /\d/.test(password) },
    { id: "special", ok: SPECIAL_RE.test(password) },
  ];
}

export function isPasswordStrong(password: string): boolean {
  return evaluatePassword(password).every((r) => r.ok);
}

/** English statusMessage for API 400 responses (not localized). */
export function passwordStrengthError(password: string): string | null {
  if (isPasswordStrong(password)) return null;
  return (
    `Password must be at least ${PASSWORD_MIN_LENGTH} characters and include ` +
    "uppercase, lowercase, a number, and a special character"
  );
}
