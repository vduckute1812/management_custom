# Implementation Roadmap

Engineering progress, phase by phase. Each item is one shippable subtask.

---

## Phase 1 — Environment Setup
- [x] Initialize Nuxt 3 project
- [x] Configure TailwindCSS
- [x] Set up project directory structure
- [x] Provision a local MySQL `rc` database with the schema owned by versioned SQL migrations in `server/db/migrations/`

## Phase 2 — Local Storage API
- [x] Build the server DB layer (`server/utils/db.ts` barrel + per-entity modules under `server/db/`) with the `mysql2` pool, SQL-file migration runner (`migrator.ts` + `schema_migrations` table + `GET_LOCK` advisory locking), granular CRUD, and aggregator helpers (`computeEpicHours`, `computeTaskSpent`)
- [x] Implement Epic CRUD: `GET /api/epics`, `POST /api/epics`, `DELETE /api/epics/:id`
- [x] Implement Task CRUD: `GET /api/tasks`, `POST /api/tasks`, `DELETE /api/tasks/:id`
- [x] Ensure `DELETE /api/epics/:id` clears `epicId` on orphaned tasks (FK `ON DELETE SET NULL`)

## Phase 3 — Epic & Task UI
- [x] Build `EpicModal.vue` (create/edit Epic)
- [x] Build `EpicCard.vue` showing derived `estimatedHours` and `spentHours`
- [x] Build Epic detail page (`/epics/[id].vue`) listing child tasks
- [x] Build `TaskModal.vue` with `epicId` selector, `estimatedHours`, progress slider
- [x] Build `TimeBlockEditor.vue` — add, remove, and edit time blocks with date + time range pickers

## Phase 4 — Calendar Views
- [x] Build main dashboard layout with Daily / Weekly / Monthly toggle
- [x] `CalendarDaily.vue` — render each task's blocks that fall on the selected day
- [x] `CalendarWeekly.vue` — render blocks in their respective day columns across the week
- [x] `CalendarMonthly.vue` — deadline markers and block density dots per day

## Phase 5 — Analytics Engine
- [x] Create `useEpics.ts` and `useTasks.ts` composables for reactive derived state
- [x] Aggregate velocity (estimated vs. spent) by day / week / month at both task and Epic level
- [x] Render velocity charts with Chart.js
- [x] Display completion rate and roll-over counters per period

## Phase 6 — UX Polish
- [x] Epic color identity: schema + picker + propagation to all calendar blocks
- [x] Quick-capture bar (`n`): single-line title; sensible defaults
- [x] Command palette (`Mod+K`): jump to any Epic, task, or view
- [x] Skeleton loaders to replace "Loading…" text
- [x] Empty state illustrations + "Load sample data" CTA
- [x] Undo toast for task deletion (replace the confirm dialog)
- [x] Inline status dropdown on each list/row
- [x] Auto-save indicator with checkmark micro-interaction
- [x] Accessibility: skip link, focus rings, ARIA live region for toasts, mobile bottom nav, reduced-motion stylesheet
- [x] Two-key navigation sequences (`g d` / `g e` / `g a`) and page shortcuts (`1`/`2`/`3`, `t`, arrows)
- [x] Drag-to-reschedule + resize on time blocks (Daily: pointer events, 15-min snap, top/bottom resize handles; Weekly: native HTML5 DnD across day columns)

## Phase 7 — Power-user
- [x] Task priority (`high` / `normal` / `low`) — visible in Up next sort
- [x] Full-text search across titles, notes, tags, and epic descriptions (command palette)
- [x] Settings page (week start, time format) — persisted to `localStorage`
- [x] JSON / CSV export (snapshot, tasks per time-block, epic roll-ups)
- [x] iCal (`.ics`) export — VEVENT per time block, VTODO per due-dated task
- [x] Print stylesheet for weekly agenda (strips sidebar, mobile nav, filled backgrounds)
- [x] In-app timer: persistent across reloads, single active timer, automatic finalize when switching tasks, < 30 s sessions discarded
- [x] Checklist sub-items — per-task sub-steps with derived `checklistProgress`
- [x] Dark mode (system / light / dark) with pre-hydration flash guard
- [x] Recurring tasks (`recurrence` field) — daily / weekly / monthly with optional `until`; future occurrences render as dashed "ghost" blocks in all three calendar views and never persist, so logged hours stay honest
- [x] Compact density toggle — mirrored onto `<html data-density="compact">` so a single override layer in `main.css` rescales padding/gap by ~25% without touching font size; the daily calendar also shrinks its hour row from 56 → 44 px
- [x] Local notifications before scheduled blocks (opt-in) — uses the browser `Notification` API, schedules within a rolling 24 h horizon, dedupes per tab, and reschedules whenever tasks or settings change

## Phase 8 — Authentication, Security, & RBAC

The big "single-user app becomes a small multi-user app" pass. Every API now requires a token, every row knows who owns it, and admins get a system-wide view that normal users do not. Original spec: [`auth-rbac.md`](./auth-rbac.md). Implementation reference: [`auth.md`](./auth.md).

**Schema & setup**
- [x] New tables: `users`, `auth_refresh_tokens`, `auth_email_verifications`
- [x] `user_id VARCHAR(64)` columns on `epics` and `tasks` (with `idx_*_user` indexes); time blocks + checklist items inherit ownership through the task FK
- [x] `active_timer` keyed by `user_id` so concurrent users can each run one timer
- [x] `users.role` stored as `TINYINT UNSIGNED` (0 = normal, 1 = admin) — easy to compare with `>=` and extend with new ranks; the TS surface keeps the `"admin" | "normal"` union and translates at the DB boundary
- [x] Schema is owned by versioned SQL migrations (`server/db/migrations/NNNN_name.sql`) tracked in a `schema_migrations` table by SHA-256 checksum. The boot plugin (`server/plugins/db-verify.ts`) refuses to start if any migration is pending or has drifted — the runtime never mutates schema implicitly
- [x] `npm run migrate:auth` — idempotent admin seed (`ADMIN_INITIAL_EMAIL` / `ADMIN_INITIAL_PASSWORD`)
- [x] `npm run check:db` verifies all 8 tables are present and reports the current user count

**Token model**
- [x] Short-lived JWT access tokens (HS256, 15 min, signed with `JWT_SECRET`, carry `{ sub, email, role }`)
- [x] Opaque refresh tokens (30 days, base64url, SHA-256-hashed at rest) with rotation on every refresh
- [x] Logout revokes the supplied refresh token; `everywhere: true` revokes every active refresh token for the caller
- [x] `JWT_SECRET` length guard (≥16 chars) at process startup

**Server auth**
- [x] `server/utils/auth.ts` — bcryptjs password hashing, JWT sign/verify, opaque-token helpers
- [x] `server/utils/mailer.ts` — nodemailer wrapper with a "print to console" fallback when SMTP env is incomplete
- [x] `server/utils/authContext.ts` — `requireUser(event)` / `requireAdmin(event)` translators
- [x] `server/middleware/auth.ts` — hydrates `event.context.user` from `Authorization: Bearer` on every request without ever blocking
- [x] `POST /api/auth/signup` (creates `normal` user + queues verification email; returns `verificationSent`)
- [x] `POST /api/auth/login` (rejects unverified accounts with 403; issues access + refresh pair)
- [x] `POST /api/auth/refresh` (rotates: presented refresh revoked, new pair issued)
- [x] `POST /api/auth/logout` (revokes presented refresh token; supports `everywhere: true`)
- [x] `POST /api/auth/verify-email` (one-shot consumption of the verification token hash)
- [x] `GET /api/auth/me` (re-validates role against the DB, never returns `passwordHash`)

**Per-user data scoping** — every existing read/write is now bound to the authenticated user
- [x] All epic helpers: `getAllEpics(userId)`, `getEpicById(userId, id)`, `upsertEpic(userId, epic)`, `deleteEpic(userId, id)`
- [x] All task helpers: `getAllTasks(userId)`, `getTaskById(userId, id)`, `upsertTask(userId, task)`, `deleteTask(userId, id)`
- [x] All timer helpers: `getActiveTimer(userId)`, `setActiveTimer(userId, timer)`, `appendBlock(userId, taskId, block, updatedAt)` (with an inline ownership re-check)
- [x] `POST /api/tasks` rejects with 404 when `body.id` belongs to another user (instead of silently no-op'ing); same guard for `POST /api/epics`
- [x] Defense-in-depth in `upsertTask` / `upsertEpic`: a precondition `SELECT user_id` aborts the transaction before the children-replace DELETE runs, so even a misrouted call can't wipe another user's `time_blocks` / `checklist_items`
- [x] `POST /api/timer/start` rejects starting a timer on someone else's `taskId` with 404; `/start` only finalizes the *caller's* prior timer

**Admin role**
- [x] `GET /api/admin/users` — per-user summary (`taskCount`, `epicCount`, `hoursLogged`, `lastActivity`); never includes password hashes
- [x] `GET /api/admin/stats?days=N` — system-wide totals + per-day hours series + status mix for dashboard charts
- [x] `POST /api/admin/users/:id/role` — promote/demote, with a guard against demoting the last admin
- [x] `requireAdmin` returns 403 (not 404) so the UI can distinguish "missing token" from "wrong role"

**Client**
- [x] `composables/useAuth.ts` — login / signup / verify / refresh / logout + localStorage persistence of `{ user, accessToken, accessExpiresAt, refreshToken }`
- [x] `composables/useApi.ts` — auto-attaches `Authorization: Bearer …`, proactively refreshes within 30 s of expiry, and on a 401 makes one refresh-and-retry attempt before bouncing to `/login?redirect=…`
- [x] A single in-flight `_refreshInFlight` promise coalesces concurrent refresh attempts so a burst of expired-token requests only causes one refresh round-trip
- [x] `useTasks`, `useEpics`, `useTimer` migrated off `$fetch` onto `apiFetch` (so every existing surface now talks to the auth-aware API)
- [x] `plugins/auth.client.ts` — hydrates session on boot, refreshes the access token if it's near expiry, and falls back to a clean `clearSession()` on any failure
- [x] `middleware/auth.global.ts` — `/login`, `/signup`, `/verify-email` are public; everything else requires auth; `/admin` requires `role: admin`

**Pages & UI**
- [x] `/login`, `/signup`, `/verify-email` — minimal forms with explicit error surfacing and a "verification sent" success state
- [x] `/admin` — admin dashboard with Chart.js: hours-per-day line, task-status doughnut, per-user bar (hours + tasks), plus a sortable user table with inline promote/demote buttons and an `Active range` selector (7 / 14 / 30 / 90 days)
- [x] Layout sidebar: user chip showing name/email + role + sign-out button; "Admin" nav item appears only when `auth.isAdmin`
- [x] Mobile bottom nav switched to `grid-flow-col auto-cols-fr` so the extra Admin tab doesn't squeeze the others

**Docs & env**
- [x] `.env.example` extended with `JWT_SECRET`, `ADMIN_INITIAL_*`, SMTP block, and `APP_HOST` / `APP_PORT`
- [x] Technical documentation refactored — README keeps the product / UX story; everything code-shaped lives under `implement/` (this folder)
- [x] Feature spec moved from `IMPLEMENT.md` to `implement/auth-rbac.md` (one feature per file under `implement/`)

**Verified end-to-end**
- [x] Unauthenticated requests get 401; admin-only routes get 403 for normal users
- [x] Email verification round-trip works in console-fallback mode
- [x] Two concurrent users can run timers without interference; cross-user `taskId` is rejected
- [x] Cross-user `POST /api/tasks {id: …}` and `DELETE /api/tasks/:id` both 404 and leave the target row untouched (verified directly against MySQL)
- [x] Refresh-token rotation: the old refresh token is rejected with 401 once a new pair has been issued; logout also kills the new one
- [x] `npm run check:db` reports all 8 tables present and the live user count

**Deferred (per spec)**
- [ ] **Phase 2: SMS sign-up.** `implement/auth-rbac.md` explicitly marks SMS as a later phase. Hook-in point would be a new `auth/signup-sms.post.ts` + a `phone_numbers` table linked to `users`; the rest of the token / role machinery is provider-agnostic.
- [ ] Password reset / change. Not in the spec; would slot in alongside `verify-email` with the same one-shot opaque-token pattern.
- [ ] OAuth ("Sign in with Google"). The spec text was ambiguous between SMTP-verified email/password and OAuth; we shipped the former. Adding the latter is additive (a new route that creates/links a user and issues the same JWT/refresh pair).

## Phase 9 — Superadmin role + integer enums end-to-end

A pass that hardens RBAC by introducing a dedicated install-owner role, and that simplifies the type system by collapsing all enum-shaped fields from "string in TS, integer in DB" to **integers everywhere**.

**Superadmin role**
- [x] `UserRole` extended with a third rank, `Superadmin = 2`, that ranks strictly above `Admin` (1)
- [x] `npm run migrate:auth` seeds the bootstrap user as `superadmin` (not `admin`) and auto-promotes a pre-existing seed account from earlier versions
- [x] `POST /api/admin/users/:id/role` refuses to assign `superadmin`, refuses to modify any user whose current role is `superadmin`, and still refuses to demote the last admin-or-superadmin
- [x] `requireSuperAdmin(event)` route guard added alongside the existing `requireUser` / `requireAdmin` for any future owner-only operations
- [x] Admin dashboard hides the promote/demote buttons on the superadmin row; the layout chip and role label everywhere render `Superadmin` from `ROLE_LABELS`

**Integer enums end-to-end** (replaces the previous "TS string union ↔ DB integer" boundary)
- [x] `UserRole`, `TaskStatus`, `TaskPriority`, `RecurrenceRule` rewritten in `~/types/task.ts` as `const` objects with numeric values + derived union types (e.g. `TaskStatus = { Todo: 0, InProgress: 1, Done: 2 } as const`)
- [x] Removed every `numberToRole` / `roleToNumber` / `numberToStatus` / `statusToNumber` / `priority` / `recurrence` translator from `server/db`; row mappers coerce `unknown` straight to the integer enum with bounded fallbacks
- [x] Every API endpoint validates incoming enum fields against the numeric constant arrays (`TASK_STATUSES`, `TASK_PRIORITIES`, `RECURRENCE_RULES`, `ASSIGNABLE_USER_ROLES`); string values are rejected
- [x] JWT `role` claim is now the integer; `verifyAccessToken` checks `typeof role === "number"` and membership in `USER_ROLES`
- [x] `useAuth.hydrateFromStorage` detects and clears `AuthUser` records persisted with the old string `role`, forcing one refresh-and-rehydrate; users never see a manual re-login
- [x] All client surfaces (`TaskModal`, `EpicModal`, `QuickCapture`, `StatusPill`, `EpicCard`, `AnalyticsDashboard`, admin dashboard, `pages/epics/[id].vue`) bind selects with `v-model.number` and key `STATUS_*` / `PRIORITY_*` lookup maps by the integer constants
- [x] CSV export still emits human-readable status / priority via `STATUS_LABELS` / `PRIORITY_LABELS`; iCal still emits RFC-5545 protocol strings; JSON export uses the raw integers (which is the canonical wire shape)
- [x] `implement/database.md`, `implement/auth.md`, and `implement/api.md` rewritten to describe the integer-everywhere model

## Phase 10 — Live "now" indicator + pre-task alerts

The calendar grew a real sense of time, and the planner picked up a heads-up before each block starts.

**Live "now" indicator**
- [x] New `composables/useNow.ts` — a shared reactive Dayjs that ticks every 30 s and force-refreshes on `visibilitychange`, so a backgrounded tab catches up instantly when refocused without burning a render per second
- [x] `CalendarDaily.vue` — renders a horizontal rose-tinted "now" line across the hour grid when the displayed day is today, with a `HH:mm` badge in the time gutter (z-index above blocks but `pointer-events: none`)
- [x] `CalendarWeekly.vue` — today's column header gains a `Now HH:mm` pill that lives next to the weekday label

**Pre-task alerts (5-min default lead, configurable)**
- [x] `composables/useNotifications.ts` rebuilt around a dual-channel model: in-app toast always fires when alerts are enabled; desktop pop-up fires *additionally* when browser Notification permission has been granted
- [x] **Late-join logic** — if the lead window has already passed but the block hasn't started, the alert fires immediately on the next scheduler pass rather than being silently skipped
- [x] Dedupe key `${taskId}:${blockId}` shared across both channels so a block never alerts twice, even with the page open across multiple tabs or after a settings change
- [x] Toast carries an **Open** action that sets `useUiOverlays().focusTaskId` and routes to `/`; the dashboard watches `focusTaskId` and pops the matching `TaskModal` so the alert lands the user on the right thing in one tap from any page
- [x] `CommandPalette.vue` task entries reuse the same `focusTaskId` mechanism so "jump to task" also opens the modal directly
- [x] `composables/useSettings.ts` — default `notificationsEnabled` is now `true` for fresh installs; explicit `false` in persisted settings still wins so existing users who opted out stay opted out
- [x] `pages/settings.vue` — copy + UI rewritten to reflect the dual-channel model; "Enable desktop pop-ups" is a separate button shown only after the master toggle is on; "Send test notification" prefers the desktop channel and falls back to the in-app toast
- [x] `implement/architecture.md` extended with a "Pre-task alerts & live 'now' indicator" section
