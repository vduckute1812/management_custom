import { createError } from "h3";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { H3Event } from "h3";
import {
  AuthOAuthIntent,
  isAuthOAuthIntent,
  type AuthOAuthIntent as AuthOAuthIntentT,
} from "../../types/auth";
import { generateOpaqueToken } from "./auth";

const STATE_TTL_SECONDS = 10 * 60;
const OAUTH_STATE_COOKIE = "mgmt_oauth";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
/** Google OIDC userinfo (must include /v3 — bare /userinfo 404s). */
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleOAuthState {
  intent: AuthOAuthIntentT;
  redirect: string;
  nonce: string;
  userId?: string;
  /** Preferred locale for new Google accounts. */
  locale?: string;
  exp: number;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

function appBaseUrl(): string {
  const override = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");
  if (override) return override;
  const host = process.env.APP_HOST?.trim() || "localhost";
  const port = process.env.APP_PORT?.trim() || "3000";
  const protocol = process.env.APP_PROTOCOL?.trim() || "http";
  const omitPort =
    (protocol === "http" && port === "80") ||
    (protocol === "https" && port === "443");
  return omitPort ? `${protocol}://${host}` : `${protocol}://${host}:${port}`;
}

export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const redirectOverride = process.env.GOOGLE_REDIRECT_URI?.trim();
  const redirectUri =
    redirectOverride || `${appBaseUrl()}/api/auth/google/callback`;
  return { clientId, clientSecret, redirectUri };
}

export function isGoogleOAuthConfigured(): boolean {
  return getGoogleOAuthConfig() != null;
}

/** Only same-origin relative paths — blocks open redirects. */
export function safeOAuthRedirect(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("://")) return fallback;
  return trimmed;
}

function stateSecret(): string {
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error("JWT_SECRET must be set (>=16 chars) for OAuth state");
  }
  return raw;
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b.toString("base64url");
}

function signStatePayload(payloadJson: string): string {
  const body = b64url(payloadJson);
  const sig = createHmac("sha256", stateSecret()).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

export function createOAuthState(input: {
  intent: AuthOAuthIntentT;
  redirect: string;
  userId?: string;
  locale?: string;
}): { state: string; nonce: string } {
  const nonce = generateOpaqueToken(16);
  const payload: GoogleOAuthState = {
    intent: input.intent,
    redirect: safeOAuthRedirect(input.redirect),
    nonce,
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.locale ? { locale: input.locale } : {}),
  };
  return { state: signStatePayload(JSON.stringify(payload)), nonce };
}

export function parseOAuthState(raw: string): GoogleOAuthState | null {
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const expected = createHmac("sha256", stateSecret()).update(body).digest();
  let given: Buffer;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (!isAuthOAuthIntent(obj.intent)) return null;
  if (typeof obj.nonce !== "string" || !obj.nonce) return null;
  if (typeof obj.exp !== "number" || obj.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  const redirect = safeOAuthRedirect(obj.redirect);
  const userId =
    typeof obj.userId === "string" && obj.userId ? obj.userId : undefined;
  return {
    intent: obj.intent,
    redirect,
    nonce: obj.nonce,
    exp: obj.exp,
    ...(userId ? { userId } : {}),
  };
}

function cookieSecure(): boolean {
  const forced = process.env.COOKIE_SECURE;
  if (forced === "0" || forced === "false") return false;
  if (forced === "1" || forced === "true") return true;
  const base = process.env.APP_BASE_URL ?? "";
  if (base.startsWith("https://")) return true;
  return process.env.NODE_ENV === "production";
}

export function setOAuthStateCookie(event: H3Event, nonce: string): void {
  setCookie(event, OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });
}

export function clearOAuthStateCookie(event: H3Event): void {
  deleteCookie(event, OAUTH_STATE_COOKIE, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
  });
}

export function readOAuthStateCookie(event: H3Event): string {
  return (getCookie(event, OAUTH_STATE_COOKIE) ?? "").trim();
}

export function buildGoogleAuthorizeUrl(
  config: GoogleOAuthConfig,
  state: string,
): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function exchangeGoogleCode(
  config: GoogleOAuthConfig,
  code: string,
): Promise<string> {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[google-oauth] token exchange failed", res.status, text);
    throw createError({
      statusCode: 502,
      statusMessage: "Google token exchange failed",
    });
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw createError({
      statusCode: 502,
      statusMessage: "Google token response missing access_token",
    });
  }
  return json.access_token;
}

export async function fetchGoogleProfile(
  accessToken: string,
): Promise<GoogleProfile> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[google-oauth] userinfo failed", res.status, text);
    throw createError({
      statusCode: 502,
      statusMessage: "Google userinfo failed",
    });
  }
  const json = (await res.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
    name?: string;
    picture?: string;
  };
  const sub = json.sub?.trim();
  const email = json.email?.trim().toLowerCase();
  if (!sub || !email) {
    throw createError({
      statusCode: 502,
      statusMessage: "Google profile missing sub/email",
    });
  }
  const emailVerified =
    json.email_verified === true || json.email_verified === "true";
  return {
    sub,
    email,
    emailVerified,
    name: json.name?.trim() || undefined,
    picture: json.picture?.trim() || undefined,
  };
}

export function parseIntentQuery(raw: unknown): AuthOAuthIntentT {
  if (raw === "link" || raw === "1" || raw === 1) return AuthOAuthIntent.Link;
  return AuthOAuthIntent.Login;
}
