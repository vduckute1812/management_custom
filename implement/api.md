# API Reference

All routes are handled by Nitro under `/server/api/`.

**Auth rules (summary):**

- **Public (no Bearer):** `POST /api/auth/{signup,login,refresh,verify-email}`.
- **Optional auth:** some **GET** feed/media routes use `getOptionalUser` so anonymous clients can read **public** posts / signed media when allowed; with a Bearer token the viewer also sees private/shared content they own or were granted.
- **Authenticated:** everything else requires `Authorization: Bearer <accessToken>` (`401` without it). Time-management CRUD is always scoped to the caller.
- **Admin:** `role >= 1` (`403` otherwise). **Superadmin-only:** `DELETE /api/admin/users/:id`.

See [`auth.md`](./auth.md) for the token model and client route guard; see [`database.md`](./database.md) for the underlying field types.

## Enum encoding

Every enum-shaped field on this API is a small integer end-to-end (TS code, JSON wire format, MySQL `TINYINT UNSIGNED`). The mapping mirrors `~/types/task.ts`:

| Field             | 0       | 1            | 2            |
| ----------------- | ------- | ------------ | ------------ |
| `status`          | `Todo`  | `InProgress` | `Done`       |
| `priority`        | `Low`   | `Normal`     | `High`       |
| `recurrence.rule` | `Daily` | `Weekly`     | `Monthly`    |
| `role`            | `Normal`| `Admin`      | `Superadmin` |

Request bodies that include these fields must send them as numbers; the server rejects string values with `400`. See [`database.md`](./database.md#integer-enums-end-to-end) for the rationale.

---

## Auth

| Method | Endpoint                  | Description                                                                 |
| ------ | ------------------------- | --------------------------------------------------------------------------- |
| `POST` | `/api/auth/signup`        | Body `{ email, password, name? }`. Creates a `normal` user, sends email-verification link. |
| `POST` | `/api/auth/login`         | Body `{ email, password }`. Requires verified email. Returns `{ user, accessToken, accessExpiresAt, refreshToken, refreshExpiresAt }`. |
| `POST` | `/api/auth/refresh`       | Body `{ refreshToken }`. Rotates: returns a new pair, revokes the presented refresh token. |
| `POST` | `/api/auth/logout`        | Body `{ refreshToken?, everywhere? }`. Revokes the supplied refresh token; `everywhere: true` revokes all of the caller's refresh tokens. |
| `POST` | `/api/auth/verify-email`  | Body `{ token }`. Consumes a one-shot verification link.                    |
| `GET`  | `/api/auth/me`            | Returns the current user as the server knows them.                          |

**Token model.** Access tokens are 15-minute HS256 JWTs carrying `{ sub, email, role }`, where `role` is the same `0` / `1` / `2` integer that lives in MySQL — no string translation at any layer. Refresh tokens are 30-day opaque base64url strings stored only as SHA-256 hashes; logout revokes them and refresh rotates them.

---

## Admin (role ≥ 1)

| Method | Endpoint                          | Description                                                              |
| ------ | --------------------------------- | ------------------------------------------------------------------------ |
| `GET`  | `/api/admin/users`                | Per-user summary: counts of tasks/epics, hours logged, last activity.    |
| `GET`  | `/api/admin/stats?days=30`        | System-wide totals + daily-hours series + status mix, for dashboard charts. |
| `POST` | `/api/admin/users/:id/role`       | Body `{ role: 0 \| 1 }` (`Normal` or `Admin`). Refuses to demote the last admin-or-superadmin, refuses to target a `superadmin` user (`403`), and refuses `role: 2` outright (`400`) — `superadmin` is bootstrap-only. |
| `DELETE` | `/api/admin/users/:id`          | **Superadmin only.** Permanently deletes the user and cascaded data.     |

---

## Categories

| Method | Endpoint              | Description                                      |
| ------ | --------------------- | ------------------------------------------------ |
| `GET`  | `/api/categories`     | Lists seeded post categories (`requireUser`).    |

---

## Posts / feed

Visibility: `public` \| `private` \| `shared` (+ `post_audience` for shared). Guests see public posts only.

| Method   | Endpoint                              | Auth        | Description |
| -------- | ------------------------------------- | ----------- | ----------- |
| `GET`    | `/api/posts`                          | Optional    | Paginated feed for the viewer (or public-only when anonymous). |
| `POST`   | `/api/posts`                          | Required    | Create a post (body, visibility, category, style, attachments). |
| `DELETE` | `/api/posts/:id`                      | Required    | Delete own post. |
| `GET`    | `/api/posts/:id/comments`             | Optional    | List comments when the post is visible to the viewer. |
| `POST`   | `/api/posts/:id/comments`             | Required    | Add a comment. |
| `DELETE` | `/api/posts/:id/comments/:commentId`  | Required    | Delete own comment (or post owner). |
| `POST`   | `/api/posts/:id/reactions`            | Required    | Set reaction (`like` / `love` / …). |
| `DELETE` | `/api/posts/:id/reactions`            | Required    | Clear reaction. |
| `POST`   | `/api/posts/:id/like`                 | Required    | Legacy like helper (maps onto reactions). |
| `POST`   | `/api/posts/:id/share`                | Required    | Share a post into the caller's feed. |

DTOs: `~/types/post.ts`. Domain: `server/db/posts.ts`.

---

## Stories

24-hour ephemeral stories with views / reactions / owner insights.

| Method   | Endpoint                              | Auth     | Description |
| -------- | ------------------------------------- | -------- | ----------- |
| `GET`    | `/api/stories`                        | Required | Active stories tray for the install. |
| `POST`   | `/api/stories`                        | Required | Create a story (text and/or media). |
| `DELETE` | `/api/stories/:id`                    | Required | Delete own story. |
| `POST`   | `/api/stories/:id/view`               | Required | Record a view. |
| `POST`   | `/api/stories/:id/reactions`          | Required | Set reaction. |
| `DELETE` | `/api/stories/:id/reactions`          | Required | Clear reaction. |
| `GET`    | `/api/stories/:id/insights`           | Required | Owner-only viewers + reactions rollup. |

DTOs: `~/types/story.ts`. Domain: `server/db/stories.ts`.

---

## Uploads (R2)

Requires `R2_*` env configuration. Files are stored in Cloudflare R2; the API returns ids / signed URLs — not raw bytes inline.

| Method | Endpoint              | Auth     | Description |
| ------ | --------------------- | -------- | ----------- |
| `POST` | `/api/uploads`        | Required | Upload a file; returns upload metadata. |
| `GET`  | `/api/uploads/:id`    | Optional | Redirect/signed URL when the caller may access the object. |

---

## Users directory

| Method | Endpoint                 | Auth     | Description |
| ------ | ------------------------ | -------- | ----------- |
| `GET`  | `/api/users/directory`   | Required | Searchable people list for “share with specific people”. |

---

## Epics (scoped to authenticated user)

| Method   | Endpoint         | Description                                                |
| -------- | ---------------- | ---------------------------------------------------------- |
| `GET`    | `/api/epics`     | Returns the caller's Epics with derived hours, progress, taskCount. |
| `POST`   | `/api/epics`     | Creates or updates one of the caller's Epics. Attempting to POST a body with an `id` owned by someone else returns `404`. |
| `DELETE` | `/api/epics/:id` | Removes one of the caller's Epics. Cross-user ids `404`. Child tasks have `epicId` cleared. |

---

## Tasks (scoped to authenticated user)

| Method   | Endpoint         | Description                                                |
| -------- | ---------------- | ---------------------------------------------------------- |
| `GET`    | `/api/tasks`     | Returns the caller's tasks with `spentHours` derived from blocks. |
| `POST`   | `/api/tasks`     | Creates or updates one of the caller's tasks (including its `timeBlocks`). Cross-user ids `404`. Cross-user `epicId` is `400`. |
| `DELETE` | `/api/tasks/:id` | Removes one of the caller's tasks. Cross-user ids `404`.   |

---

## Timer (per user)

Each user has their own independent timer row keyed by `user_id`. Two users can run timers concurrently.

| Method | Endpoint            | Description                                                                                          |
| ------ | ------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/timer`        | Returns `{ activeTimer: { taskId, startedAt } \| null }` for the caller only.                        |
| `POST` | `/api/timer/start`  | Body `{ taskId }`. Auto-finalizes the caller's prior running timer as a block. Cross-user `taskId` is `404`. |
| `POST` | `/api/timer/stop`   | Finalizes the caller's active timer into a new `TimeBlock` on its task. Sessions < 30 s are discarded. |

---

## Endpoint details

**`GET /api/epics`** — Returns all Epics. Each Epic in the response includes computed fields injected by `db.ts`:
- `estimatedHours` — sum of `estimatedHours` across child tasks
- `spentHours` — sum of all `timeBlocks[].spentHours` across child tasks
- `progress` — weighted by `estimatedHours` (falls back to simple average)
- `taskCount` — number of child tasks

**`DELETE /api/epics/:id`** — Removes the Epic record only. Child tasks are **not** deleted; their `epicId` field is cleared. Response includes `orphanedTasks: number`.

**`GET /api/tasks`** — Returns all tasks. Each task includes a computed `spentHours` field summed from its `timeBlocks`.

**`POST /api/tasks`** — Accepts a full task object including the `timeBlocks` array. If `id` matches an existing record it replaces it; otherwise appends new. Blocks are sorted by `start` on save.

**`DELETE /api/tasks/:id`** — Removes the task with the given `id`. Returns `404` if not found.

**`POST /api/timer/start`** — Sets the active timer to `{ taskId, startedAt: now }`. If a *different* task already had a running timer, the elapsed interval is appended as a new `TimeBlock` on that task before the new timer starts; the response's `finalizedFor` field is the prior task's id (else `null`). Sessions < 30 s when finalized this way are dropped.

**`POST /api/timer/stop`** — Finalizes the active timer into a new `TimeBlock` on the owning task and clears `activeTimer`. Response: `{ stopped, discarded?, activeTimer: null, task, block }`. If the elapsed time is < 30 s, `discarded: true` and no block is appended (but the timer is still cleared).
