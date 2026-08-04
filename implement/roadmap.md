# Implementation Roadmap

Engineering progress, phase by phase. Each item is one shippable subtask.

---

## Phase 1 — Environment Setup

- [x] Initialize Nuxt project (now **Nuxt 4.5** / Vue 3; Node ≥ 26.5 + npm 12)
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
- [x] `npm run check:db` verifies core tables are present and reports the current user count (later migrations add feed/stories tables; checker focuses on the original task stack + migrations status)

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
- [x] `PATCH /api/auth/profile` — account owner updates `name` / avatar / `title` / `job` / `location` (migration `0010_users_profile_fields`)
- [x] `pages/profile.vue` edit mode + `useAuth.updateProfile`; avatars via `POST /api/uploads` + `UserAvatar.vue`

**Per-user data scoping** — every existing read/write is now bound to the authenticated user

- [x] All epic helpers: `getAllEpics(userId)`, `getEpicById(userId, id)`, `upsertEpic(userId, epic)`, `deleteEpic(userId, id)`
- [x] All task helpers: `getAllTasks(userId)`, `getTaskById(userId, id)`, `upsertTask(userId, task)`, `deleteTask(userId, id)`
- [x] All timer helpers: `getActiveTimer(userId)`, `setActiveTimer(userId, timer)`, `appendBlock(userId, taskId, block, updatedAt)` (with an inline ownership re-check)
- [x] `POST /api/tasks` rejects with 404 when `body.id` belongs to another user (instead of silently no-op'ing); same guard for `POST /api/epics`
- [x] Defense-in-depth in `upsertTask` / `upsertEpic`: a precondition `SELECT user_id` aborts the transaction before the children-replace DELETE runs, so even a misrouted call can't wipe another user's `time_blocks` / `checklist_items`
- [x] `POST /api/timer/start` rejects starting a timer on someone else's `taskId` with 404; `/start` only finalizes the _caller's_ prior timer

**Admin role**

- [x] `GET /api/admin/users` — per-user summary (`taskCount`, `epicCount`, `hoursLogged`, `lastActivity`); never includes password hashes
- [x] `GET /api/admin/stats?days=N` — system-wide totals + per-day hours series + status mix for dashboard charts
- [x] `POST /api/admin/users/:id/role` — promote/demote, with a guard against demoting the last admin
- [x] `requireAdmin` returns 403 (not 404) so the UI can distinguish "missing token" from "wrong role"

**Client**

- [x] `composables/useAuth.ts` — login / signup / verify / refresh / logout; HttpOnly cookie session + `localStorage` profile cache (`auth:user`, `auth:hasSession`) — superseded localStorage refresh storage in Phase 16
- [x] `composables/useApi.ts` — auto-attaches `Authorization: Bearer …`, sends `credentials: 'include'`, proactively refreshes within 30 s of expiry, and on a 401 makes one refresh-and-retry attempt before bouncing to `/login?redirect=…`
- [x] A single in-flight `_refreshInFlight` promise coalesces concurrent refresh attempts so a burst of expired-token requests only causes one refresh round-trip
- [x] `useTasks`, `useEpics`, `useTimer` migrated off `$fetch` onto `apiFetch` (so every existing surface now talks to the auth-aware API)
- [x] `plugins/auth.client.ts` — hydrates session on boot, refreshes the access token if it's near expiry, and falls back to a clean `clearSession()` on any failure
- [x] `middleware/auth.global.ts` — `/`, `/feed`, `/login`, `/signup`, `/verify-email` are public; Time Management / settings / profile require auth; `/admin` requires `role: admin`

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
- [x] `npm run check:db` reports core tables present and the live user count

**Deferred (per spec)**

- [x] Password reset via email (`POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `auth_password_resets`, job type `email.passwordReset`). Change-password while logged in remains a follow-up.
- [x] OAuth ("Sign in with Google"): `GET /api/auth/google` + callback, `auth_identities` (`AuthProvider.Google=0`), nullable `password_hash`, Settings link/unlink. Requires `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- [ ] **Phase 2: SMS sign-up.** `implement/auth-rbac.md` explicitly marks SMS as a later phase. Hook-in point would be a new `auth/signup-sms.post.ts` + a `phone_numbers` table linked to `users`; the rest of the token / role machinery is provider-agnostic.

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

- [x] `composables/useNotifications.ts` rebuilt around a dual-channel model: in-app toast always fires when alerts are enabled; desktop pop-up fires _additionally_ when browser Notification permission has been granted
- [x] **Late-join logic** — if the lead window has already passed but the block hasn't started, the alert fires immediately on the next scheduler pass rather than being silently skipped
- [x] Dedupe key `${taskId}:${blockId}` shared across both channels so a block never alerts twice, even with the page open across multiple tabs or after a settings change
- [x] Toast carries an **Open** action that sets `useUiOverlays().focusTaskId` and routes to `/tasks`; the tasks page watches `focusTaskId` and pops the matching `TaskModal` so the alert lands the user on the right thing in one tap from any page
- [x] `CommandPalette.vue` task entries reuse the same `focusTaskId` mechanism so "jump to task" also opens the modal directly
- [x] `composables/useSettings.ts` — default `notificationsEnabled` is now `true` for fresh installs; explicit `false` in persisted settings still wins so existing users who opted out stay opted out
- [x] `pages/settings.vue` — copy + UI rewritten to reflect the dual-channel model; "Enable desktop pop-ups" is a separate button shown only after the master toggle is on; "Send test notification" prefers the desktop channel and falls back to the in-app toast
- [x] `implement/architecture.md` extended with a "Pre-task alerts & live 'now' indicator" section

## Phase 11 — Multi-language UI (i18n)

Full chrome localization with device-local preference (no URL prefixes).

- [x] `@nuxtjs/i18n` with `strategy: 'no_prefix'`; locales `en` / `vi` / `zh-CN` / `zh-TW` under `i18n/locales/`
- [x] `useSettings.locale` persisted in `mgmt:settings:v1`; `plugins/i18n-locale.client.ts` syncs i18n ↔ Day.js ↔ `html[lang]`
- [x] `LanguageSwitcher` in Settings → Language and the header account menu
- [x] Full UI string migration (pages, components, toasts, SEO titles) + `STATUS_I18N_KEYS` / `ROLE_I18N_KEYS` / `PRIORITY_I18N_KEYS`
- [x] Docs: `implement/i18n.md`, architecture/README/roadmap/product README, `.cursor/rules/nuxt3-standards.mdc`

## Phase 12 — Feed / stories / public hub _(landed alongside Time Management)_

Documented here so the roadmap matches the as-built install (migrations `0003`–`0006`, R2 uploads, public `/` + `/feed`).

- [x] Public hub (`/`) + Feed module (`/feed`) with optional-auth public post reads
- [x] Posts: visibility ACL, categories, reactions, comments, share, LaTeX/styled body
- [x] Stories: 24h tray, views, reactions, owner insights
- [x] Uploads via Cloudflare R2 (`server/utils/r2.ts`) when `R2_*` configured; shared `utils/uploadPolicy.ts` + magic-byte sniff
- [x] Core tech directories (Electronics / ME / IT / IoT) via migration `0006` + admin CRUD + post counts
- [x] Localized seeded category labels (`CATEGORY_I18N_KEYS` / `categories.*`) on hub + feed UI
- [x] Plan-in-Time-Management action on posts; optimistic reactions with per-post request tokens
- [x] Implementation docs synced: architecture / api / auth / database / i18n / getting-started

## Phase 13 — Feed polish, SEO module, vue-tsc restore

- [x] Feed UI redesign: two-column layout (`lg+` category rail), richer composer / post cards / story tray (`pages/feed/index.vue`, `PostComposer`, `PostCard`, `StoryTray`)
- [x] `@nuxtjs/seo` for `https://dntechx.com` — `/robots.txt`, `/sitemap.xml` (public `/` + `/feed` only), OG text meta; dynamic `ogImage` disabled on ARM
- [x] `/llms.txt` for AI/agent crawlers; CSP allows Cloudflare Insights beacon (+ Google Fonts for feed)
- [x] Selective SSR for `/` + `/feed` so Google indexes real HTML (app routes remain SPA)
- [x] Pin TypeScript to **5.9.x** so `vue-tsc` works (native TS 7 is incompatible with Volar)
- [x] Fix vue-i18n plural calls to `t(key, named, plural)` and MySQL `RowDataPacket` query generics that failed type-check
- [x] Docs synced: architecture (SEO + TS), i18n (plural signature), getting-started, roadmap, product README, `.cursor/rules/nuxt3-standards.mdc`
- [x] Post edit: `PATCH /api/posts/:id`, `GET /api/posts/:id`, `canEdit`, `/feed/edit/:id` (update + manuscript)

## Phase 14 — Cache & durable job queue

Pi-friendly caching and background work without making Redis mandatory.

- [x] Cache facade (`server/utils/cache.ts`): memory default + optional Redis (`REDIS_URL` / `ioredis`), fail-open
- [x] Cache categories list + anonymous public feed pages; bust on write (`cacheInvalidate.ts`)
- [x] MySQL `jobs` table (migration `0009`) with `SKIP LOCKED` claim, retries, stale reclaim, purge
- [x] Nitro in-process worker (`server/plugins/job-worker.ts`) + handlers (`email.*`, `cache.invalidate`)
- [x] Signup enqueues `email.verification` instead of awaiting SMTP inline
- [x] Admin ops snapshot `GET /api/admin/queue`
- [x] Docs: `implement/cache-queue.md`, `cache-queue-spec.md`, architecture / database / api / getting-started / README map

## Phase 16 — Structural hardening (auth cookies, validation, services, tests)

- [x] HttpOnly refresh (`mgmt_rt`) + access (`mgmt_at`) cookies; wipe refresh from localStorage; one-time legacy migration
- [x] Atomic refresh-token rotation (`rotateRefreshToken` transaction)
- [x] Signup user + email-verification inserted in one transaction
- [x] CSP / security-headers Nitro middleware
- [x] API rate limiting (`server/rate-limit/` + middleware) + client `apiFetch` in-flight coalescing
- [x] Shared Zod schemas (`server/schemas`) + `parseBody` / `parseQuery` / `DomainError`
- [x] Selective services: `taskService`, `timerService`, `postService`
- [x] Vitest suite (`npm test`) for schemas, password/token helpers, markdown sanitize
- [x] Feed→Tasks seam via `usePlanPostAsTask`; `PostCommentsPanel` extracted from `PostCard`
- [x] Docs synced: architecture / api / auth / getting-started

## Phase 17 — Direct chat (emoji + stickers)

Signed-in 1:1 messaging between install members. Spec: [`chat-spec.md`](./chat-spec.md).

- [x] Migration `0013_chat`: `chat_conversations`, `chat_messages`, `chat_conversation_reads`
- [x] DB module `server/db/chat.ts` + Zod schemas; API under `/api/chat/*`
- [x] Message kinds: text / emoji / sticker (integer enums); built-in sticker catalog
- [x] UI `/chat` — conversation list, thread, emoji + sticker pickers, ~3.5s polling
- [x] Nav + shortcuts (`g c`) + command palette; directory search returns avatars
- [x] Docs: `chat-spec.md`, api / database / architecture / roadmap / product README / i18n
- [x] Emoji picker inserts into the composer draft (does not auto-send)
- [x] Read receipts via `peerLastReadAt` / `readByPeer` on outbound messages
- [x] Unread badge on nav Chat + SSE `GET /api/chat/inbox/stream` with toast / desktop notify (REST `/api/chat/unread` kept as snapshot)
- [x] Chat media: image + voice notes (`0014_chat_media`, `uploads.kind=audio`, composer picker/recorder)

## Phase 18 — System hygiene (clean code + Cursor skill)

Audit-driven pass after Feed / Chat / rate-limit growth outpaced the agent rule.

- [x] Stop logging raw verify/reset URLs on queue enqueue failure
- [x] Auth JSON routes use shared Zod schemas via `parseBody` (signup/refresh/logout/verify/forgot/reset)
- [x] Reactions use shared `postReactionBodySchema`; remove legacy `POST /api/posts/:id/like` + `togglePostLike` / `toggleLike`
- [x] Uploads go through `apiFetch` (FormData skips coalescing); shared `apiErrorMessage` helper
- [x] Drop unused `server/utils/rateLimit` shim and deprecated post-body aliases
- [x] Expand `.cursor/rules/nuxt3-standards.mdc` (rate-limit, cache/queue, chat, manuscript, ConfirmDialog, decomposition triggers, secrets logging)
- [x] Sync `implement/architecture.md` + `implement/api.md` (chat tables, inbox plugin, no legacy like route)

## Phase 19 — Page-load performance (sprint 1)

- [x] Auth boot: drop redundant `GET /api/auth/me` after refresh; non-blocking restore on `/` + `/feed`
- [x] `getAllTasks` / `getTaskById`: load blocks + checklists in parallel
- [x] Settings: lazy-load tasks/epics for export (no blocking hydrate on enter)

## Phase 19 — Page-load performance (sprint 2)

- [x] Stories tray GET: no inline `purgeExpiredStories` (worker already sweeps ~2 min)
- [x] `/feed`: after auth restore, refetch posts once for signed-in ACL + load stories
- [x] `apiFetch`: drop 400ms delay throttle; keep in-flight coalescing only

## Phase 19 — Page-load performance (sprint 3)

- [x] Migration `0015_chat_unread_counters`: `unread_count` on reads + `last_message_id` on conversations
- [x] Send/read paths maintain counters; `listConversations` / `getUnreadTotal` / inbox use them

## Phase 19 — Page-load performance (sprint 4)

- [x] Defer Source Serif 4 (Google Fonts) on Feed / write / edit via `useManuscriptFont`
- [x] Migration `0016_posts_comment_count`: denormalized `posts.comment_count`; feed SELECT uses column

## Phase 19 — Page-load performance (sprint 5)

- [x] Conversation SSE `GET /api/chat/conversations/:id/stream` (`message` + `read`)
- [x] `useChat` uses EventSource while a thread is open; 15s REST fallback after repeated stream failures

## Phase 20 — Feed UX, chat reactions, stack upgrade

**Feed**

- [x] `GET /api/feed` bootstrap (categories + first posts page + stories when signed in)
- [x] Infinite scroll on `/feed` via IntersectionObserver + `GET /api/posts?cursor=…`
- [x] Mobile / coarse-pointer reaction picker on post cards

**Chat**

- [x] Scroll-load older message pages (`before` cursor) with preserved scroll position
- [x] Message reactions (`0017_chat_message_reactions`) using shared integer `ReactionType`
- [x] Migration `0018_reaction_int_enums` — post/story reactions → same `TINYINT` constants
- [x] Long-press-only teleported emoji reaction bar (`ChatMessageThread`)
- [x] Thread SSE emits `reaction`; module-scoped EventSource singleton across `useChat` callers
- [x] Nginx SSE locations for inbox + thread streams (avoid 504 behind Cloudflare Tunnel)

**i18n / queue / security**

- [x] First-visit locale via `GET /api/geo` (Cloudflare country) → timezone → browser fallback
- [x] Password-reset email job type `email.passwordReset` + `enqueuePasswordResetEmail`
- [x] Never log raw verify/reset URLs on enqueue failure
- [x] `Permissions-Policy` allows `microphone=(self)` for chat voice notes; camera/geo stay off

**Stack & deploy**

- [x] Nuxt **4.5.1**, Node **26.5.x**, npm **12.0.2** (`packageManager` + `.nvmrc` + engines)
- [x] Docker Alpine: global `npm@12.0.2` install (Corepack unreliable on Alpine) + `HUSKY=0` in image builds
- [x] Deploy prune: unused SHA tags / dangling images / stopped containers before build, on failure, and after healthy deploy (keeps `:latest` / `:previous` / new SHA; never volumes)

## Phase 21 — Money (expense ledger, Sprint 0–1)

Per-user VND ledger. Spec: [`money-spec.md`](./money-spec.md).

- [x] Spec + nav (`/money`, header, sidebar section, `g m`, command palette)
- [x] Migration `0024_money_transactions` — BIGINT `amount_minor`, integer `direction` / `category`
- [x] DB / Zod / service / API under `/api/money/transactions`
- [x] UI: month list + totals + create/edit/delete modal; i18n (`en` / `vi` / `zh-CN` / `zh-TW`)
- [x] Vitest for money schemas + amount/yearMonth helpers; docs (api / database / roadmap / README)

## Phase 21 — Money (Sprint 2: charts + category UX)

- [x] Category color swatches; chip picker in modal; direction↔category coercion
- [x] Month filters (direction + category); chart legend click filters the list
- [x] Chart.js doughnut (spend by category) + daily expense bars on `/money`
- [x] `sumByCategory` / `sumDaily` helpers + Vitest; docs (`money-spec`, api, roadmap)

## Phase 21 — Money (Sprint 3: savings goals)

- [x] Migration `0025_money_savings` — goals + contributions; `MoneySavingsGoalStatus` integer enum
- [x] API under `/api/money/savings/*`; auto-complete Active goals when target reached
- [x] UI `/money/savings` — progress cards, contribute modal, contribution history; sidebar Ledger/Savings
- [x] Vitest for savings schemas + `savingsProgress`; docs

## Phase 21 — Money (Sprint 4: monthly budgets)

- [x] Migration `0026_money_budgets` — overall / category scopes; unique month slots
- [x] API `GET/POST/DELETE /api/money/budgets` + `POST …/copy`; spent from ledger Out
- [x] UI `/money/budgets` — progress vs spent, copy previous month; sidebar entry
- [x] Vitest for budget schemas + `budgetProgress`; docs

## Phase 21 — Money (Sprint 5: harden)

- [x] Client CSV/JSON export for ledger, savings goals, and budgets (`utils/moneyExport`, `useMoneyExport`, `MoneyExportMenu`)
- [x] Vitest for export builders; i18n export labels; docs polish (`money-spec` Sprint 5 as-built)

## Phase 22 — Public legal pages (privacy + terms)

- [x] `types/legal.ts` + `utils/legal/{privacy,terms}.ts` — documents as data (integer `LegalDocId`), authored in `en` + `vi`
- [x] `composables/useLegalDocument.ts` + `components/LegalDocumentView.vue` — one renderer, TOC, anchors, English fallback notice for `zh-*`
- [x] `pages/privacy.vue` / `pages/terms.vue` — public, SSR'd (`swr: 3600`), in the sitemap, listed in `llms.txt`
- [x] Per-page `LanguageSwitcher` (the header one is signed-in only, and the Vietnamese text prevails)
- [x] `components/AppFooter.vue` on hub + legal pages; signup consent line (`auth.signupConsent`)
- [x] `legal.*` / `footer.*` chrome strings in all four locales; `tests/legal.test.ts` guards cross-language structure
- [x] Content matches the install: cookie TTLs, retention windows, processors, admin reach (self-service account deletion added in Phase 23; chat message deletion still missing)

## Phase 23 — Self-service account deletion

- [x] `DELETE /api/auth/account` — typed email confirmation + password re-auth (omitted for Google-only); reuses `deleteUser`; clears cookies; rate-limited 5/min per IP and per email
- [x] `deleteUser` also clears email-targeted `jobs`, legacy story R2 keys, and the public feed cache (FK CASCADE already covers owned MySQL rows)
- [x] Settings → Danger zone + `DeleteAccountModal` (client gate in `utils/accountDeletion.ts`); superadmin cannot delete itself
- [x] Privacy §12–13 and Terms termination updated (EN + VI) to describe the flow; export gap and chat-message deletion still named as missing
- [x] `tests/account-deletion.test.ts` covers confirmation helpers + Zod schema; `scripts/verify-user-delete-cascade.ts` audits leftovers against MySQL

## Phase 24 — Sprint A (security blockers)

- [x] H1: Google login refuses auto-link on unverified password accounts (`oauth_error=unverified`); no silent `email_verified` flip
- [x] M6: Google token-exchange / userinfo failures log HTTP status only (no response bodies)
- [x] M5: HSTS via Nitro middleware + nginx prod template when HTTPS / `X-Forwarded-Proto: https`
- [x] M7: Privacy policy documents Money ledger; §14 aligned (HSTS; personal expenses OK; no bank passwords/cards/health secrets)
- [x] Vitest `tests/google-oauth-user.test.ts`; auth.md + i18n error copy

## Phase 25 — Sprint B (session / CSRF / LAN)

- [x] M3: Refresh-token families (`0030_refresh_token_family`); reuse of a revoked hash revokes the whole family
- [x] M4: Cookie-auth CSRF middleware on mutating `/api/*`; production requires Origin/Referer
- [x] M1: `clientIp` trusts `CF-Connecting-IP` / `X-Real-IP` only from trusted proxy peers (`LAN_IP` / `TRUSTED_PROXY_IPS`)
- [x] M2 (partial): MySQL/Redis stay on `${LAN_IP}` publish — loopback-only + `host.containers.internal` cannot reach `127.0.0.1` binds from Linux Podman bridge (reverted after deploy hang). True isolation needs compose DNS / shared network.
- [x] Zod for comment create + admin role body; drop `?access_token=` query auth

### Later

- Chat message deletion (still named as missing in the privacy policy)
- Lightweight tasks list API (blocks on demand)
- Migrate legacy string-token columns (`posts.visibility` / `format`, `uploads.kind`, `jobs.type` / `status`) to integer consts
