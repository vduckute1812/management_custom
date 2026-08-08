# Authentication & RBAC — Implementation

The original feature spec lives in [`auth-rbac.md`](./auth-rbac.md). This document is the as-built reference: how roles, tokens, and the email-verification dance are actually wired together. See [`api.md`](./api.md) for the route table and [`database.md`](./database.md) for the underlying tables.

---

## Roles

| Role         | Sees                                                              | Can do                                                                                                                                                                                                          |
| ------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normal`     | Own epics/tasks/timer; install feed/stories per visibility rules. | Full Time Management for own data. Feed: create/react/comment/share within ACL.                                                                                                                                 |
| `admin`      | Everything `normal` sees, plus a system-wide admin dashboard.     | Promote/demote other users between `admin` ↔ `normal`, view per-user roll-ups & charts.                                                                                                                         |
| `superadmin` | Same as `admin`. Exactly one per install (the bootstrap account). | Everything `admin` can, plus owner-only ops (e.g. `DELETE /api/admin/users/:id`). Role is **never assignable through the API** — only seeded by `npm run migrate:auth` — and **cannot be modified or demoted**. |

The role is enforced in three layers:

1. **Token claim** — `role` is signed into every JWT as the same integer that's persisted in MySQL and re-validated on `GET /api/auth/me`. All three values (`0` / `1` / `2`) are accepted; anything else is rejected as invalid.
2. **Route guard** — admin-only API routes call `requireAdmin(event)` (`role >= Admin`). Owner-only routes call `requireSuperAdmin(event)` (used today for deleting users). Client-side `middleware/auth.global.ts` mirrors this for `/admin`.
3. **DB scope** — Time-management helpers take `userId` and filter ownership in SQL. Feed helpers take an optional viewer id (`listFeedPosts(viewerId | null, …)`) so **public** posts are readable without a session; private/shared content stays ACL-gated.

## Client route access

| Paths                                                                                         | Rule                                                                                                                                               |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`, `/feed` (+ nested)                                                                       | Public                                                                                                                                             |
| `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`, `/auth/continue` | Public; if already authenticated → `/` (or `?redirect=`) for login/signup/forgot-password. `/auth/continue` hydrates OAuth cookies into `useAuth`. |
| `/tasks`, `/epics`, `/analytics`, `/settings`, `/profile`, `/chat`, …                         | Require session → else `/login?redirect=…`                                                                                                         |
| `/admin`                                                                                      | Require admin role → else `/` + toast                                                                                                              |

See `middleware/auth.global.ts`.

The `users.role` column is `TINYINT UNSIGNED` and the same integer flows unchanged through the row mapper, the API response, and the JWT claim. There are no `numberToRole` / `roleToNumber` translation helpers — the TypeScript type IS the integer. See `~/types/auth.ts` for the canonical `UserRole` definition and [`database.md`](./database.md) for the rationale behind integer enums end-to-end.

---

## HttpOnly cookies

| Cookie       | Purpose                                              | Max-Age | JS readable |
| ------------ | ---------------------------------------------------- | ------- | ----------- |
| `mgmt_rt`    | Refresh token (opaque, SHA-256 hash in DB)           | 30 days | No          |
| `mgmt_at`    | Access JWT mirror for same-origin media              | 15 min  | No          |
| `mgmt_oauth` | Short-lived OAuth CSRF nonce (Google start/callback) | 10 min  | No          |

## Google OAuth

Optional. When `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set:

1. Login/signup show **Continue with Google** → `GET /api/auth/google?intent=login`.
2. Callback resolves the Google identity (`resolveGoogleOAuthUser`):
   - **New email** → create an OAuth-only user (`password_hash NULL`, `email_verified=1`).
   - **Existing verified email** → auto-link Google to that account (same session cookies).
   - **Existing unverified password account** → **refuse** with `oauth_error=unverified` (no `linkIdentity`, no silent `email_verified` flip). The user must verify email (or reset password) before Google can take over that address.
3. On success, issues the same cookie session as password login and redirects to **`/auth/continue?redirect=…`** so the client can hydrate `useAuth` from the HttpOnly cookies (otherwise a fresh browser has no `auth:hasSession` flag and would paint as a guest).
4. Settings → Account can **Link Google** (`intent=link`, emails must match; client refreshes the access cookie first) or **Unlink** (requires a local password so the account is not locked out). Cancel/error during link returns to Settings, not Login.

Token exchange / userinfo failures log **HTTP status only** — response bodies are drained and discarded (never written to logs).

Redirect URI: `{APP_BASE_URL}/api/auth/google/callback` (or `GOOGLE_REDIRECT_URI`). Provider enum: `AuthProvider.Google = 0` in `auth_identities.provider`.

### Google Auth Platform branding (consent screen)

Google brand verification rejects logos that are only generic initials (e.g. a plain “TX” badge) with **“Your logo does not uniquely identify your brand and identity.”** Upload a mark that clearly attributes the app to **Da Nang TechX**.

| Field           | Value                                                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App name        | `Da Nang TechX` (must match homepage / `site.name` / `application-name` meta)                                                                                                                 |
| App logo        | `public/branding/google-oauth-logo.png` — **exactly 120×120** PNG, indigo plate with TX seal + readable **DA NANG** / **TechX** wordmark (`google-oauth-logo-master.png` is the 512px source) |
| Homepage        | `https://dntechx.com` (SSR HTML must show the name **Da Nang TechX** and describe the portal)                                                                                                 |
| Privacy / Terms | `https://dntechx.com/privacy`, `https://dntechx.com/terms`                                                                                                                                    |

Console: [Google Auth Platform → Branding](https://console.cloud.google.com/auth/branding?project=gen-lang-client-0970758271). After uploading the new logo (and confirming the app name), save draft branding and **resubmit for verification**. The compact `/logo.png` circular TX seal stays for the in-app header/favicon; do not upload that alone to Google.

Both auth cookies are `HttpOnly`, `SameSite=Lax`, `Path=/`. `Secure` defaults to on in production / when `APP_BASE_URL` is `https://`; override with `COOKIE_SECURE=false` for plain `http://localhost` dev.

Login and refresh set both cookies. Logout revokes the refresh hash server-side and clears cookies.

Cookie-authenticated mutations (`refresh`, `logout`, Google unlink, account delete, and every other mutating `/api/*` that carries `mgmt_rt` / `mgmt_at`) apply a same-origin check (`Origin` / `Referer` must match `Host`). In production (Secure cookies / `https` `APP_BASE_URL`, or `CSRF_REQUIRE_ORIGIN=1`), a missing Origin **and** Referer is also rejected.

Refresh tokens belong to a **family** (`auth_refresh_tokens.family_id`). Login starts a family; each successful refresh keeps the same id. Presenting an already-revoked refresh hash **outside a short grace window** (~15s) revokes the entire family so a stolen token cannot keep minting sessions after the victim refreshed. Presentations inside the grace window are treated as concurrent-tab races (401 only) so the winner's new session is not killed.

### Self-service account deletion

Settings → Danger zone opens `DeleteAccountModal`: the user must type their own email and, unless the account is Google-only, their password. `DELETE /api/auth/account` reuses `deleteUser` (MySQL CASCADE for every user-owned table, plus email-targeted queue jobs, R2 sweep including legacy story keys, comment-count recount, and public-feed cache bust — same path as the superadmin delete), then clears auth cookies. The superadmin account cannot delete itself. There is no recycle bin and no grace period — conversations disappear for the other participant too, because a thread cannot exist with one side missing.

---

## Client session (`useAuth`)

| Stored where           | Key / surface         | Contents                                    |
| ---------------------- | --------------------- | ------------------------------------------- |
| HttpOnly cookie        | `mgmt_rt`             | Refresh secret (never in `localStorage`)    |
| HttpOnly cookie        | `mgmt_at`             | Short-lived JWT for media + same-origin API |
| In-memory + `useState` | `useAuth.accessToken` | Bearer token for `apiFetch`                 |
| `localStorage`         | `auth:user`           | Cached `AuthUser` profile (non-secret)      |
| `localStorage`         | `auth:hasSession`     | `1` when a cookie session is expected       |

`plugins/auth.client.ts` on boot: POST `/api/auth/refresh` with `credentials: 'include'` and applies `user` from that reply (no follow-up `GET /api/auth/me`). On `/` and `/feed` the restore is non-blocking so SSR first paint is not held; protected SPA routes still await refresh before mount. Legacy installs that still have `auth:refreshToken` in `localStorage` send it once in the refresh body, then wipe it.

`useApi.apiFetch` always sends `credentials: 'include'` and attaches `Authorization: Bearer …` when the in-memory access token is set. Identical in-flight calls (same method + URL + query) share one promise; the first request is not delayed.

**Brute-force protection:** `POST /api/auth/login`, `signup`, and `forgot-password` have stricter per-IP rate limits **and** a per-email budget (see [`api.md`](./api.md#rate-limiting)). The IP is taken from `CF-Connecting-IP` / nginx `X-Real-IP`, not the client-controlled first `X-Forwarded-For` hop.

---

## Token lifecycle

- **Access token** — 15-minute HS256 JWT, signed with `JWT_SECRET`. Returned in JSON for in-memory Bearer use and mirrored as HttpOnly `mgmt_at` so same-origin media requests authenticate without putting the JWT in the query string.
- **Refresh token** — 30-day opaque base64url, stored as SHA-256 hash only, delivered exclusively via HttpOnly `mgmt_rt` (legacy body/`localStorage` still accepted once for migration). On `/api/auth/refresh` the presented token is revoked and a successor inserted **in one transaction** so concurrent refreshes cannot both win. On `/api/auth/logout` the presented refresh token is revoked and cookies cleared; with `everywhere: true`, every active refresh token for the caller is revoked.
- **Email verification** — a one-shot opaque token (also hashed). At sign-up the handler inserts the user + verification row in one transaction, then **enqueues** an `email.verification` job; the Nitro job worker sends it via SMTP (with retries). Login is refused with `403` until the user POSTs the token to `/api/auth/verify-email`. See [`cache-queue.md`](./cache-queue.md).
- **Password reset** — same one-shot opaque-token pattern as verification, stored in `auth_password_resets` (1-hour TTL). `POST /api/auth/forgot-password` always returns `{ ok: true }` (no account enumeration); email is sent only when the account exists and is verified. `POST /api/auth/reset-password` consumes the token, updates `password_hash`, and revokes all refresh sessions — the user signs in manually afterward. Client pages: `/forgot-password`, `/reset-password?token=…`.
- **Signup password policy** — shared `utils/passwordPolicy.ts`: min 8 chars + lower + upper + digit + special. Enforced on the client (confirm field + checklist) and again on `POST /api/auth/signup` and `POST /api/auth/reset-password`.

The client (`composables/shared/useApi.ts`) auto-attaches the access token on every request (and always sends credentials), proactively refreshes it within 30 s of expiry via the cookie, and on a 401 attempts one refresh-and-retry before bouncing to `/login?redirect=…`. A single in-flight `_refreshInFlight` promise coalesces concurrent refresh attempts so a burst of expired-token requests only causes one refresh round-trip.

---

## Bootstrap superadmin

`npm run migrate:auth` seeds the very first install-owner from `ADMIN_INITIAL_EMAIL` / `ADMIN_INITIAL_PASSWORD` with `role: superadmin` and marks them `email_verified`. It's idempotent: re-running on an existing seed account is a no-op, and re-running on an install that was seeded by an older version (when the account got `role: admin`) silently promotes them to `superadmin`. Subsequent sign-ups default to `role: normal`; any `admin` or `superadmin` can promote others to `admin` (or demote back to `normal`) via `POST /api/admin/users/:id/role`. The endpoint refuses to:

- demote the last remaining admin-or-superadmin (lock-out guard),
- accept `superadmin` as the target role (no privilege escalation through the API),
- modify any user whose current role is `superadmin` (owner is tamper-proof).

The script is the only entrypoint that creates a `superadmin` — there's no "first signup automatically becomes admin" magic, so a fresh install is always explicit about who owns it.

---

## Email transport

`server/utils/mailer.ts` uses `nodemailer`. When `SMTP_HOST/USER/PASS` are present it sends real email; when any is missing it falls back to logging the email to stdout. Verification / reset **plaintext** intentionally omits the raw URL (button-only HTML); the dry-run logger still prints a `Link:` line extracted from the HTML so local sign-up stays walkable. For Gmail / Google Workspace you need an [App Password](https://myaccount.google.com/apppasswords), not your account password. Production typically sets `SMTP_FROM` to a display name + address (e.g. `Danang TechX <admin@dntechx.com>`) while `SMTP_USER` remains the mailbox used to authenticate.

Outbound mail from product flows should go through the **job queue** (`enqueueVerificationEmail` / `enqueuePasswordResetEmail` / `enqueueEmailSend`) so HTTP handlers stay fast and SMTP failures retry with backoff. Direct `sendMail` remains available for scripts and the worker itself. Password reset uses job type `email.passwordReset`.

The verification URL prefers **`APP_BASE_URL`** when set (reverse proxy / Cloudflare Tunnel). Otherwise it is built from `APP_HOST` / `APP_PORT` (and optional `APP_PROTOCOL`, defaulting to `http`). The port is omitted when it matches the protocol default (80 for http, 443 for https) so the rendered link stays canonical.

---

## Profile editing

Authenticated users update display fields via `PATCH /api/auth/profile` (`useAuth.updateProfile` on the client; UI on `/profile`). Editable fields:

| Field                        | Storage                               | Notes                                                                                                                         |
| ---------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `name`                       | `users.name`                          | Required display name (1–120 chars on signup/profile). Legacy empty rows backfilled from email local-part (migration `0029`). |
| `avatarUrl`                  | derived from `users.avatar_upload_id` | Upload bytes first with `POST /api/uploads`, then pass the upload id. Must be an image owned by the caller.                   |
| `title` / `job` / `location` | `VARCHAR(120)` each                   | Free-form; empty/`null` clears.                                                                                               |

Role, email, and email-verification state are **not** editable here. JWT claims stay `{ sub, email, role }` — profile fields come from the refresh/login/`PATCH /api/auth/profile` reply (or an explicit `GET /api/auth/me` on the profile page) and are cached in `useAuth`. Feed/story author payloads (`PostAuthor`) include the same optional fields so avatars and titles show on public surfaces.
