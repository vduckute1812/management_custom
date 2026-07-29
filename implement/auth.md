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

| Paths                                                                       | Rule                                                                                      |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `/`, `/feed` (+ nested)                                                     | Public                                                                                    |
| `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password` | Public; if already authenticated → `/` (or `?redirect=`) for login/signup/forgot-password |
| `/tasks`, `/epics`, `/analytics`, `/settings`, `/profile`, …                | Require session → else `/login?redirect=…`                                                |
| `/admin`                                                                    | Require admin role → else `/` + toast                                                     |

See `middleware/auth.global.ts`.

The `users.role` column is `TINYINT UNSIGNED` and the same integer flows unchanged through the row mapper, the API response, and the JWT claim. There are no `numberToRole` / `roleToNumber` translation helpers — the TypeScript type IS the integer. See `~/types/task.ts` for the canonical `UserRole` definition and [`database.md`](./database.md) for the rationale behind integer enums end-to-end.

---

## HttpOnly cookies

| Cookie    | Purpose                                     | Max-Age | JS readable |
| --------- | ------------------------------------------- | ------- | ----------- |
| `mgmt_rt` | Refresh token (opaque, SHA-256 hash in DB)  | 30 days | No          |
| `mgmt_at` | Access JWT (mirrors in-memory Bearer token) | 15 min  | No          |

Both are `HttpOnly`, `SameSite=Lax`, `Path=/`. `Secure` defaults to on in production / when `APP_BASE_URL` is `https://`; override with `COOKIE_SECURE=false` for plain `http://localhost` dev.

Login and refresh set both cookies. Logout revokes the refresh hash server-side and clears cookies.

Cookie-authenticated auth mutations (`refresh`, `logout`) apply a soft same-origin check (`Origin` / `Referer` must match `Host` when a cookie is used) to reduce CSRF risk.

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

**Brute-force protection:** `POST /api/auth/login`, `signup`, and `refresh` have stricter per-IP rate limits (see [`api.md`](./api.md#rate-limiting)).

---

## Token lifecycle

- **Access token** — 15-minute HS256 JWT, signed with `JWT_SECRET`. Returned in JSON for in-memory Bearer use and mirrored as HttpOnly `mgmt_at` so same-origin media requests authenticate without putting the JWT in the query string.
- **Refresh token** — 30-day opaque base64url, stored as SHA-256 hash only, delivered exclusively via HttpOnly `mgmt_rt` (legacy body/`localStorage` still accepted once for migration). On `/api/auth/refresh` the presented token is revoked and a successor inserted **in one transaction** so concurrent refreshes cannot both win. On `/api/auth/logout` the presented refresh token is revoked and cookies cleared; with `everywhere: true`, every active refresh token for the caller is revoked.
- **Email verification** — a one-shot opaque token (also hashed). At sign-up the handler inserts the user + verification row in one transaction, then **enqueues** an `email.verification` job; the Nitro job worker sends it via SMTP (with retries). Login is refused with `403` until the user POSTs the token to `/api/auth/verify-email`. See [`cache-queue.md`](./cache-queue.md).
- **Password reset** — same one-shot opaque-token pattern as verification, stored in `auth_password_resets` (1-hour TTL). `POST /api/auth/forgot-password` always returns `{ ok: true }` (no account enumeration); email is sent only when the account exists and is verified. `POST /api/auth/reset-password` consumes the token, updates `password_hash`, and revokes all refresh sessions — the user signs in manually afterward. Client pages: `/forgot-password`, `/reset-password?token=…`.
- **Signup password policy** — shared `utils/passwordPolicy.ts`: min 8 chars + lower + upper + digit + special. Enforced on the client (confirm field + checklist) and again on `POST /api/auth/signup` and `POST /api/auth/reset-password`.

The client (`composables/useApi.ts`) auto-attaches the access token on every request (and always sends credentials), proactively refreshes it within 30 s of expiry via the cookie, and on a 401 attempts one refresh-and-retry before bouncing to `/login?redirect=…`. A single in-flight `_refreshInFlight` promise coalesces concurrent refresh attempts so a burst of expired-token requests only causes one refresh round-trip.

---

## Bootstrap superadmin

`npm run migrate:auth` seeds the very first install-owner from `ADMIN_INITIAL_EMAIL` / `ADMIN_INITIAL_PASSWORD` with `role: superadmin` and marks them `email_verified`. It's idempotent: re-running on an existing seed account is a no-op, and re-running on an install that was seeded by an older version (when the account got `role: admin`) silently promotes them to `superadmin`. Subsequent sign-ups default to `role: normal`; any `admin` or `superadmin` can promote others to `admin` (or demote back to `normal`) via `POST /api/admin/users/:id/role`. The endpoint refuses to:

- demote the last remaining admin-or-superadmin (lock-out guard),
- accept `superadmin` as the target role (no privilege escalation through the API),
- modify any user whose current role is `superadmin` (owner is tamper-proof).

The script is the only entrypoint that creates a `superadmin` — there's no "first signup automatically becomes admin" magic, so a fresh install is always explicit about who owns it.

---

## Email transport

`server/utils/mailer.ts` uses `nodemailer`. When `SMTP_HOST/USER/PASS` are present it sends real email; when any is missing it falls back to logging the email body (including the verification URL) to stdout, so the sign-up flow remains exercisable in dev without provisioning a real provider. For Gmail / Google Workspace you need an [App Password](https://myaccount.google.com/apppasswords), not your account password. Production typically sets `SMTP_FROM` to a display name + address (e.g. `Danang TechX <admin@dntechx.com>`) while `SMTP_USER` remains the mailbox used to authenticate.

Outbound mail from product flows should go through the **job queue** (`enqueueVerificationEmail` / `enqueueEmailSend`) so HTTP handlers stay fast and SMTP failures retry with backoff. Direct `sendMail` remains available for scripts and the worker itself.

The verification URL prefers **`APP_BASE_URL`** when set (reverse proxy / Cloudflare Tunnel). Otherwise it is built from `APP_HOST` / `APP_PORT` (and optional `APP_PROTOCOL`, defaulting to `http`). The port is omitted when it matches the protocol default (80 for http, 443 for https) so the rendered link stays canonical.

---

## Profile editing

Authenticated users update display fields via `PATCH /api/auth/profile` (`useAuth.updateProfile` on the client; UI on `/profile`). Editable fields:

| Field                        | Storage                               | Notes                                                                                                       |
| ---------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `name`                       | `users.name`                          | Optional display name; app max 120 chars (column is `VARCHAR(255)`).                                        |
| `avatarUrl`                  | derived from `users.avatar_upload_id` | Upload bytes first with `POST /api/uploads`, then pass the upload id. Must be an image owned by the caller. |
| `title` / `job` / `location` | `VARCHAR(120)` each                   | Free-form; empty/`null` clears.                                                                             |

Role, email, and email-verification state are **not** editable here. JWT claims stay `{ sub, email, role }` — profile fields come from the refresh/login/`PATCH /api/auth/profile` reply (or an explicit `GET /api/auth/me` on the profile page) and are cached in `useAuth`. Feed/story author payloads (`PostAuthor`) include the same optional fields so avatars and titles show on public surfaces.
