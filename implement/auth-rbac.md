# Feature Implementation: Authentication, Security, & Role-Based Access Control (RBAC)

> **Status: implemented.** This file is the original “as-asked” feature brief.
> The **as-built** reference is [`auth.md`](./auth.md) (cookies, JWT/refresh,
> roles, profile, email). Do not treat the checklist below as open work.

## 1. Authentication System

Implement a complete authentication workflow containing the following functions:

- **Sign Up (Registration):** Email registration with verification mail (SMTP / dry-run). Google OAuth is also supported.
  - **Phase 1:** Email (SMTP) + Google OAuth — **done**.
  - **Non-goal:** SMS registration (not planned).
- **Login:** Secure user authentication generating a secure Token (e.g., JWT).
- **Logout:** Session termination via HttpOnly cookie clear + refresh-token revoke (family / hash), not a Redis JWT blacklist.

## 2. Token Security & Validation Rules (Crucial)

Every incoming request to protected routes must undergo strict token security verification:

- **Signature Verification:** Ensure the token was signed with the server's private secret key and has not been tampered with.
- **Expiration Check:** Verify the token's expiration timestamp (`exp`). Reject expired tokens immediately with a `401 Unauthorized` status.
- **Payload Integrity:** Ensure the payload claims (such as `user_id` and `role`) match valid records and cannot be altered by the client.
- **Token Invalidation (Logout):** Short-lived access JWTs (15m) + opaque refresh tokens stored as SHA-256 hashes; logout revokes the refresh row / family. No Redis access-token blacklist.

## 3. Hierarchical User Role System (RBAC)

Create a strict hierarchical role system enforced via security middleware:

- **Roles are integers end-to-end** (`UserRole`: Normal / Admin / Superadmin) — not string tokens. See [`database.md`](./database.md) (“Integer enums”).
- **Admin / Superadmin:** Elevated access (admin APIs, user role changes with hierarchy rules).
- **Normal User:** Standard client access; data scoped to `sub` from the validated token.

## 4. Data Visualization & Access Control Rules

Enforce the following data isolation and visualization rules:

- **Admin Dashboard:**
  - Ability to view comprehensive data for all individual users in the system.
  - Data must be represented visually using interactive charts (e.g., bar charts, line graphs showing user metrics/activity).
- **Normal User Dashboard:**
  - Strict data isolation.
  - Users must **only** be able to view and access their own personalized data and charts based on the `user_id` extracted securely from the validated token.

---

## Technical Tasks Checklist

All items below shipped; details live in [`auth.md`](./auth.md) and [`api.md`](./api.md).

- [x] Setup User Model with integer `role` field (`UserRole`).
- [x] Implement Sign-Up API/Logic with Email verification (+ Google OAuth).
- [x] Implement Secure Login API issuing signed access JWTs + opaque refresh.
- [x] **Implement Security Token Validation Middleware (Signature, Expiration, Integrity).**
- [x] Implement Logout API (refresh revoke / family revoke; cookie wipe).
- [x] Create Middleware/Decorators for Role-Based Access Control (RBAC).
- [x] Build Admin Chart Dashboard API (aggregating user data, restricted to admin).
- [x] Build User Dashboard API (scoped strictly to the validated token's `user_id`).
