# Architecture

How the app is wired end-to-end. Pairs with [`database.md`](./database.md), [`api.md`](./api.md), [`auth.md`](./auth.md), and [`i18n.md`](./i18n.md).

---

## Tech Stack

| Layer      | Technology                     | Purpose                                                                                             |
| ---------- | ------------------------------ | --------------------------------------------------------------------------------------------------- |
| Frontend   | Nuxt 3 / Vue 3                 | Reactive UI, routing, SPA via `routeRules` `ssr: false`                                             |
| Styling    | TailwindCSS v4                 | Utility-first layout and theming                                                                    |
| i18n       | `@nuxtjs/i18n`                 | UI languages `en` / `vi` / `zh-CN` / `zh-TW` (`no_prefix`) — see [`i18n.md`](./i18n.md)             |
| SEO        | `@nuxtjs/seo`                  | Site identity, `/robots.txt`, `/sitemap.xml`, OG/Twitter text meta (see below)                      |
| Type-check | TypeScript **5.9** + `vue-tsc` | Classic TS only — native TypeScript 7 does not expose the API Volar/`vue-tsc` need                  |
| Backend    | Nitro (bundled with Nuxt 3)    | Server-side API routes                                                                              |
| Storage    | MySQL 8 (`mysql2` driver)      | Primary persistence — database `rc` (override via env)                                              |
| Cache      | Memory (default) / Redis       | Read-through cache via `server/utils/cache.ts`; Redis only when `REDIS_URL` is set                  |
| Queue      | MySQL `jobs` + Nitro worker    | Durable background jobs (email, cache invalidate); see [`cache-queue.md`](./cache-queue.md)         |
| Media      | Cloudflare R2 (S3 API)         | Optional object storage for feed/story uploads (`server/utils/r2.ts`)                               |
| Time       | Day.js                         | Date parsing, formatting, diffing (locale packs sync with UI language)                              |
| Charts     | Chart.js                       | Velocity and trend visualizations                                                                   |
| Body text  | marked + DOMPurify + KaTeX     | GFM Markdown (#, lists, quotes, tables, code, links) + `$…$` / `$$…$$` math; sanitized for `v-html` |

## Project facts

| Property     | Value                                                                 |
| ------------ | --------------------------------------------------------------------- |
| Project Path | `~/Projects/management_custom`                                        |
| Public site  | `https://dntechx.com` (`site.url` in `nuxt.config.ts`)                |
| Runtime      | Node.js ≥ 24 (see `.nvmrc`)                                           |
| Framework    | Nuxt 3 (Vue 3), client-only SPA                                       |
| TypeScript   | **5.9.x** (pinned for `vue-tsc` / Volar; do not bump to native TS 7)  |
| Styling      | TailwindCSS v4                                                        |
| Storage      | MySQL 8 — database `rc` on `localhost:3306` (override via env vars)   |
| Object store | Cloudflare R2 when `R2_*` env vars are set (feed attachments/stories) |
| Telemetry    | None                                                                  |

---

## Runtime topology

Two product modules share one install: **Feed** (posts/stories) and **Time Management** (tasks/epics/calendar). Auth and admin sit across both.

```
Browser (Vue 3 SPA)
    │
    ▼
Nuxt 3 / Nitro API Routes (/server/api/...)
    │
    ├── server/utils/cache.ts  →  memory | Redis (optional)
    │
    ├── server/utils/db.ts  →  server/db/*  ←→  MySQL 8 (`rc`)
    │     tables: users (+ last_login_at), auth_*, epics, tasks,
    │             time_blocks, checklist_items, active_timer,
    │             posts, post_*, uploads, stories, story_*,
    │             post_categories, jobs, schema_migrations
    │
    ├── server/plugins/job-worker.ts  →  claims `jobs` → mailer / cache bust
    │
    └── server/utils/r2.ts  ←→  Cloudflare R2 (when configured)
```

- **Connection pool.** `mysql2/promise` pool in `server/db/pool.ts`, created lazily via `getPool()` and reused for the server's lifetime. Pool size defaults to 10 (`DB_CONNECTION_LIMIT`).
- **Schema ownership.** Versioned SQL in `server/db/migrations/`, applied by `npm run migrate`. Nitro plugin `server/plugins/db-verify.ts` aborts boot if any migration is pending or checksum-drifted. See [`database.md`](./database.md#migration-system).
- **DB layer.** `server/utils/db.ts` is a **barrel** re-exporting domain modules under `server/db/` (`users`, `epics`, `tasks`, `posts`, `stories`, `uploads`, `categories`, `jobs`, …). Prefer importing from those modules or the barrel — do not grow a monolithic `db.ts`.
- **Cache & queue.** Hot public reads use the cache facade; signup email and similar side-effects go through the MySQL job queue. Full design: [`cache-queue.md`](./cache-queue.md).
- **Transactions.** Multi-table writes (epic delete, task upsert with blocks/checklist, timer start that finalizes a prior task, etc.) run inside `BEGIN … COMMIT`.
- **Honest math.** Epic/task aggregates (`spentHours`, `progress`, …) are **computed on read**, never persisted.
- **Auth scoping.** Time-management CRUD is always filtered by the authenticated `userId`. Feed reads may use `getOptionalUser` so anonymous clients see **public** posts; mutations still require a session. See [`auth.md`](./auth.md) and [`api.md`](./api.md).

---

## Modules & routes (client)

| Area            | Routes                                                              | Auth                                                                       |
| --------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Hub             | `/`                                                                 | Public (localized category cards → `/feed?category=…`)                     |
| Feed            | `/feed`, `/feed/write` (manuscript desk)                            | Public browse; write desk requires login; compose/react/comment need login |
| Time Management | `/tasks` (calendar dashboard), `/epics`, `/epics/:id`, `/analytics` | Authenticated                                                              |
| Account         | `/settings`, `/profile`                                             | Authenticated                                                              |
| Admin           | `/admin`                                                            | Admin / superadmin                                                         |
| Auth forms      | `/login`, `/signup`, `/verify-email`                                | Public; authed users bounce to `/`                                         |

Global guard: `middleware/auth.global.ts`.

---

## Project Structure

```
~/Projects/management_custom/
├── server/
│   ├── api/
│   │   ├── auth/                    # signup, login, refresh, logout, verify-email, me
│   │   ├── admin/                   # users, stats, role, DELETE user (superadmin)
│   │   ├── epics/                   # caller-scoped
│   │   ├── tasks/                   # caller-scoped
│   │   ├── timer/                   # per-user active timer
│   │   ├── posts/                   # feed CRUD, comments, reactions, share
│   │   ├── stories/                 # 24h stories, views, reactions, insights
│   │   ├── uploads/                 # R2 upload + signed GET
│   │   ├── categories/              # public GET + admin POST/PATCH/DELETE
│   │   └── users/directory.get.ts   # people picker for shared visibility
│   ├── db/                          # SQL domain modules + migrator + pool
│   │   └── migrations/              # 0001…0006 SQL files
│   ├── middleware/auth.ts           # Hydrates event.context.user from Bearer JWT
│   ├── plugins/db-verify.ts         # Refuses boot if migrations pending/drifted
│   └── utils/
│       ├── db.ts                    # Barrel over server/db/*
│       ├── auth.ts / authContext.ts # JWT, bcrypt, requireUser / requireAdmin / requireSuperAdmin
│       ├── mailer.ts                # SMTP + console dry-run; APP_BASE_URL preferred
│       ├── r2.ts                    # S3-compatible Cloudflare R2 client
│       └── fileSignature.ts         # Magic-byte sniff for uploads
├── scripts/
│   ├── migrate.ts                   # CLI for npm run migrate*
│   ├── migrate-auth.ts              # Seed superadmin
│   ├── check-db.ts                  # npm run check:db
│   ├── scan-secrets.mjs             # Pre-commit secret scanner
│   └── notify-public-ip-change.ts   # Optional ops helper
├── pages/
│   ├── index.vue                    # Public hub (localized category cards + module blurbs)
│   ├── feed/index.vue
│   ├── tasks/index.vue              # Calendar dashboard (Time Management)
│   ├── epics/, analytics.vue, admin/, settings.vue, profile.vue
│   └── login.vue, signup.vue, verify-email.vue
├── components/                      # Flat SFC set (calendars, feed, shell, …)
│   ├── AppHeader.vue, LanguageSwitcher.vue, CommandPalette.vue, …
│   ├── PostComposer.vue, PostCard.vue, StoryTray.vue, StoryViewer.vue, …
│   └── CalendarDaily.vue, TaskModal.vue, AnalyticsDashboard.vue, …
├── composables/
│   ├── useAuth.ts, useApi.ts, useSettings.ts, useToasts.ts, useUiOverlays.ts
│   ├── useTasks.ts, useEpics.ts, useTimer.ts, useRecurrence.ts, useSchedule.ts
│   ├── useNotifications.ts, useNow.ts, useExport.ts, useSampleData.ts
│   ├── usePosts.ts, useStories.ts, useUploads.ts, useCategories.ts
│   ├── useMediaUrl.ts, useUserDirectory.ts, useShortcuts.ts
├── middleware/auth.global.ts
├── layouts/default.vue
├── plugins/
│   ├── auth.client.ts
│   ├── theme.client.ts
│   ├── i18n-locale.client.ts
│   └── notifications.client.ts
├── i18n/locales/                    # en, vi, zh-CN, zh-TW
├── types/                           # task.ts, post.ts, story.ts, locale.ts
├── utils/                           # parseQuickCapture, renderPostBody, uploadPolicy, categoryLabel, …
├── implement/                       # Technical documentation (you are here)
├── .env.example
└── nuxt.config.ts                   # SPA routeRules + @nuxtjs/i18n + @nuxtjs/seo
```

---

## SEO (`@nuxtjs/seo`)

Configured in `nuxt.config.ts` for production identity **Da Nang TechX** / `https://dntechx.com`:

| Surface              | Behavior                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/robots.txt`        | Allows crawl of public surfaces; `Disallow` for `/tasks`, `/epics`, `/analytics`, `/admin`, `/settings`, `/profile`, `/login`, `/signup`, `/verify-email`              |
| `/sitemap.xml`       | Indexes `/` and `/feed` only (private app routes excluded)                                                                                                             |
| Open Graph / Twitter | Text meta via `nuxt-seo-utils`; **dynamic OG image generation is disabled** (`ogImage.enabled: false`) — native `@takumi-rs/core` is not viable on the ARM deploy host |
| Page titles          | Still set per-page with `useSeoMeta` + `t('seo.*')` (see [`i18n.md`](./i18n.md#seo-titles))                                                                            |

**SPA caveat.** The whole app remains `routeRules: { "/**": { ssr: false } }`. Google can execute JS; many social crawlers do not. `/robots.txt` and `/sitemap.xml` are Nitro routes and work without SSR. Full HTML meta in the first response for `/` and `/feed` would require selective SSR/prerender later.

After deploy, verify the two endpoints on the live host and submit the sitemap in Google Search Console.

---

## UI language (i18n)

The chrome is fully translated; user content is not. Locale is a **device preference** in `mgmt:settings:v1`, not a URL prefix and not a MySQL column.

Flow: `LanguageSwitcher` → `useSettings.locale` → `plugins/i18n-locale.client.ts` → `setLocale` + Day.js pack + `document.documentElement.lang`. Details: [`i18n.md`](./i18n.md).

---

## Pre-task alerts & live "now" indicator

**`useNow`** (`composables/useNow.ts`) — shared reactive Dayjs via `useState`, ticks every 30s, force-refreshes on `visibilitychange`.

**Now-line.** `CalendarDaily` draws a horizontal line (+ `HH:mm` gutter badge) when the viewed day is today. `CalendarWeekly` shows a `Now HH:mm` pill on today's column header.

**Pre-task alerts.** `useNotifications` fires once per `${taskId}:${blockId}` at `block.start - settings.notificationLeadMinutes` (default 5):

- **In-app toast** — `useToasts.pushToast` with an **Open** action that calls `useUiOverlays.requestFocusTask(taskId)` and navigates to **`/tasks`** if needed. The tasks page watches `focusTaskId` and opens `TaskModal`.
- **Desktop pop-up** — `new Notification(...)` when permission is granted (upgrade; toast still fires).

`scheduleAll` runs on tasks/settings change and every 15 min via `plugins/notifications.client.ts`. If the lead window already elapsed but the block hasn't started, the alert fires immediately on the next pass.
