# Authentication & RBAC — Implementation

The original feature spec lives in [`auth-rbac.md`](./auth-rbac.md). This document is the as-built reference: how roles, tokens, and the email-verification dance are actually wired together. See [`api.md`](./api.md) for the route table and [`database.md`](./database.md) for the underlying tables.

---

## Roles

| Role         | Sees                                                          | Can do                                                                  |
| ------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `normal`     | Their own epics, tasks, time blocks, timer.                   | Everything in the app for their own data. Cannot read or modify anyone else's. |
| `admin`      | Everything `normal` sees, plus a system-wide admin dashboard. | Promote/demote other users between `admin` ↔ `normal`, view per-user roll-ups & charts. |
| `superadmin` | Same as `admin`. Exactly one per install (the bootstrap account). | Everything `admin` can. The role itself is **never assignable through the API** — only seeded by `npm run migrate:auth` — and **cannot be modified or demoted** by anyone. It exists as the install's break-glass owner so admins can't lock each other (or the install) out. |

The role is enforced in three layers:

1. **Token claim** — `role` is signed into every JWT as the same integer that's persisted in MySQL and re-validated on `GET /api/auth/me`. All three values (`0` / `1` / `2`) are accepted; anything else is rejected as invalid.
2. **Route guard** — admin-only routes call `requireAdmin(event)` which accepts both `Admin` (1) and `Superadmin` (2) (`isAdminRole(role) ≡ role >= UserRole.Admin`) and returns `403` for `Normal` (0). A stricter `requireSuperAdmin(event)` exists for owner-only operations.
3. **DB scope** — every CRUD helper in `server/utils/db.ts` takes `userId` as its first argument and filters / asserts ownership in SQL. Even a route bug can't surface another user's data.

The `users.role` column is `TINYINT UNSIGNED` and the same integer flows unchanged through the row mapper, the API response, and the JWT claim. There are no `numberToRole` / `roleToNumber` translation helpers — the TypeScript type IS the integer. See `~/types/task.ts` for the canonical `UserRole` definition and [`database.md`](./database.md) for the rationale behind integer enums end-to-end.

---

## Token lifecycle

- **Access token** — 15-minute HS256 JWT, signed with `JWT_SECRET`. Stateless: rejection is "signature bad / wrong issuer / expired".
- **Refresh token** — 30-day opaque base64url, stored as SHA-256 hash only. On `/api/auth/refresh` the presented token is *revoked* and a new pair is issued (rotation). On `/api/auth/logout` the presented refresh token is revoked outright; with `everywhere: true`, every active refresh token for the caller is revoked.
- **Email verification** — a one-shot opaque token (also hashed) emailed via SMTP at sign-up. Login is refused with `403` until the user POSTs the token to `/api/auth/verify-email`.

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

`server/utils/mailer.ts` uses `nodemailer`. When `SMTP_HOST/USER/PASS` are present it sends real email; when any is missing it falls back to logging the email body (including the verification URL) to stdout, so the sign-up flow remains exercisable in dev without provisioning a real provider. For Gmail you need an [App Password](https://myaccount.google.com/apppasswords), not your account password.

The verification URL is built from `APP_HOST` / `APP_PORT` (and optional `APP_PROTOCOL`, defaulting to `http`). The port is omitted when it matches the protocol default (80 for http, 443 for https) so the rendered link stays canonical.
