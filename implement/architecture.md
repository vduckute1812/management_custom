# Architecture

How the app is wired end-to-end. Pairs with [`database.md`](./database.md), [`api.md`](./api.md), [`auth.md`](./auth.md), and [`i18n.md`](./i18n.md).

---

## Tech Stack

| Layer      | Technology                     | Purpose                                                                                                                                          |
| ---------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend   | Nuxt 4.5 / Vue 3               | Reactive UI, routing; **hybrid**: SSR for `/` + `/feed`, SPA for app chrome                                                                      |
| Styling    | TailwindCSS v4                 | Utility-first layout and theming                                                                                                                 |
| i18n       | `@nuxtjs/i18n`                 | UI languages `en` / `vi` / `zh-CN` / `zh-TW` (`no_prefix`) — see [`i18n.md`](./i18n.md)                                                          |
| SEO        | `@nuxtjs/seo`                  | Site identity, `/robots.txt`, `/sitemap.xml`, OG/Twitter text meta (see below)                                                                   |
| Type-check | TypeScript **5.9** + `vue-tsc` | Classic TS only — native TypeScript 7 does not expose the API Volar/`vue-tsc` need                                                               |
| Backend    | Nitro (bundled with Nuxt 4.5)  | Server-side API routes                                                                                                                           |
| Storage    | MySQL 8 (`mysql2` driver)      | Primary persistence — database `rc` (override via env)                                                                                           |
| Cache      | Memory (default) / Redis       | Read-through cache via `server/utils/cache.ts`; Redis only when `REDIS_URL` is set                                                               |
| Queue      | MySQL `jobs` + Nitro worker    | Durable background jobs (email, cache invalidate, media purge); see [`cache-queue.md`](./cache-queue.md)                                         |
| Media      | Cloudflare R2 (S3 API)         | Optional object storage for feed/story/chat/avatar uploads (`server/utils/r2.ts`); keys `uploads/{kind}/…`                                       |
| Time       | Day.js                         | Date parsing, formatting, diffing (locale packs sync with UI language)                                                                           |
| Charts     | Chart.js                       | Velocity and trend visualizations                                                                                                                |
| Body text  | marked + DOMPurify + KaTeX     | GFM Markdown (#, lists, quotes, tables, code, links) + `$…$` / `$$…$$` math; sanitized for `v-html`                                              |
| Validation | Zod + `server/schemas`         | Shared request schemas; `parseBody` / `parseQuery` in `server/utils/http.ts`                                                                     |
| Tests      | Vitest                         | `npm test` — auth JWT/guards/attach, schemas, security, rate-limit, chat helpers, markdown sanitize. DB integration / Playwright are follow-ups. |

## Project facts

| Property     | Value                                                                       |
| ------------ | --------------------------------------------------------------------------- |
| Project Path | `~/Projects/management_custom`                                              |
| Public site  | `https://dntechx.com` (`site.url` in `nuxt.config.ts`)                      |
| Runtime      | Node.js ≥ 26.5 + npm 12 via Corepack (see `.nvmrc` / `packageManager`)      |
| Framework    | Nuxt 4.5 (Vue 3), **hybrid SSR** for public routes                          |
| TypeScript   | **5.9.x** (pinned for `vue-tsc` / Volar; do not bump to native TS 7)        |
| Styling      | TailwindCSS v4                                                              |
| Storage      | MySQL 8 — database `rc` on `localhost:3306` (override via env vars)         |
| Object store | Cloudflare R2 when `R2_*` set (feed/story attachments, chat media, avatars) |
| Auth cookies | HttpOnly `mgmt_rt` (refresh) + `mgmt_at` (access for media)                 |
| Telemetry    | None                                                                        |

---

## Runtime topology

Three product modules share one install: **Feed** (posts/stories), **Time Management** (tasks/epics/calendar), **Money** (personal expense ledger), and **Chat** (1:1 DMs). Auth and admin sit across all of them.

```
Browser (Vue 3 — hybrid SSR on `/` + `/feed`, SPA elsewhere)
    │
    ▼
Nuxt 4.5 / Nitro API Routes (/server/api/...)
    │
    ├── server/middleware/security-headers.ts  →  CSP + HSTS (when HTTPS) + baseline headers
    ├── server/middleware/rate-limit.ts      →  per-IP fixed-window caps on /api/*
    ├── server/middleware/auth.ts              →  Bearer / HttpOnly access cookie
    ├── server/middleware/csrf.ts              →  Origin/Referer check on cookie-auth mutations
    │
    ├── server/utils/cache.ts  →  memory | Redis (optional)
    │
    ├── server/services/*      →  selective workflow orchestration
    │     (task save, timer, post create, chat send/read, money CRUD,
    │      auth signup/refresh/delete/Google callback, …)
    │
    ├── server/utils/db.ts  →  server/db/*  ←→  MySQL 8 (`rc`)
    │     tables: users (+ locale / money_currency / profile via 0010+0028),
    │             auth_* (+ oauth identities 0023, refresh family 0030),
    │             epics, tasks, time_blocks, checklist_items, active_timer,
    │             posts, post_* (reactions/comments modules), uploads, stories,
    │             post_categories, jobs, schema_migrations,
    │             money_transactions / savings / budgets / user_categories (0024–0027),
    │             chat_conversations, chat_messages, chat_conversation_reads,
    │             chat_message_reactions
    │
    ├── server/plugins/job-worker.ts  →  claims `jobs` → mailer / cache bust / media purge
    │
    └── server/utils/r2.ts  ←→  Cloudflare R2 (when configured)
```

- **Connection pool.** `mysql2/promise` pool in `server/db/pool.ts`, created lazily via `getPool()` and reused for the server's lifetime. Pool size defaults to 10 (`DB_CONNECTION_LIMIT`).
- **Schema ownership.** Versioned SQL in `server/db/migrations/` (**0001…0030+**), applied by `npm run migrate`. Nitro plugin `server/plugins/db-verify.ts` aborts boot if any migration is pending or checksum-drifted. See [`database.md`](./database.md#migration-system).
- **DB layer.** `server/utils/db.ts` is a **barrel** re-exporting domain modules under `server/db/` (`users`, `epics`, `tasks`, `posts`, `postReactions`, `postComments`, `stories`, `uploads`, `categories`, `jobs`, `money*`, `chat`, …). Prefer importing from those modules or the barrel — do not grow a monolithic `db.ts`.
- **Request validation.** Shared Zod schemas live in `server/schemas/`; handlers use `parseBody` / `parseQuery` from `server/utils/http.ts`. Invalid enum values are rejected with `400` (no silent fallback).
- **Auth cookies.** Refresh token is HttpOnly `mgmt_rt` (never localStorage). Access JWT is returned for in-memory Bearer use and mirrored as HttpOnly `mgmt_at` so same-origin `<img>` media loads authenticate without `?access_token=` in the URL. Refresh rotation is a single MySQL transaction; tokens share a `family_id` so reuse of a revoked hash revokes the whole family (migration **0030**).
- **CSRF.** Cookie-authenticated mutating `/api/*` requests must present a same-origin `Origin` or `Referer` (production requires one). See `server/middleware/csrf.ts`.
- **Cache & queue.** Hot public reads use the cache facade; signup email and similar side-effects go through the MySQL job queue. Full design: [`cache-queue.md`](./cache-queue.md).
- **Transactions.** Multi-table writes (epic delete, task upsert with blocks/checklist, timer start that finalizes a prior task, signup user+verification, refresh rotate, etc.) run inside `BEGIN … COMMIT`.
- **Honest math.** Epic/task aggregates (`spentHours`, `progress`, …) are **computed on read**, never persisted.
- **Auth scoping.** Time-management and Money CRUD are always filtered by the authenticated `userId`. Feed reads may use `getOptionalUser` so anonymous clients see **public** posts; mutations still require a session. See [`auth.md`](./auth.md) and [`api.md`](./api.md).
- **OAuth.** Google login/link via `GET /api/auth/google` → callback; identity rows in `auth_identities` (migration **0023**). Unverified password accounts are **not** auto-linked (H1). Details: [`auth.md`](./auth.md).
- **Feed → Tasks seam.** `usePlanPostAsTask` owns "plan this post as a task"; Feed UI components must not call `useTasks` directly for that flow.

---

## Modules & routes (client)

| Area            | Routes                                                                      | Auth                                                                                     |
| --------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Hub             | `/`                                                                         | Public (localized category cards → `/feed?category=…`)                                   |
| Feed            | `/feed`, `/feed/write`, `/feed/edit/:id`                                    | Public browse; write/edit desks require login; compose/react/comment need login          |
| Time Management | `/tasks` (calendar dashboard), `/epics`, `/epics/:id`, `/analytics`         | Authenticated                                                                            |
| Money           | `/money`                                                                    | Authenticated — personal ledger (transactions, budgets, savings, categories)             |
| Account         | `/settings`, `/profile`                                                     | Authenticated; Settings → Danger zone deletes the account via `DELETE /api/auth/account` |
| Admin           | `/admin`                                                                    | Admin / superadmin                                                                       |
| Auth forms      | `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password` | Public; authed users bounce to `/`                                                       |
| Chat            | `/chat`                                                                     | Authenticated                                                                            |
| Legal           | `/privacy`, `/terms`                                                        | Public, SSR'd and indexable                                                              |

Global guard: `middleware/auth.global.ts`.

---

## Request validation & services

Handlers that accept JSON or query parameters should validate through shared Zod schemas in `server/schemas/index.ts` and the helpers in `server/utils/http.ts`:

| Helper           | Use                                                                 |
| ---------------- | ------------------------------------------------------------------- |
| `parseBody`      | `readBody` + `safeParse` → `400` with first issue message           |
| `parseQuery`     | `getQuery` + `safeParse` → `400`                                    |
| `DomainError`    | Typed business failure (`statusCode` + message) from service layers |
| `mapDomainError` | Maps `DomainError` / domain `statusCode` throws to Nitro errors     |

**Wired today (representative):** `loginBodySchema`, `taskUpsertBodySchema`, `epicUpsertBodySchema`, `timerStartBodySchema`, `postCreateBodySchema`, `feedQuerySchema`, plus Zod on profile/categories/posts patch routes from earlier feed work.

**Integer enums** on task/epic bodies must be numbers — string values are rejected with `400` (no silent fallback to defaults).

**Selective services** (`server/services/`) orchestrate multi-step workflows; keep thin read handlers as-is:

| Service                     | Responsibility                                                                |
| --------------------------- | ----------------------------------------------------------------------------- |
| `taskService`               | `saveTaskForUser` — ownership guards + upsert                                 |
| `timerService`              | `startTimerForUser` / `stopTimerForUser`                                      |
| `postService`               | `createPostForUser` + public-feed cache invalidate                            |
| `chatService`               | `sendChatMessage` / `markChatConversationRead` + inbox SSE fan-out            |
| `moneyService` (+ siblings) | Money ledger / budgets / savings / user-categories workflows                  |
| `authService`               | Signup, refresh rotation, account delete, Google OAuth callback orchestration |

Password-reset / verify-email and admin role policy remain mostly handler-orchestrated; prefer extracting services when touching those flows. Keep thin read handlers as-is.

Add new services only for workflows that span several DB calls or need shared transaction boundaries — not for every CRUD route.

---

## Money module

Per-user personal expense ledger (not shared with Feed). Amounts are **minor units** (`BIGINT`); display currency is `users.money_currency` (`MoneyCurrency` TINYINT — VND/USD/CNY/TWD). Schema: migrations **0024–0027** (+ **0028** locale/currency on users). Domain SQL: `server/db/money.ts`, `moneySavings.ts`, `moneyBudgets.ts`, plus user-categories helpers. Client: `/money`, `composables/useMoney*`, Chart.js via lazy `MoneyCharts`. Details: [`database.md`](./database.md#money-migration-0024), [`api.md`](./api.md).

---

## Security headers

`server/middleware/security-headers.ts` sets baseline headers on every response:

- `Content-Security-Policy` (self-hosted scripts/styles; `unsafe-inline` for theme boot + Vue; Cloudflare Insights beacon + Google Fonts allowlisted)
- `Strict-Transport-Security` when the request is HTTPS / `X-Forwarded-Proto: https` (also set on the nginx prod edge)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: SAMEORIGIN`
- `Permissions-Policy` — `camera=()`, `geolocation=()`, `microphone=(self)` (chat voice notes)

Tighten CSP further when inline boot scripts can be nonce-based.

---

## Client auth storage

| Surface             | Where it lives                                                           |
| ------------------- | ------------------------------------------------------------------------ |
| Refresh token       | HttpOnly cookie `mgmt_rt` (30 days) — **never** `localStorage`           |
| Access JWT          | In-memory via `useAuth.accessToken` + HttpOnly cookie `mgmt_at` (15 min) |
| User profile chrome | `localStorage` `auth:user` + flag `auth:hasSession` (non-secret)         |
| Theme / locale      | `localStorage` `mgmt:settings:v1` (unchanged)                            |

Boot flow (`plugins/auth.client.ts`): POST `/api/auth/refresh` with `credentials: 'include'` restores the access token. Legacy `auth:refreshToken` in `localStorage` is read once, sent in the refresh body, then wiped.

All authenticated API calls use `apiFetch` (`credentials: 'include'` + Bearer when in memory). Same-origin `/api/uploads/*` loads authenticate via `mgmt_at` without `?access_token=` in the URL.

`apiFetch` also deduplicates identical in-flight requests (same method + URL + query) without a fixed delay on the first call. Server-side caps are enforced separately by `server/middleware/rate-limit.ts` + `server/rate-limit/` — see [`api.md`](./api.md#rate-limiting).

---

## Project Structure

```
~/Projects/management_custom/
├── server/
│   ├── api/
│   │   ├── auth/                    # signup, login, refresh, logout, account delete, verify-email, me, profile, google/*
│   │   ├── admin/                   # users, stats, queue, role, DELETE user (superadmin)
│   │   ├── epics/                   # caller-scoped
│   │   ├── tasks/                   # caller-scoped
│   │   ├── timer/                   # per-user active timer
│   │   ├── money/                   # transactions, budgets, savings, user categories
│   │   ├── posts/                   # feed CRUD, comments, reactions, share
│   │   ├── stories/                 # 24h stories, views, reactions, insights
│   │   ├── uploads/                 # R2 upload + signed GET
│   │   ├── categories/              # public GET + admin POST/PATCH/DELETE
│   │   ├── chat/                    # DM conversations, messages, reactions, SSE streams, catalog
│   │   ├── feed/                    # GET /api/feed bootstrap (categories + posts + stories)
│   │   ├── geo.get.ts               # Public Cloudflare country hint for first-visit locale
│   │   └── users/directory.get.ts   # people picker for shared visibility + chat
│   ├── schemas/
│   │   └── index.ts                 # Shared Zod request schemas (+ auth.ts, money*, …)
│   ├── services/
│   │   ├── taskService.ts           # Task upsert workflow
│   │   ├── timerService.ts          # Timer start/stop workflow
│   │   ├── postService.ts           # Post create + cache bust
│   │   ├── chatService.ts           # Chat send/read + inbox SSE push
│   │   ├── moneyService.ts          # Money ledger (+ budgets/savings/categories siblings)
│   │   └── authService.ts           # Signup / refresh / account delete / Google callback
│   ├── db/                          # SQL domain modules + migrator + pool
│   │   ├── posts.ts                 # Post list / CRUD / visibility helpers
│   │   ├── postReactions.ts         # Reaction set / clear
│   │   ├── postComments.ts          # Comments CRUD + comment_count recount
│   │   └── migrations/              # 0001…0030+ SQL files
│   ├── rate-limit/                  # Per-IP rate limit module (policies + in-memory store)
│   ├── middleware/
│   │   ├── auth.ts                  # Hydrates context.user from Bearer / mgmt_at
│   │   ├── csrf.ts                  # Cookie-auth Origin/Referer gate on mutations
│   │   ├── rate-limit.ts            # Per-IP fixed-window caps on /api/*
│   │   └── security-headers.ts      # CSP + HSTS + baseline security headers
│   ├── plugins/
│   │   ├── db-verify.ts             # Refuses boot if migrations pending/drifted
│   │   └── job-worker.ts            # MySQL jobs worker
│   └── utils/
│       ├── db.ts                    # Barrel over server/db/*
│       ├── chatInbox.ts             # In-process SSE fan-out for unread badge
│       ├── chatThread.ts            # In-process SSE fan-out for open thread
│       ├── http.ts                  # parseBody, parseQuery, DomainError, mapDomainError
│       ├── refreshCookie.ts         # HttpOnly mgmt_rt / mgmt_at helpers
│       ├── auth.ts / authContext.ts # JWT, bcrypt, requireUser / requireAdmin / requireSuperAdmin
│       ├── googleOAuth*.ts          # Google OAuth config, state, profile → user
│       ├── mailer.ts                # SMTP + console dry-run; APP_BASE_URL preferred
│       ├── queue.ts                 # Enqueue helpers (email.*, cache.invalidate, media.purgeExpired)
│       ├── r2.ts                    # S3-compatible Cloudflare R2 client
│       └── fileSignature.ts         # Magic-byte sniff for uploads
├── tests/                           # Vitest unit tests (`npm test`) — DB-free
│   ├── auth-*.test.ts               # JWT, role guards, attach (Bearer/cookie)
│   ├── helpers/                     # H3Event stubs for authContext
│   ├── schemas.test.ts
│   ├── security-utils.test.ts
│   └── …                            # rate-limit, chat helpers, feed cursor, markdown, google OAuth, …
├── scripts/
│   ├── migrate.ts                   # CLI for npm run migrate*
│   ├── migrate-auth.ts              # Seed superadmin
│   ├── check-db.ts                  # npm run check:db
│   ├── scan-secrets.mjs             # Pre-commit secret scanner
│   └── notify-public-ip-change.ts   # Optional ops helper
├── pages/
│   ├── index.vue                    # Public hub (localized category cards + module blurbs)
│   ├── feed/index.vue, feed/write, feed/edit/:id
│   ├── chat/index.vue               # Direct messages (auth required)
│   ├── tasks/index.vue              # Calendar dashboard (Time Management)
│   ├── money/index.vue              # Personal expense ledger
│   ├── epics/, analytics.vue, admin/, settings.vue, profile.vue
│   ├── privacy.vue, terms.vue          # Public legal pages (SSR'd, indexable)
│   └── login.vue, signup.vue, verify-email.vue, forgot-password, reset-password
├── components/                      # Flat SFC set (calendars, feed, shell, money, …)
│   ├── AppHeader.vue, AppFooter.vue, LanguageSwitcher.vue, CommandPalette.vue, …
│   ├── LegalDocumentView.vue        # Renders a privacy / terms document
│   ├── PostComposer.vue, PostCard.vue, PostCommentsPanel.vue, StoryTray.vue, …
│   ├── ChatConversationList.vue, ChatMessageThread.vue, ChatComposer.vue
│   ├── MoneyCharts.vue, …           # Lazy-loaded ledger charts / modals
│   └── CalendarDaily.vue, TaskModal.vue, AnalyticsDashboard.vue, …
├── composables/
│   ├── useAuth.ts, useApi.ts, useSettings.ts, useToasts.ts, useUiOverlays.ts
│   ├── useTasks.ts, useEpics.ts, useTimer.ts, useRecurrence.ts, useSchedule.ts
│   ├── useNotifications.ts, useNow.ts, useExport.ts, useSampleData.ts
│   ├── usePosts.ts, useStories.ts, useUploads.ts, useCategories.ts
│   ├── useMoney.ts, useMoneyBudgets.ts, useMoneySavings.ts, …
│   ├── useManuscriptFont.ts         # Deferred Source Serif 4 for manuscript chrome
│   ├── useChat.ts                   # DM list / thread / module-scoped SSE singleton / send
│   ├── usePlanPostAsTask.ts         # Feed → Time Management seam
│   ├── useMediaUrl.ts, useUserDirectory.ts, useShortcuts.ts
│   ├── useLegalDocument.ts          # Privacy / terms text for the active locale
├── middleware/auth.global.ts
├── layouts/default.vue
├── plugins/
│   ├── auth.client.ts               # Cookie session hydrate + legacy LS migration
│   ├── theme.client.ts
│   ├── i18n-locale.client.ts        # Settings ↔ i18n; first visit: /api/geo → timezone → browser
│   ├── chat-inbox.client.ts         # Unread badge / toast via SSE inbox stream
│   └── notifications.client.ts
├── i18n/locales/                    # en, vi, zh-CN, zh-TW
├── types/                           # auth.ts, task.ts, post.ts, story.ts, chat.ts, money.ts, reaction.ts, locale.ts, legal.ts
├── utils/                           # parseQuickCapture, renderPostBody, uploadPolicy, money helpers, …
│   └── legal/                       # privacy.ts + terms.ts document text (en/vi) + registry
├── implement/                       # Technical documentation (you are here)
├── vitest.config.ts
├── .env.example
└── nuxt.config.ts                   # Hybrid routeRules + @nuxtjs/i18n + @nuxtjs/seo
```

**Shared types.** Account identity / roles / OAuth consts live in `types/auth.ts` (`UserRole`, `AuthUser`, `AuthProvider`, …). Task/epic types stay in `types/task.ts`, which **re-exports** the auth surface for backward-compatible imports. Server barrel `server/db/types.ts` re-exports auth from `types/auth.ts`.

**Chat live delivery.** Inbox badge/toasts use `GET /api/chat/inbox/stream` (`server/utils/chatInbox.ts` + `plugins/chat-inbox.client.ts`). The open thread uses `GET /api/chat/conversations/:id/stream` (`server/utils/chatThread.ts`); `composables/useChat.ts` keeps a **module-scoped EventSource singleton** so multiple callers share one connection, emits `message` / `read` / `reaction` / `ping`, and falls back to slow REST after repeated stream failures. Send/read orchestration (+ inbox fan-out) lives in `server/services/chatService.ts`.

**Feed first paint.** `/feed` calls `GET /api/feed` once for categories + first posts page + stories (when signed in), then infinite-scrolls older pages via `GET /api/posts?cursor=…`. Post SQL is split: list/CRUD in `server/db/posts.ts`, reactions in `postReactions.ts`, comments (+ recount) in `postComments.ts`.

**Testing.** The Vitest suite is **DB-free** (JWT, role guards, Zod schemas, pure helpers). Ephemeral-MySQL integration (refresh rotation, ACL, migrations) and Playwright smoke are follow-ups once a test database is available in CI.

---

## SEO (`@nuxtjs/seo`)

Configured in `nuxt.config.ts` for production identity **Da Nang TechX** / `https://dntechx.com`:

| Surface              | Behavior                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/robots.txt`        | Allows crawl of public surfaces; `Disallow` for private app/auth routes including `/chat`, `/feed/write`, `/feed/edit`                                                 |
| `/sitemap.xml`       | Indexes `/`, `/feed`, `/privacy`, and `/terms` only (private app routes excluded, including `/chat`)                                                                   |
| `/llms.txt`          | Static Markdown at `public/llms.txt` — H1 + summary + absolute links for AI/agent crawlers                                                                             |
| Open Graph / Twitter | Text meta via `nuxt-seo-utils`; **dynamic OG image generation is disabled** (`ogImage.enabled: false`) — native `@takumi-rs/core` is not viable on the ARM deploy host |
| Page titles          | Still set per-page with `useSeoMeta` + `t('seo.*')` (see [`i18n.md`](./i18n.md#seo-titles))                                                                            |
| HTML for crawlers    | `/`, `/feed`, `/privacy`, and `/terms` use **selective SSR** (`routeRules` + SWR) so the first response includes real copy — not an empty SPA shell                    |

Auth remains cookie/Bearer-based on the client, so SSR always paints the **guest** chrome; `isAuthenticatedUi` reveals the signed-in header/composer after mount to avoid hydration mismatches. App routes (`/tasks`, `/admin`, …) stay `ssr: false`.

After deploy, verify `/`, `/feed`, `/privacy`, `/terms`, `/robots.txt`, `/sitemap.xml`, and `/llms.txt` on the live host and submit the sitemap in Google Search Console.

---

## Legal pages (`/privacy`, `/terms`)

The privacy policy and terms of service are **content as data**, not markup: `utils/legal/privacy.ts` and `utils/legal/terms.ts` export a `LegalDocumentSet` (`types/legal.ts`) with a title, summary, ISO effective date, intro paragraphs, and ordered sections carrying a stable anchor `id`. `LegalDocId` is an integer const (`Privacy = 0`, `Terms = 1`) per the repo's integer-enum rule.

| Piece                              | Role                                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `utils/legal/index.ts`             | Registry (`LEGAL_DOCUMENTS`, `LEGAL_DOC_PATHS`), `authoredLegalLocale`, `legalDocument` — all pure, so testable |
| `composables/useLegalDocument.ts`  | Reactive wrapper: resolves the document for the active UI locale, flags the English fallback                    |
| `components/LegalDocumentView.vue` | Renders any document: header, effective date, language notice, table of contents, sections, contact block       |
| `pages/privacy.vue` / `terms.vue`  | Thin pages: `useSeoMeta` + the view component                                                                   |
| `components/AppFooter.vue`         | Footer with the legal links; rendered by `layouts/default.vue` on `/`, `/privacy`, `/terms` only                |

The text is authored in **English and Vietnamese**; `zh-CN` / `zh-TW` read the English document and the page says so (`legal.languageFallback`). Each legal page carries its own `LanguageSwitcher`: the header account menu — the only other place it lives — renders for signed-in users only, so without it a visitor could never reach the Vietnamese text, which is the version that prevails. Chrome strings live in the locale JSONs under `legal.*` / `footer.*`; the document bodies deliberately do **not**, so the four locale files stay chrome-sized. `tests/legal.test.ts` enforces that both languages keep the same section ids, dates, and non-empty blocks.

Signup shows a consent line (`auth.signupConsent`) linking both documents. There is no consent checkbox: creating the account is the acceptance.

---

## UI language (i18n)

The chrome is fully translated; user content is not. Locale is a **device preference** in `mgmt:settings:v1`, not a URL prefix and not a MySQL column.

Flow: `LanguageSwitcher` → `useSettings.locale` → `plugins/i18n-locale.client.ts` → `setLocale` + Day.js pack + `document.documentElement.lang`. On first visit (no stored locale), the plugin tries `GET /api/geo` (Cloudflare `CF-IPCountry`) → device timezone → browser/i18n fallback. Details: [`i18n.md`](./i18n.md).

---

## Pre-task alerts & live "now" indicator

**`useNow`** (`composables/useNow.ts`) — shared reactive Dayjs via `useState`, ticks every 30s, force-refreshes on `visibilitychange`.

**Now-line.** `CalendarDaily` draws a horizontal line (+ `HH:mm` gutter badge) when the viewed day is today. `CalendarWeekly` shows a `Now HH:mm` pill on today's column header.

**Pre-task alerts.** `useNotifications` fires once per `${taskId}:${blockId}` at `block.start - settings.notificationLeadMinutes` (default 5):

- **In-app toast** — `useToasts.pushToast` with an **Open** action that calls `useUiOverlays.requestFocusTask(taskId)` and navigates to **`/tasks`** if needed. The tasks page watches `focusTaskId` and opens `TaskModal`.
- **Desktop pop-up** — `new Notification(...)` when permission is granted (upgrade; toast still fires).

`scheduleAll` runs on tasks/settings change and every 15 min via `plugins/notifications.client.ts`. If the lead window already elapsed but the block hasn't started, the alert fires immediately on the next pass.
