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

| Paths                                                        | Rule                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| `/`, `/feed` (+ nested)                                      | Public                                                   |
| `/login`, `/signup`, `/verify-email`                         | Public; if already authenticated → `/` (or `?redirect=`) |
| `/tasks`, `/epics`, `/analytics`, `/settings`, `/profile`, … | Require session → else `/login?redirect=…`               |
| `/admin`                                                     | Require admin role → else `/` + toast                    |

See `middleware/auth.global.ts`.

The `users.role` column is `TINYINT UNSIGNED` and the same integer flows unchanged through the row mapper, the API response, and the JWT claim. There are no `numberToRole` / `roleToNumber` translation helpers — the TypeScript type IS the integer. See `~/types/task.ts` for the canonical `UserRole` definition and [`database.md`](./database.md) for the rationale behind integer enums end-to-end.

---

## Token lifecycle

- **Access token** — 15-minute HS256 JWT, signed with `JWT_SECRET`. Stateless: rejection is "signature bad / wrong issuer / expired".
- **Refresh token** — 30-day opaque base64url, stored as SHA-256 hash only. On `/api/auth/refresh` the presented token is _revoked_ and a new pair is issued (rotation). On `/api/auth/logout` the presented refresh token is revoked outright; with `everywhere: true`, every active refresh token for the caller is revoked.
- **Email verification** — a one-shot opaque token (also hashed). At sign-up the handler **enqueues** an `email.verification` job; the Nitro job worker sends it via SMTP (with retries). Login is refused with `403` until the user POSTs the token to `/api/auth/verify-email`. See [`cache-queue.md`](./cache-queue.md).
- **Signup password policy** — shared `utils/passwordPolicy.ts`: min 8 chars + lower + upper + digit + special. Enforced on the client (confirm field + checklist) and again on `POST /api/auth/signup`.

The client (`composables/useApi.ts`) auto-attaches the access token on every request, proactively refreshes it within 30 s of expiry, and on a 401 attempts one refresh-and-retry before bouncing to `/login?redirect=…`. A single in-flight `_refreshInFlight` promise coalesces concurrent refresh attempts so a burst of expired-token requests only causes one refresh round-trip.

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
