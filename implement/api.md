# API Reference

All routes are handled by Nitro under `/server/api/`.

**Auth rules (summary):**

- **Public (no session):** `POST /api/auth/{signup,login,refresh,verify-email,forgot-password,reset-password}`, `GET /api/categories`.
- **Optional auth:** some **GET** feed/media routes use `getOptionalUser` so anonymous clients can read **public** posts / signed media when allowed; with a Bearer token or HttpOnly access cookie the viewer also sees private/shared content they own or were granted.
- **Authenticated:** everything else requires a valid access JWT via `Authorization: Bearer …` or the `mgmt_at` cookie (`401` without it). Time-management CRUD is always scoped to the caller.
- **Admin:** `role >= 1` (`403` otherwise). **Superadmin-only:** `DELETE /api/admin/users/:id`.
- **Rate limited:** all `/api/*` routes are throttled per client IP (see [Rate limiting](#rate-limiting) below).

See [`auth.md`](./auth.md) for the token model and client route guard; see [`database.md`](./database.md) for the underlying field types.

## Rate limiting

`server/middleware/rate-limit.ts` applies a sliding-window cap on every `/api/*` request. Limits are keyed by client IP (from `X-Forwarded-For` / `X-Real-IP` when present).

| Scope                            | Limit        | Window |
| -------------------------------- | ------------ | ------ |
| Global (all other `/api/*`)      | 120 requests | 60 s   |
| `POST /api/auth/login`           | 10           | 60 s   |
| `POST /api/auth/signup`          | 5            | 60 s   |
| `POST /api/auth/refresh`         | 30           | 60 s   |
| `POST /api/auth/forgot-password` | 5            | 60 s   |
| `POST /api/auth/reset-password`  | 10           | 60 s   |
| `/api/uploads` (any method)      | 30           | 60 s   |

When exceeded, the server responds with **`429 Too Many Requests`**, a `Retry-After` header (seconds), and `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset` headers.

On the client, `useApi().apiFetch` additionally coalesces identical in-flight requests and enforces a **400 ms** minimum gap between repeated calls with the same method + URL — this reduces accidental double-submit spam but does not replace the server cap.

Implementation: `server/utils/rateLimit.ts` (in-memory store; swap for Redis when running multiple Nitro workers).

## Enum encoding

Every enum-shaped field on this API is a small integer end-to-end (TS code, JSON wire format, MySQL `TINYINT UNSIGNED`). The mapping mirrors `~/types/task.ts`:

| Field             | 0        | 1            | 2            |
| ----------------- | -------- | ------------ | ------------ |
| `status`          | `Todo`   | `InProgress` | `Done`       |
| `priority`        | `Low`    | `Normal`     | `High`       |
| `recurrence.rule` | `Daily`  | `Weekly`     | `Monthly`    |
| `role`            | `Normal` | `Admin`      | `Superadmin` |

Request bodies that include these fields must send them as numbers; the server rejects string values with `400`. Handlers wired through `server/schemas` + `parseBody` enforce this explicitly for tasks/epics/timer/login; remaining routes are migrating to the same pattern. See [`database.md`](./database.md#integer-enums-end-to-end) for the rationale.

---

## Request validation

Shared Zod schemas live in `server/schemas/index.ts`. Handlers should use:

- `parseBody(event, schema)` — validates JSON body, `400` on failure
- `parseQuery(event, schema)` — validates query string, `400` on failure

Service-layer business failures throw `DomainError(statusCode, message)`; route handlers catch with `mapDomainError(err)`.

**Feed list query** (`GET /api/posts`): `limit` (1–50, default 20), optional `cursor`, `categoryId`, `locale`.

Details: [`architecture.md`](./architecture.md#request-validation--services).

---

## Auth

| Method  | Endpoint                    | Description                                                                                                                                                                                                                                                                                                                                                   |
| ------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`  | `/api/auth/signup`          | Body `{ email, password, name? }`. Creates a `normal` user and **enqueues** an email-verification job (`email.verification`). User + verification row are inserted in one transaction.                                                                                                                                                                        |
| `POST`  | `/api/auth/login`           | Body `{ email, password }`. Requires verified email. Returns `{ user, accessToken, accessExpiresAt, refreshExpiresAt }` and sets HttpOnly cookies `mgmt_rt` / `mgmt_at`.                                                                                                                                                                                      |
| `POST`  | `/api/auth/refresh`         | Cookie `mgmt_rt` (preferred) or body `{ refreshToken }` (legacy). Atomically rotates refresh; returns a new access token + sets cookies.                                                                                                                                                                                                                      |
| `POST`  | `/api/auth/logout`          | Cookie / body refresh + optional `everywhere`. Revokes token(s) and clears auth cookies.                                                                                                                                                                                                                                                                      |
| `POST`  | `/api/auth/verify-email`    | Body `{ token }`. Consumes a one-shot verification link.                                                                                                                                                                                                                                                                                                      |
| `POST`  | `/api/auth/forgot-password` | Body `{ email }`. Sends a one-shot password-reset link when the account exists and email is verified. Always returns `{ ok: true }` (no account enumeration).                                                                                                                                                                                                 |
| `POST`  | `/api/auth/reset-password`  | Body `{ token, password }`. Consumes a reset link, updates `password_hash`, revokes all refresh sessions. Returns `{ ok: true }`. User must sign in manually.                                                                                                                                                                                                 |
| `GET`   | `/api/auth/me`              | Returns the current user as the server knows them (`{ user: AuthUser }`).                                                                                                                                                                                                                                                                                     |
| `PATCH` | `/api/auth/profile`         | Body `{ name?, avatarUploadId?, title?, job?, location? }`. Empty string / `null` clears a field. Text fields max 120 chars. `avatarUploadId` must be an **image** upload owned by the caller (from `POST /api/uploads`). Reply: `{ user: AuthUser }` — `avatarUrl` is `/api/uploads/{id}` when set. Role, email, and verification are **not** editable here. |

**Token model.** Access tokens are 15-minute HS256 JWTs carrying `{ sub, email, role }`, where `role` is the same `0` / `1` / `2` integer that lives in MySQL — no string translation at any layer. Refresh tokens are 30-day opaque base64url strings stored only as SHA-256 hashes; they live in the HttpOnly `mgmt_rt` cookie (not localStorage). Logout revokes them; refresh rotates them inside one DB transaction.

---

## Admin (role ≥ 1)

| Method   | Endpoint                    | Description                                                                                                                                                                                                            |
| -------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/admin/users`          | Per-user summary: counts of tasks/epics, hours logged, last activity.                                                                                                                                                  |
| `GET`    | `/api/admin/stats?days=30`  | System-wide totals + daily-hours series + status mix, for dashboard charts.                                                                                                                                            |
| `GET`    | `/api/admin/queue`          | Cache driver + job-queue depth snapshot (`pending` / `processing` / `completed` / `dead`). See [`cache-queue.md`](./cache-queue.md).                                                                                   |
| `POST`   | `/api/admin/users/:id/role` | Body `{ role: 0 \| 1 }` (`Normal` or `Admin`). Refuses to demote the last admin-or-superadmin, refuses to target a `superadmin` user (`403`), and refuses `role: 2` outright (`400`) — `superadmin` is bootstrap-only. |
| `DELETE` | `/api/admin/users/:id`      | **Superadmin only.** Permanently deletes the user and cascaded data.                                                                                                                                                   |

---

## Categories

Install-wide post directories (`post_categories`). List is **public** so the hub `/` and guest feed filters work without login. Mutations are **admin**.

| Method   | Endpoint              | Auth   | Description                                                                |
| -------- | --------------------- | ------ | -------------------------------------------------------------------------- |
| `GET`    | `/api/categories`     | Public | Lists directories with `postCount` per directory.                          |
| `POST`   | `/api/categories`     | Admin  | Create directory (`name`, optional `slug` / `sortOrder`).                  |
| `PATCH`  | `/api/categories/:id` | Admin  | Rename / reorder.                                                          |
| `DELETE` | `/api/categories/:id` | Admin  | Delete directory; posts keep `category_id` cleared (`ON DELETE SET NULL`). |

Seeded slugs are localized on the client (`CATEGORY_I18N_KEYS` → `categories.*`). Domain: `server/db/categories.ts`.  
`GET` is **cached** (~60s); admin mutations bust the cache.

---

## Posts / feed

Visibility: `public` \| `private` \| `shared` (+ `post_audience` for shared). Guests see public posts only.  
Format: `update` (short) \| `manuscript` (long-form; requires `title`).  
Body: GitHub-flavored Markdown + KaTeX (`$…$` / `$$…$$`); client renders via `utils/renderPostBody.ts` (marked → KaTeX → DOMPurify). Inline images (`![alt](/api/uploads/{id})`) are inserted from the manuscript writing desk and must also be listed in `attachmentIds` for ACL.

Manuscripts may be multilingual: each locale is its own post row sharing `translationGroupId`, with `contentLocale` in `en` / `vi` / `zh-CN` / `zh-TW`. Feed prefers the viewer UI locale; cards can switch variants via `GET /api/posts/:id`.

| Method   | Endpoint                             | Auth     | Description                                                                  |
| -------- | ------------------------------------ | -------- | ---------------------------------------------------------------------------- |
| `GET`    | `/api/posts`                         | Optional | Paginated feed for the viewer (or public-only when anonymous).               |
| `POST`   | `/api/posts`                         | Required | Create a post/manuscript (body, format, title?, visibility, …).              |
| `GET`    | `/api/posts/:id`                     | Optional | Single post when visible; includes `audience` authors when `canEdit`.        |
| `PATCH`  | `/api/posts/:id`                     | Required | Update own post (body, title?, visibility, attachments, …). Format is fixed. |
| `DELETE` | `/api/posts/:id`                     | Required | Delete own post.                                                             |
| `GET`    | `/api/posts/:id/comments`            | Optional | List comments when the post is visible to the viewer.                        |
| `POST`   | `/api/posts/:id/comments`            | Required | Add a comment.                                                               |
| `DELETE` | `/api/posts/:id/comments/:commentId` | Required | Delete own comment (or post owner).                                          |
| `POST`   | `/api/posts/:id/reactions`           | Required | Set reaction (`like` / `love` / …).                                          |
| `DELETE` | `/api/posts/:id/reactions`           | Required | Clear reaction.                                                              |
| `POST`   | `/api/posts/:id/like`                | Required | Legacy like helper (maps onto reactions).                                    |
| `POST`   | `/api/posts/:id/share`               | Required | Share a post into the caller's feed.                                         |

DTOs: `~/types/post.ts`. Domain: `server/db/posts.ts`.  
Anonymous `GET /api/posts` pages are cached briefly (~20s); authenticated feeds are never cached. Public create/share/update/delete busts that cache. Details: [`cache-queue.md`](./cache-queue.md).

---

## Stories

24-hour ephemeral stories with views / reactions / owner insights.

| Method   | Endpoint                     | Auth     | Description                            |
| -------- | ---------------------------- | -------- | -------------------------------------- |
| `GET`    | `/api/stories`               | Required | Active stories tray for the install.   |
| `POST`   | `/api/stories`               | Required | Create a story (text and/or media).    |
| `DELETE` | `/api/stories/:id`           | Required | Delete own story.                      |
| `POST`   | `/api/stories/:id/view`      | Required | Record a view.                         |
| `POST`   | `/api/stories/:id/reactions` | Required | Set reaction.                          |
| `DELETE` | `/api/stories/:id/reactions` | Required | Clear reaction.                        |
| `GET`    | `/api/stories/:id/insights`  | Required | Owner-only viewers + reactions rollup. |

DTOs: `~/types/story.ts`. Domain: `server/db/stories.ts`.

---

## Uploads (R2)

Requires `R2_*` env configuration. Files are stored in Cloudflare R2; the API returns ids / signed URLs — not raw bytes inline.

| Method | Endpoint           | Auth     | Description                                                                                                                                                                                                                                                                                                                           |
| ------ | ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/uploads`     | Required | Upload a file; returns upload metadata. Rejects by extension, declared MIME, size, and magic-byte sniff (`utils/uploadPolicy.ts`, `server/utils/fileSignature.ts`). The client downscales JPEG/PNG/WebP first (`utils/compressImage.ts`, max edge 1920) via `useUploads`. Error `data.code` maps to `uploads.errors.*` on the client. |
| `GET`  | `/api/uploads/:id` | Optional | Redirect/signed URL when the caller may access the object. Same-origin requests authenticate via HttpOnly `mgmt_at` or `Authorization: Bearer`. Legacy `?access_token=` is still accepted but should not be used in new UI.                                                                                                           |

**Lifecycle / cleanup.** When media is no longer displayable, the corresponding R2 object is deleted:

- User deletes a **post** → orphaned attachments purged from MySQL + R2
- User deletes a **story** → its upload purged if unused elsewhere
- **Story expires** (24h) → purged on tray load and every ~2 min by the job worker
- User **changes or clears their avatar** → previous `avatar_upload_id` is orphan-purged when unused elsewhere
- Admin **deletes a user** → CASCADE removes DB rows; storage keys are deleted from R2 afterwards

Orphan check: an upload is kept while referenced by `post_attachments`, a **non-expired** story, `users.avatar_upload_id`, or `chat_messages.upload_id`. See `purgeOrphanedUploads` / `purgeExpiredStories` in `server/db/uploads.ts` and `server/db/stories.ts`. Profile avatars are intentionally **public** via `canViewerAccessUpload` so anonymous feed readers can load author photos. Chat media is private to conversation participants.

---

## Users directory

| Method | Endpoint               | Auth     | Description                                              |
| ------ | ---------------------- | -------- | -------------------------------------------------------- |
| `GET`  | `/api/users/directory` | Required | Searchable people list for “share with specific people” and starting a chat. Returns `id`, `name`, `email`, `avatarUrl`. |

---

## Chat (direct messages)

Signed-in 1:1 messaging. Spec: [`chat-spec.md`](./chat-spec.md). Tables: migrations `0013_chat` + `0014_chat_media`. Client page: `/chat` with ~3.5s polling while open.

| Method | Endpoint | Auth | Description |
| ------ | -------- | ---- | ----------- |
| `GET` | `/api/chat/conversations` | Required | List the caller's conversations (peer, last message, `unreadCount`, `peerLastReadAt`) plus `unreadTotal`. |
| `POST` | `/api/chat/conversations` | Required | Body `{ peerUserId }` — get-or-create the 1:1 conversation with that user (`400` if self, `404` if unknown). |
| `GET` | `/api/chat/conversations/:id/messages` | Required | Query `limit` (default 50), optional `before` / `after` (message id cursors). Returns `{ messages, hasMore, peerLastReadAt }` chronological. Media messages include `attachment` (`url`, `mime`, …). Marks read unless `after` is set (poll). Non-participants get `404`. |
| `POST` | `/api/chat/conversations/:id/messages` | Required | Body `{ kind?, body?, stickerId?, uploadId?, durationMs? }`. `kind`: `0` text, `1` emoji, `2` sticker, `3` image, `4` audio. Text/emoji need `body`. Stickers need `stickerId`. Image/audio need a prior `POST /api/uploads` `uploadId` (owned; matching kind). Audio also needs `durationMs` (200–120000). |
| `POST` | `/api/chat/conversations/:id/read` | Required | Set the caller's `last_read_at` to now. |
| `GET` | `/api/chat/unread` | Required | Lightweight inbox pulse: `{ unreadTotal, latest }` for nav badge + toast notifications. |
| `GET` | `/api/chat/catalog` | Required | Built-in `{ stickers, emoji }` lists for the picker UI. |

Message `kind` is the same integer-enum convention as the rest of the API (`ChatMessageKind` in `types/chat.ts`). The emoji picker **inserts into the composer draft** (does not auto-send); stickers, images, and voice notes send immediately after upload. Read receipts use `chat_conversation_reads`. A client plugin (`plugins/chat-inbox.client.ts`) polls unread every ~10s while signed in. Chat media requires R2 (same as feed uploads).

---

## Epics (scoped to authenticated user)

| Method   | Endpoint         | Description                                                                                                                                        |
| -------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/epics`     | Returns the caller's Epics with derived hours, progress, taskCount.                                                                                |
| `POST`   | `/api/epics`     | Creates or updates one of the caller's Epics (`epicUpsertBodySchema`). Attempting to POST a body with an `id` owned by someone else returns `404`. |
| `DELETE` | `/api/epics/:id` | Removes one of the caller's Epics. Cross-user ids `404`. Child tasks have `epicId` cleared.                                                        |

---

## Tasks (scoped to authenticated user)

| Method   | Endpoint         | Description                                                                                                                                        |
| -------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/tasks`     | Returns the caller's tasks with `spentHours` derived from blocks.                                                                                  |
| `POST`   | `/api/tasks`     | Creates or updates one of the caller's tasks (`taskUpsertBodySchema`, including `timeBlocks`). Cross-user ids `404`. Cross-user `epicId` is `400`. |
| `DELETE` | `/api/tasks/:id` | Removes one of the caller's tasks. Cross-user ids `404`.                                                                                           |

---

## Timer (per user)

Each user has their own independent timer row keyed by `user_id`. Two users can run timers concurrently.

| Method | Endpoint           | Description                                                                                                  |
| ------ | ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/api/timer`       | Returns `{ activeTimer: { taskId, startedAt } \| null }` for the caller only.                                |
| `POST` | `/api/timer/start` | Body `{ taskId }`. Auto-finalizes the caller's prior running timer as a block. Cross-user `taskId` is `404`. |
| `POST` | `/api/timer/stop`  | Finalizes the caller's active timer into a new `TimeBlock` on its task. Sessions < 30 s are discarded.       |

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

**`POST /api/timer/start`** — Sets the active timer to `{ taskId, startedAt: now }`. If a _different_ task already had a running timer, the elapsed interval is appended as a new `TimeBlock` on that task before the new timer starts; the response's `finalizedFor` field is the prior task's id (else `null`). Sessions < 30 s when finalized this way are dropped.

**`POST /api/timer/stop`** — Finalizes the active timer into a new `TimeBlock` on the owning task and clears `activeTimer`. Response: `{ stopped, discarded?, activeTimer: null, task, block }`. If the elapsed time is < 30 s, `discarded: true` and no block is appended (but the timer is still cleared).
