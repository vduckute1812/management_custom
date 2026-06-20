# Architecture

How the app is wired end-to-end. Pairs with [`database.md`](./database.md), [`api.md`](./api.md), and [`auth.md`](./auth.md).

---

## Tech Stack

| Layer    | Technology                  | Purpose                                                |
| -------- | --------------------------- | ------------------------------------------------------ |
| Frontend | Nuxt 3 / Vue 3              | Reactive UI, routing, SSR-optional rendering           |
| Styling  | TailwindCSS v4              | Utility-first layout and theming                       |
| Backend  | Nitro (bundled with Nuxt 3) | Server-side API routes                                 |
| Storage  | MySQL 8 (`mysql2` driver)   | Persistence — local `rc` database on `localhost:3306`  |
| Time     | Day.js                      | Date parsing, formatting, diffing                      |
| Charts   | Chart.js                    | Velocity and trend visualizations                      |
| Calendar | FullCalendar *(optional)*   | For future drag-to-reschedule polish                   |

## Project facts

| Property     | Value                                                                |
| ------------ | -------------------------------------------------------------------- |
| Project Path | `~/Projects/management`                                              |
| Runtime      | Node.js ≥ 18                                                         |
| Framework    | Nuxt 3 (Vue 3)                                                       |
| Styling      | TailwindCSS v4                                                       |
| Storage      | MySQL 8 — database `rc` on `localhost:3306` (override via env vars)  |
| External DBs | None (MySQL is local-only)                                           |
| Telemetry    | None                                                                 |

---

## Runtime topology

The app runs entirely locally. The Nuxt frontend communicates with Nitro server routes, which talk to a local MySQL instance through a pooled `mysql2` connection.

```
Browser (Vue 3)
    │
    ▼
Nuxt 3 / Nitro API Routes (/server/api/...)
    │
    ▼
server/utils/db.ts  ←→  MySQL 8 (`rc` @ localhost:3306)
    │
    └── tables: users, auth_refresh_tokens, auth_email_verifications,
                epics, tasks, time_blocks, checklist_items, active_timer
```

- **Connection pool.** `mysql2/promise` pool, created lazily on the first call to `getPool()` and reused for the server's lifetime. Pool size defaults to 10 (override with `DB_CONNECTION_LIMIT`).
- **Schema ownership.** The schema is owned by versioned SQL migration files in `server/db/migrations/` and applied by `npm run migrate`. A Nitro server plugin (`server/plugins/db-verify.ts`) calls `verifyMigrationsApplied()` on boot and **aborts the process** if any migration is pending or has drifted — the app and the schema can never get out of step silently. See [`database.md`](./database.md#migration-system) for the full migration workflow.
- **Transactions.** Any operation that touches more than one table (epic delete with task orphaning, task upsert with its blocks + checklist, timer start that finalizes a prior task) runs inside a single `BEGIN ... COMMIT` block so callers never observe a half-applied state.
- **Honest math.** Aggregate fields like `epic.spentHours`, `epic.progress`, `task.spentHours`, and `task.checklistProgress` are still **computed on read** in `db.ts`'s pure helpers, never written to disk. Eliminates an entire class of "the sidebar says 5h but the modal says 6h" bugs.

---

## Project Structure

```
~/Projects/management/
├── server/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── signup.post.ts       # POST   /api/auth/signup
│   │   │   ├── login.post.ts        # POST   /api/auth/login
│   │   │   ├── refresh.post.ts      # POST   /api/auth/refresh
│   │   │   ├── logout.post.ts       # POST   /api/auth/logout
│   │   │   ├── verify-email.post.ts # POST   /api/auth/verify-email
│   │   │   └── me.get.ts            # GET    /api/auth/me
│   │   ├── admin/
│   │   │   ├── users.get.ts         # GET    /api/admin/users         (admin)
│   │   │   ├── stats.get.ts         # GET    /api/admin/stats?days=…  (admin)
│   │   │   └── users/[id]/role.post.ts  # POST  /api/admin/users/:id/role (admin)
│   │   ├── epics/                   # all routes scoped by authenticated user
│   │   ├── tasks/
│   │   └── timer/
│   ├── middleware/
│   │   └── auth.ts                 # Hydrates event.context.user from Bearer JWT
│   ├── plugins/
│   │   └── db-verify.ts            # Refuses boot if a migration is pending
│   └── utils/
│       ├── db.ts                   # mysql2 pool + per-user CRUD + admin rollups
│       ├── auth.ts                 # JWT / bcrypt / opaque-token helpers
│       ├── authContext.ts          # requireUser / requireAdmin H3 helpers
│       └── mailer.ts               # SMTP wrapper with console fallback
├── scripts/
│   ├── migrate-auth.ts             # Seed initial admin (one-shot, idempotent)
│   └── check-db.ts                 # `npm run check:db` diagnostic
├── components/
│   ├── EpicModal.vue
│   ├── EpicCard.vue
│   ├── TaskModal.vue
│   ├── TimeBlockEditor.vue
│   ├── CalendarDaily.vue
│   ├── CalendarWeekly.vue
│   ├── CalendarMonthly.vue
│   └── AnalyticsDashboard.vue
├── pages/
│   ├── index.vue                   # Dashboard
│   ├── login.vue
│   ├── signup.vue
│   ├── verify-email.vue
│   ├── admin/
│   │   └── index.vue               # Admin charts + per-user table
│   ├── epics/
│   │   ├── index.vue
│   │   └── [id].vue
│   ├── analytics.vue
│   └── settings.vue
├── composables/
│   ├── useAuth.ts                  # Login / signup / refresh / token storage
│   ├── useApi.ts                   # Bearer-injecting $fetch wrapper with auto-refresh
│   ├── useEpics.ts
│   ├── useTasks.ts
│   ├── useTimer.ts
│   ├── useRecurrence.ts
│   ├── useNotifications.ts         # Pre-task alerts (in-app toast + optional desktop push)
│   ├── useNow.ts                   # Shared reactive "current time" ticking every 30s
│   └── useSettings.ts
├── middleware/
│   └── auth.global.ts              # Redirects unauth users to /login; /admin → admin only
├── layouts/
│   └── default.vue                 # Sidebar + user chip + admin nav
├── plugins/
│   ├── auth.client.ts              # Hydrates auth state on app boot, refreshes if needed
│   ├── theme.client.ts             # Mirrors theme + density onto <html>
│   └── notifications.client.ts     # Schedules block reminders; rolls over every 15 min
├── assets/css/main.css             # Tailwind + design tokens + dark/density layers
├── types/task.ts                   # Shared TS interfaces (includes AuthUser, AdminUserSummary)
├── implement/                      # Technical documentation (you are here)
├── .env.example                    # Connection + auth + SMTP settings template
└── nuxt.config.ts
```

## Pre-task alerts & live "now" indicator

Two cross-cutting UI threads share infrastructure for being "always current":

**`useNow`** (`composables/useNow.ts`) — a singleton reactive `Dayjs` ref shared
via Nuxt's `useState`. A 30-second interval drives ticks, started lazily on
first consumer mount and torn down when the last unmounts. `visibilitychange`
forces a tick on focus so the value snaps forward after the user comes back
from a long break instead of waiting up to 30 s for the next interval.

**Now-line.** `CalendarDaily` reads `useNow().now` and renders a single absolute-
positioned horizontal line at `(minutes_since_midnight / 60) * hourHeightPx`,
shown only when the displayed date matches today. A small `bg-rose-600` badge
to the left of the gutter prints the current `HH:mm` so the line is readable
even when stacked next to an event. `CalendarWeekly` (no time axis) shows the
same "Now HH:mm" pill in today's column header.

**Pre-task alerts.** `useNotifications` schedules a single fire per
`${taskId}:${blockId}` key at `block.start - settings.notificationLeadMinutes`
(default 5). Two channels fire on the same trigger, deduped by that key:

- **In-app toast** — `useToasts.pushToast` with an "Open" action that sets
  `useUiOverlays.requestFocusTask(taskId)` and routes to `/`. The dashboard
  page watches `focusTaskId` and pops the task modal. No browser permission
  needed; always works.
- **Desktop pop-up** — `new Notification(...)` when permission is granted.
  Strictly an upgrade; the toast still fires either way.

`scheduleAll` runs on tasks/settings change and also rolls over every 15 min
in `plugins/notifications.client.ts` to pick up blocks that have just entered
the 24-hour `setTimeout` horizon. If the lead window has already elapsed but
the block hasn't started yet (e.g. you opened the app 2 min before a 5-min
lead), the alert fires immediately rather than being skipped.
