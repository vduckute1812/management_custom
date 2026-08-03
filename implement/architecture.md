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

Three product modules share one install: **Feed** (posts/stories), **Time Management** (tasks/epics/calendar), and **Chat** (1:1 DMs). Auth and admin sit across all three.

```
Browser (Vue 3 — hybrid SSR on `/` + `/feed`, SPA elsewhere)
    │
    ▼
Nuxt 4.5 / Nitro API Routes (/server/api/...)
    │
    ├── server/middleware/security-headers.ts  →  CSP + baseline headers
    ├── server/middleware/rate-limit.ts      →  per-IP fixed-window caps on /api/*
    ├── server/middleware/auth.ts              →  Bearer / HttpOnly access cookie
    │
    ├── server/utils/cache.ts  →  memory | Redis (optional)
    │
    ├── server/services/*      →  selective workflow orchestration
    │     (task save, timer start/stop, post create, chat send/read, …)
    │
    ├── server/utils/db.ts  →  server/db/*  ←→  MySQL 8 (`rc`)
    │     tables: users (+ last_login_at, profile fields via 0010), auth_*,
    │             epics, tasks, time_blocks, checklist_items, active_timer,
    │             posts, post_*, uploads, stories, story_*,
    │             post_categories, jobs, schema_migrations,
    │             chat_conversations, chat_messages, chat_conversation_reads,
    │             chat_message_reactions
    │
    ├── server/plugins/job-worker.ts  →  claims `jobs` → mailer / cache bust / media purge
    │
    └── server/utils/r2.ts  ←→  Cloudflare R2 (when configured)
```

- **Connection pool.** `mysql2/promise` pool in `server/db/pool.ts`, created lazily via `getPool()` and reused for the server's lifetime. Pool size defaults to 10 (`DB_CONNECTION_LIMIT`).
- **Schema ownership.** Versioned SQL in `server/db/migrations/`, applied by `npm run migrate`. Nitro plugin `server/plugins/db-verify.ts` aborts boot if any migration is pending or checksum-drifted. See [`database.md`](./database.md#migration-system).
- **DB layer.** `server/utils/db.ts` is a **barrel** re-exporting domain modules under `server/db/` (`users`, `epics`, `tasks`, `posts`, `stories`, `uploads`, `categories`, `jobs`, …). Prefer importing from those modules or the barrel — do not grow a monolithic `db.ts`.
- **Request validation.** Shared Zod schemas live in `server/schemas/`; handlers use `parseBody` / `parseQuery` from `server/utils/http.ts`. Invalid enum values are rejected with `400` (no silent fallback).
- **Auth cookies.** Refresh token is HttpOnly `mgmt_rt` (never localStorage). Access JWT is returned for in-memory Bearer use and mirrored as HttpOnly `mgmt_at` so same-origin `<img>` media loads authenticate without `?access_token=` in the URL. Refresh rotation is a single MySQL transaction.
- **Cache & queue.** Hot public reads use the cache facade; signup email and similar side-effects go through the MySQL job queue. Full design: [`cache-queue.md`](./cache-queue.md).
- **Transactions.** Multi-table writes (epic delete, task upsert with blocks/checklist, timer start that finalizes a prior task, signup user+verification, refresh rotate, etc.) run inside `BEGIN … COMMIT`.
- **Honest math.** Epic/task aggregates (`spentHours`, `progress`, …) are **computed on read**, never persisted.
- **Auth scoping.** Time-management CRUD is always filtered by the authenticated `userId`. Feed reads may use `getOptionalUser` so anonymous clients see **public** posts; mutations still require a session. See [`auth.md`](./auth.md) and [`api.md`](./api.md).
- **Feed → Tasks seam.** `usePlanPostAsTask` owns "plan this post as a task"; Feed UI components must not call `useTasks` directly for that flow.

---

## Modules & routes (client)

| Area            | Routes                                                                      | Auth                                                                            |
| --------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Hub             | `/`                                                                         | Public (localized category cards → `/feed?category=…`)                          |
| Feed            | `/feed`, `/feed/write`, `/feed/edit/:id`                                    | Public browse; write/edit desks require login; compose/react/comment need login |
| Time Management | `/tasks` (calendar dashboard), `/epics`, `/epics/:id`, `/analytics`         | Authenticated                                                                   |
| Account         | `/settings`, `/profile`                                                     | Authenticated                                                                   |
| Admin           | `/admin`                                                                    | Admin / superadmin                                                              |
| Auth forms      | `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password` | Public; authed users bounce to `/`                                              |
| Chat            | `/chat`                                                                     | Authenticated                                                                   |
| Legal           | `/privacy`, `/terms`                                                        | Public, SSR'd and indexable                                                     |

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

| Service        | Responsibility                                                     |
| -------------- | ------------------------------------------------------------------ |
| `taskService`  | `saveTaskForUser` — ownership guards + upsert                      |
| `timerService` | `startTimerForUser` / `stopTimerForUser`                           |
| `postService`  | `createPostForUser` + public-feed cache invalidate                 |
| `chatService`  | `sendChatMessage` / `markChatConversationRead` + inbox SSE fan-out |

Auth signup / refresh / password-reset, post update/share, and admin role policy are still mostly handler-orchestrated; prefer extracting services when touching those flows. Keep thin read handlers as-is.

Add new services only for workflows that span several DB calls or need shared transaction boundaries — not for every CRUD route.

---

## Security headers

`server/middleware/security-headers.ts` sets baseline headers on every response:

- `Content-Security-Policy` (self-hosted scripts/styles; `unsafe-inline` for theme boot + Vue; Cloudflare Insights beacon + Google Fonts allowlisted)
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
│   │   ├── auth/                    # signup, login, refresh, logout, verify-email, me, profile
│   │   ├── admin/                   # users, stats, queue, role, DELETE user (superadmin)
│   │   ├── epics/                   # caller-scoped
│   │   ├── tasks/                   # caller-scoped
│   │   ├── timer/                   # per-user active timer
│   │   ├── posts/                   # feed CRUD, comments, reactions, share
│   │   ├── stories/                 # 24h stories, views, reactions, insights
│   │   ├── uploads/                 # R2 upload + signed GET
│   │   ├── categories/              # public GET + admin POST/PATCH/DELETE
│   │   ├── chat/                    # DM conversations, messages, reactions, SSE streams, catalog
│   │   ├── feed/                    # GET /api/feed bootstrap (categories + posts + stories)
│   │   ├── geo.get.ts               # Public Cloudflare country hint for first-visit locale
│   │   └── users/directory.get.ts   # people picker for shared visibility + chat
│   ├── schemas/
│   │   └── index.ts                 # Shared Zod request schemas
│   ├── services/
│   │   ├── taskService.ts           # Task upsert workflow
│   │   ├── timerService.ts          # Timer start/stop workflow
│   │   ├── postService.ts           # Post create + cache bust
│   │   └── chatService.ts           # Chat send/read + inbox SSE push
│   ├── db/                          # SQL domain modules + migrator + pool
│   │   └── migrations/              # 0001…0018 SQL files
│   ├── rate-limit/                  # Per-IP rate limit module (policies + in-memory store)
│   ├── middleware/
│   │   ├── auth.ts                  # Hydrates context.user from Bearer / mgmt_at
│   │   ├── rate-limit.ts            # Per-IP fixed-window caps on /api/*
│   │   └── security-headers.ts      # CSP + baseline security headers
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
│       ├── mailer.ts                # SMTP + console dry-run; APP_BASE_URL preferred
│       ├── queue.ts                 # Enqueue helpers (email.*, cache.invalidate, media.purgeExpired)
│       ├── r2.ts                    # S3-compatible Cloudflare R2 client
│       └── fileSignature.ts         # Magic-byte sniff for uploads
├── tests/                           # Vitest unit tests (`npm test`) — DB-free
│   ├── auth-*.test.ts               # JWT, role guards, attach (Bearer/cookie/upload query)
│   ├── helpers/                     # H3Event stubs for authContext
│   ├── schemas.test.ts
│   ├── security-utils.test.ts
│   └── …                            # rate-limit, chat helpers, feed cursor, markdown, …
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
│   ├── epics/, analytics.vue, admin/, settings.vue, profile.vue
│   ├── privacy.vue, terms.vue          # Public legal pages (SSR'd, indexable)
│   └── login.vue, signup.vue, verify-email.vue, forgot-password, reset-password
├── components/                      # Flat SFC set (calendars, feed, shell, …)
│   ├── AppHeader.vue, AppFooter.vue, LanguageSwitcher.vue, CommandPalette.vue, …
│   ├── LegalDocumentView.vue        # Renders a privacy / terms document
│   ├── PostComposer.vue, PostCard.vue, PostCommentsPanel.vue, StoryTray.vue, …
│   ├── ChatConversationList.vue, ChatMessageThread.vue, ChatComposer.vue
│   └── CalendarDaily.vue, TaskModal.vue, AnalyticsDashboard.vue, …
├── composables/
│   ├── useAuth.ts, useApi.ts, useSettings.ts, useToasts.ts, useUiOverlays.ts
│   ├── useTasks.ts, useEpics.ts, useTimer.ts, useRecurrence.ts, useSchedule.ts
│   ├── useNotifications.ts, useNow.ts, useExport.ts, useSampleData.ts
│   ├── usePosts.ts, useStories.ts, useUploads.ts, useCategories.ts
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
├── types/                           # task.ts, post.ts, story.ts, chat.ts, reaction.ts, locale.ts, legal.ts
├── utils/                           # parseQuickCapture, renderPostBody, uploadPolicy, …
│   └── legal/                       # privacy.ts + terms.ts document text (en/vi) + registry
├── implement/                       # Technical documentation (you are here)
├── vitest.config.ts
├── .env.example
└── nuxt.config.ts                   # Hybrid routeRules + @nuxtjs/i18n + @nuxtjs/seo
```

**Chat live delivery.** Inbox badge/toasts use `GET /api/chat/inbox/stream` (`server/utils/chatInbox.ts` + `plugins/chat-inbox.client.ts`). The open thread uses `GET /api/chat/conversations/:id/stream` (`server/utils/chatThread.ts`); `composables/useChat.ts` keeps a **module-scoped EventSource singleton** so multiple callers share one connection, emits `message` / `read` / `reaction` / `ping`, and falls back to slow REST after repeated stream failures. Send/read orchestration (+ inbox fan-out) lives in `server/services/chatService.ts`.

**Feed first paint.** `/feed` calls `GET /api/feed` once for categories + first posts page + stories (when signed in), then infinite-scrolls older pages via `GET /api/posts?cursor=…`.

**Testing.** The Vitest suite is **DB-free** (JWT, role guards, media `?access_token=` scope, Zod schemas, pure helpers). Ephemeral-MySQL integration (refresh rotation, ACL, migrations) and Playwright smoke are follow-ups once a test database is available in CI.

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

The text is authored in **English and Vietnamese**; `zh-CN` / `zh-TW` read the English document and the page says so (`legal.languageFallback`). Chrome strings live in the locale JSONs under `legal.*` / `footer.*`; the document bodies deliberately do **not**, so the four locale files stay chrome-sized. `tests/legal.test.ts` enforces that both languages keep the same section ids, dates, and non-empty blocks.

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
