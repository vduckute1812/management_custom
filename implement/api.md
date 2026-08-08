# API Reference

All routes are handled by Nitro under `/server/api/`.

**Auth rules (summary):**

- **Public (no session):** `POST /api/auth/{signup,login,refresh,verify-email,forgot-password,reset-password}`, `GET /api/auth/{providers,google,google/callback}`, `GET /api/categories`, `GET /api/geo`, `GET /api/health`. Client route `/auth/continue` hydrates OAuth cookies into `useAuth`.
- **Optional auth:** some **GET** feed/media routes use `getOptionalUser` so anonymous clients can read **public** posts / signed media when allowed; with a Bearer token or HttpOnly access cookie the viewer also sees private/shared content they own or were granted. `POST /api/auth/logout` also uses optional auth — it revokes the presented refresh token (cookie/body) without requiring an access JWT; `everywhere: true` only works when an access context identifies the caller.
- **Authenticated:** everything else requires a valid access JWT via `Authorization: Bearer …` or the `mgmt_at` cookie (`401` without it). Time-management CRUD is always scoped to the caller.
- **Admin:** `role >= 1` (`403` otherwise). **Superadmin-only:** `DELETE /api/admin/users/:id`, `GET /api/admin/system`, `GET /api/admin/system/logs`.
- Cookie-based mutating `/api/*` requests that carry auth cookies enforce a same-origin `Origin`/`Referer` check and can return `403`. In production, missing Origin/Referer is also rejected.
- **Rate limited:** all `/api/*` routes are throttled per client IP (see [Rate limiting](#rate-limiting) below).

See [`auth.md`](./auth.md) for the token model and client route guard; see [`database.md`](./database.md) for the underlying field types.

## Rate limiting

`server/middleware/rate-limit.ts` applies a fixed-window cap on every `/api/*` request. Limits are keyed by client IP. Strict auth/upload paths get their own buckets; all other `/api/*` routes share `ip:global`.

**IP trust order** (see `server/rate-limit/clientIp.ts`): when the TCP peer is a **trusted proxy** (loopback, `LAN_IP`, or `TRUSTED_PROXY_IPS`) → `CF-Connecting-IP` → `X-Real-IP` → socket. Direct hits (untrusted peer) ignore forged forwarded headers and use the socket address. The first `X-Forwarded-For` hop is **not** trusted.

Credential endpoints (`login`, `signup`, `forgot-password`, `account`) also enforce a **per-email** bucket inside the handler (`assertAccountRateLimit`). A distributed stuffing run that rotates source IPs still exhausts the account budget.

| Scope                               | Limit                          | Window |
| ----------------------------------- | ------------------------------ | ------ |
| Global (all other `/api/*`)         | 120 requests                   | 60 s   |
| `POST /api/auth/login`              | 10 per IP **and** 10 per email | 60 s   |
| `POST /api/auth/signup`             | 5 per IP **and** 5 per email   | 60 s   |
| `POST /api/auth/refresh`            | 30                             | 60 s   |
| `POST /api/auth/forgot-password`    | 5 per IP **and** 5 per email   | 60 s   |
| `POST /api/auth/reset-password`     | 10                             | 60 s   |
| `DELETE /api/auth/account`          | 5 per IP **and** 5 per email   | 60 s   |
| `/api/uploads` (any method)         | 30                             | 60 s   |
| `/api/admin/articles/pending/fetch` | 2                              | 60 s   |
| `/api/admin/articles/pending/*`     | 20                             | 60 s   |

When exceeded, the server responds with **`429 Too Many Requests`**, a `Retry-After` header (seconds), and `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset` headers.

On the client, `useApi().apiFetch` coalesces identical in-flight requests (same method + URL + query) so bursts share one network call. It does **not** delay the first request. Server-side caps still apply separately.

Implementation: `server/rate-limit/` module (policies, memory store with optional Redis when `REDIS_URL` is set, check) + `server/middleware/rate-limit.ts`. Redis failures fall open to the in-memory store so a cache outage cannot take authentication with it.

## Enum encoding

Integer wire enums (TS code, JSON, MySQL `TINYINT UNSIGNED`) cover task/epic status & priority, recurrence, user role, `ReactionType`, `ChatMessageKind`, post visibility/format, upload kind, and pending-article review status. Request bodies for these fields must send numbers; the server rejects string values with `400`.

| Field             | 0        | 1                 | 2            | 3          | 4       | 5       |
| ----------------- | -------- | ----------------- | ------------ | ---------- | ------- | ------- |
| `status`          | `Todo`   | `InProgress`      | `Done`       |            |         |         |
| `priority`        | `Low`    | `Normal`          | `High`       |            |         |         |
| `recurrence.rule` | `Daily`  | `Weekly`          | `Monthly`    |            |         |         |
| `role`            | `Normal` | `Admin`           | `Superadmin` |            |         |         |
| article `status`  | `Draft`  | `PendingApproval` | `Approved`   | `Rejected` |         |         |
| `ReactionType`    | `Like`   | `Love`            | `Haha`       | `Wow`      | `Sad`   | `Angry` |
| `ChatMessageKind` | `Text`   | `Emoji`           | `Sticker`    | `Image`    | `Audio` |         |
| `PostVisibility`  | `Public` | `Private`         | `Shared`     | `Friends`  |         |         |
| `PostFormat`      | `Update` | `Manuscript`      |              |            |         |         |
| `UploadKind`      | `Image`  | `Document`        | `Audio`      |            |         |         |

Some API fields are still intentional **string tokens** because they are presentational/open tokens: `fontFamily`, `textColor`, sticker `category`. New closed domains must use integer consts — see [`database.md`](./database.md#integer-enums-end-to-end).

---

## Request validation

Shared Zod schemas live in `server/schemas/index.ts`. Handlers should use:

- `parseBody(event, schema)` — validates JSON body, `400` on failure
- `parseQuery(event, schema)` — validates query string, `400` on failure

Service-layer business failures throw `DomainError(statusCode, message)`; route handlers catch with `mapDomainError(err)`.

**Feed list query** (`GET /api/feed`, `GET /api/posts`): `limit` (1–50, default 20), optional `cursor` (ISO `createdAt` from prior `nextCursor`), `categoryId`, `locale` (`en` / `vi` / `zh-CN` / `zh-TW`; unsupported values are ignored after length validation).

Details: [`architecture.md`](./architecture.md#request-validation--services).

---

## Auth

| Method   | Endpoint                    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST`   | `/api/auth/signup`          | Body `{ email, password, name, locale? }`. `name` is required (1–120 chars). Creates a `normal` user and **enqueues** an email-verification job (`email.verification`). User + verification row are inserted in one transaction. Returns `{ user, verificationSent }` (account is **not** logged in). `verificationSent` is `false` if enqueue fails — the raw verify URL is **never** logged.                                                                                                                           |
| `POST`   | `/api/auth/login`           | Body `{ email, password }`. Requires verified email (`403` if not). Returns `{ user, accessToken, accessExpiresAt, refreshExpiresAt }` and sets HttpOnly cookies `mgmt_rt` / `mgmt_at`. Invalid credentials → `401`.                                                                                                                                                                                                                                                                                                     |
| `POST`   | `/api/auth/refresh`         | Cookie `mgmt_rt` (preferred) or body `{ refreshToken }` (legacy). Atomically rotates refresh; returns `{ user, accessToken, accessExpiresAt, refreshExpiresAt }` + sets cookies. Cross-origin cookie use → `403`.                                                                                                                                                                                                                                                                                                        |
| `POST`   | `/api/auth/logout`          | Cookie / body refresh + optional `everywhere`. Revokes token(s) and clears auth cookies. Returns `{ ok: true }`. Access JWT optional unless `everywhere: true`.                                                                                                                                                                                                                                                                                                                                                          |
| `POST`   | `/api/auth/verify-email`    | Body `{ token }`. Consumes a one-shot verification link. Returns `{ ok: true, user }`.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `POST`   | `/api/auth/forgot-password` | Body `{ email }`. Enqueues `email.passwordReset` when the account exists and email is verified. Always returns `{ ok: true }` (no account enumeration). Raw reset URL is never logged on enqueue failure.                                                                                                                                                                                                                                                                                                                |
| `POST`   | `/api/auth/reset-password`  | Body `{ token, password }`. Consumes a reset link, updates `password_hash`, revokes all refresh sessions. Returns `{ ok: true }`. User must sign in manually.                                                                                                                                                                                                                                                                                                                                                            |
| `GET`    | `/api/auth/providers`       | Public. `{ google: boolean }` — true when `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are set.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `GET`    | `/api/auth/google`          | Starts Google OAuth. Query `intent=login\|link` (default login), `redirect=/path`. Link requires a session cookie. Redirects to Google.                                                                                                                                                                                                                                                                                                                                                                                  |
| `GET`    | `/api/auth/google/callback` | Google redirect. Sets auth cookies, then login/signup flows go to `/auth/continue?redirect=…` (client hydrate). Login creates or links by email; link attaches Google to the signed-in user (emails must match).                                                                                                                                                                                                                                                                                                         |
| `GET`    | `/api/auth/identities`      | Auth required. `{ providers: number[], googleLinked, hasPassword }` — `providers` uses `AuthProvider` ints (`Google=0`).                                                                                                                                                                                                                                                                                                                                                                                                 |
| `POST`   | `/api/auth/google/unlink`   | Auth required. Removes Google link; `400` if the account has no password (would lock the user out).                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `DELETE` | `/api/auth/account`         | Auth required. Body `{ email, password? }`. Self-service hard delete of the signed-in account. `email` must match the account (case-insensitive); `password` is required when the account has a password hash, omitted for Google-only accounts. Superadmin cannot delete itself (`400`). Reuses `deleteUser` (MySQL CASCADE + R2 sweep + comment-count recount), then clears auth cookies. Reply `{ ok: true }`. Wrong password → `401`.                                                                                |
| `GET`    | `/api/auth/me`              | Returns the current user as the server knows them (`{ user: AuthUser }` including `locale` + `moneyCurrency`).                                                                                                                                                                                                                                                                                                                                                                                                           |
| `PATCH`  | `/api/auth/preferences`     | Body `{ locale?, moneyCurrency? }` (at least one). Persists account language (emails) and Money currency. Reply `{ user }`. Changing locale does not rewrite currency.                                                                                                                                                                                                                                                                                                                                                   |
| `PATCH`  | `/api/auth/profile`         | Body `{ name?, avatarUploadId?, title?, job?, location? }` — **at least one** field required (`400` if empty). Empty string / `null` clears title/job/location/avatar. `name` cannot be cleared (must be 1–120 chars when sent). Text fields max 120 chars. `avatarUploadId` must be an **image** upload owned by the caller. Previous avatar is orphan-purged when changed/cleared. Reply: `{ user: AuthUser }` — `avatarUrl` is `/api/uploads/{id}` when set. Role, email, and verification are **not** editable here. |

**Token model.** Access tokens are 15-minute HS256 JWTs carrying `{ sub, email, role }`, where `role` is the same `0` / `1` / `2` integer that lives in MySQL — no string translation at any layer. Refresh tokens are 30-day opaque base64url strings stored only as SHA-256 hashes; they live in the HttpOnly `mgmt_rt` cookie (not localStorage). Logout revokes them; refresh rotates them inside one DB transaction.

---

## Admin (role ≥ 1)

| Method   | Endpoint                                     | Description                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/admin/users`                           | Per-user summary: counts of tasks/epics, hours logged, last activity.                                                                                                                                                                                                                                                                                                                                                  |
| `GET`    | `/api/admin/stats?days=30`                   | System-wide totals + daily-hours series + status mix. Query `days` clamped `1..365`, default `30`.                                                                                                                                                                                                                                                                                                                     |
| `GET`    | `/api/admin/queue`                           | Cache driver + job-queue depth snapshot (`pending` / `processing` / `completed` / `dead`). See [`cache-queue.md`](./cache-queue.md).                                                                                                                                                                                                                                                                                   |
| `GET`    | `/api/admin/system`                          | **Superadmin only.** Live ops snapshot: process RAM/CPU, container memory/disk, DB + readiness + Redis latency, migrations, cache driver, job queue.                                                                                                                                                                                                                                                                   |
| `GET`    | `/api/admin/system/logs`                     | **Superadmin only.** Recent in-process console lines from the app container (ring buffer; not sibling containers).                                                                                                                                                                                                                                                                                                     |
| `POST`   | `/api/admin/users/:id/role`                  | Body `{ role: 0 \| 1 }` (`Normal` or `Admin`). Refuses to demote the last admin-or-superadmin, refuses to target a `superadmin` user (`400`), and refuses `role: 2` outright (`400`) — `superadmin` is bootstrap-only.                                                                                                                                                                                                 |
| `DELETE` | `/api/admin/users/:id`                       | **Superadmin only.** Permanently deletes the user and cascaded data.                                                                                                                                                                                                                                                                                                                                                   |
| `GET`    | `/api/admin/articles/pending`                | List pipeline articles. Query: `status` (int, default `1` = PendingApproval), `categoryId`, `createdFrom`/`createdTo` (`YYYY-MM-DD`), `limit` (1–100, default 50), `offset`. Returns `{ articles, total }`.                                                                                                                                                                                                            |
| `POST`   | `/api/admin/articles/pending/fetch`          | Enqueue `articles.fetch`. Body `{ force?: boolean }`. Returns `{ ok: true, enqueued: boolean, reason?: "active_fetch_exists" }`. `force` skips the “already ran today” guard only; concurrent fetch jobs are never stacked. Rate limit: 2/min.                                                                                                                                                                         |
| `GET`    | `/api/admin/articles/pending/:id`            | Full `PendingArticle` (original + rewrite fields).                                                                                                                                                                                                                                                                                                                                                                     |
| `PATCH`  | `/api/admin/articles/pending/:id`            | Edit `rewrittenTitle` / `rewrittenContent` / `excerpt` / `categoryId`. `409` if already Approved.                                                                                                                                                                                                                                                                                                                      |
| `POST`   | `/api/admin/articles/pending/:id/approve`    | Approve & publish as public `PostFormat.Manuscript` (visibility public). Optional body overrides title/body/category. Falls back to `originalTitle` / `rawContent` when rewrite is empty (Draft without LLM). Appends idempotent `**Source:** [sourceName](originalUrl)` footer via `ensureSourceAttribution`. Returns `{ ok: true, article, postId }`. `409` if already approved/rejected; `400` if title/body empty. |
| `POST`   | `/api/admin/articles/pending/:id/reject`     | Reject. Body `{ delete?: boolean }` — `true` hard-deletes the row. `409` if Approved.                                                                                                                                                                                                                                                                                                                                  |
| `POST`   | `/api/admin/articles/pending/:id/regenerate` | Re-queue `articles.rewrite`. Sets status to Draft; `503` if LLM not configured; `409` if Approved. Does not stack duplicate rewrite jobs for the same id.                                                                                                                                                                                                                                                              |

Admin UI: `/admin/articles/pending` (filters, “Fetch now” with `force: true`) and `/admin/articles/pending/:id` (original vs rewrite panels, preview, use-original, regenerate with poll, approve → `/feed`).

---

## Categories

Install-wide post directories (`post_categories`). List is **public** so the hub `/` and guest feed filters work without login. Mutations are **admin**.

| Method   | Endpoint              | Auth   | Description                                                                |
| -------- | --------------------- | ------ | -------------------------------------------------------------------------- |
| `GET`    | `/api/categories`     | Public | Lists directories with `postCount` per directory.                          |
| `POST`   | `/api/categories`     | Admin  | Create directory (`name`, optional `slug` / `sortOrder`).                  |
| `PATCH`  | `/api/categories/:id` | Admin  | Rename / reorder.                                                          |
| `DELETE` | `/api/categories/:id` | Admin  | Delete directory; posts keep `category_id` cleared (`ON DELETE SET NULL`). |

Seeded slugs are localized on the client (`CATEGORY_I18N_KEYS` → `categories.*`). Domain: `server/db/feed/categories.ts`.  
`GET` is **cached** (~60s); admin mutations bust the cache.

---

## Geo

| Method | Endpoint   | Auth   | Description                                                                                                       |
| ------ | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/geo` | Public | Returns `{ country }` from Cloudflare `CF-IPCountry`, or `null` when unavailable / unknown (`XX`, `T1`, missing). |

Used by `plugins/i18n-locale.client.ts` for first-visit locale detection. Direct LAN access typically gets `null` and falls through to timezone / browser detection.

---

## Health

| Method | Endpoint      | Auth   | Description                                                                                                                                                                                                                  |
| ------ | ------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/health` | Public | Readiness probe. `200` + `{ ok: true, db, migrations: { ok } }` when MySQL answers and migrations have no pending/drift; else `503`. Error details and pending/drift counts stay in the server log — not in the public body. |

Used by Pi deploy (`ci-deploy.sh`) after recreating the app container.

---

## Posts / feed

Visibility: `0` public \| `1` private \| `2` shared (+ `post_audience`) \| `3` friends (accepted friendships). Guests see public posts only. New user posts/shares default to Friends; admin/pipeline publish stays Public.
Format: `0` update (short) \| `1` manuscript (long-form; requires `title`).  
Body: GitHub-flavored Markdown + KaTeX (`$…$` / `$$…$$`); client renders via `utils/renderPostBody.ts` (marked → KaTeX → DOMPurify). Inline images (`![alt](/api/uploads/{id})`) are inserted from the manuscript writing desk and must also be listed in `attachmentIds` for ACL.

Manuscripts may be multilingual: each locale is its own post row sharing `translationGroupId`, with `contentLocale` in `en` / `vi` / `zh-CN` / `zh-TW`. Feed prefers the viewer UI locale; cards can switch variants via `GET /api/posts/:id`.

| Method   | Endpoint                             | Auth     | Description                                                                                                                               |
| -------- | ------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/feed`                          | Optional | Bootstrap: `{ categories, posts, nextCursor, stories }` (`stories` is `null` for anonymous).                                              |
| `GET`    | `/api/posts`                         | Optional | Paginated feed `{ posts, nextCursor }` (public-only when anonymous).                                                                      |
| `POST`   | `/api/posts`                         | Required | Create a post/manuscript. Body below.                                                                                                     |
| `GET`    | `/api/posts/:id`                     | Optional | `{ post, audience }` — `audience` author cards only when viewer can edit a shared post; else `[]`.                                        |
| `PATCH`  | `/api/posts/:id`                     | Required | Update own post. Format / translation fields stay fixed. Body below.                                                                      |
| `DELETE` | `/api/posts/:id`                     | Required | Delete own post.                                                                                                                          |
| `GET`    | `/api/posts/:id/comments`            | Optional | Newest page first (`limit` 1–50 default 30, optional `before` ISO cursor). Returns `{ comments, hasMore, nextBefore }` chronological ASC. |
| `POST`   | `/api/posts/:id/comments`            | Required | Body `{ body }` (max 2000). Returns `{ comment }`.                                                                                        |
| `DELETE` | `/api/posts/:id/comments/:commentId` | Required | Delete **own** comment only.                                                                                                              |
| `POST`   | `/api/posts/:id/reactions`           | Required | Set reaction (`ReactionType` int). Returns `{ post, myReaction, reactions, reactionCount }`.                                              |
| `DELETE` | `/api/posts/:id/reactions`           | Required | Clear reaction. Same response shape; `myReaction` is `null`.                                                                              |
| `POST`   | `/api/posts/:id/share`               | Required | Body `{ body?, visibility?, audienceUserIds? }`. `body` defaults to `"Shared a post"` (max 5000). Returns `{ post }`.                     |

**`POST /api/posts` body:** `{ body, title?, format?, visibility?, audienceUserIds?, attachmentIds?, categoryId?, fontFamily?, textColor?, contentLocale?, translationGroupId? }`. `format` is `PostFormat` (`0` update default, `1` manuscript); `visibility` is `PostVisibility` (`0` public, `1` private, `2` shared, `3` friends — **default Friends**). Updates max 5,000 chars; manuscripts max 100,000 and require `title` (max 160). Shared visibility needs at least one non-self audience user. Attachments max 10 (owned uploads). Returns `{ post }`. Duplicate translation locale → `409`; translation group ownership mismatch → `403`.

**`PATCH /api/posts/:id` body:** send the full editable state (`body` required; `title`, numeric `visibility` defaulting to Friends=`3` if omitted, `audienceUserIds`, `attachmentIds`, `categoryId`, `fontFamily`, `textColor`). Does **not** accept `format`, `contentLocale`, or `translationGroupId`.

DTOs: `~/types/post.ts` (`FeedBootstrap`, `FeedPage`, `Post`, …). Domain: `server/db/feed/posts.ts` (mutations), `postQueries.ts` (reads), `postReactions.ts`, `postComments.ts`.  
`GET /api/feed` is the Feed page first-paint call. Later pages / infinite scroll use `GET /api/posts?cursor=…`. Anonymous public post pages are cached briefly (~20s); authenticated feeds are never cached. Public create/share/update/delete busts that cache. Details: [`cache-queue.md`](./cache-queue.md).

---

## Friends

Facebook-style request → accept graph. Status: `Pending=0` \| `Accepted=1`. Friends-visibility posts require an Accepted row with the author.

| Method   | Endpoint                      | Auth     | Description                                                                                          |
| -------- | ----------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/friends`                | Required | Compact overview `{ friends, incoming, outgoing }` — each item is a `FriendshipRow`.                 |
| `GET`    | `/api/friends/accepted`       | Required | Cursor-paged Accepted friends (`friendshipPageQuerySchema`).                                         |
| `GET`    | `/api/friends/incoming`       | Required | Cursor-paged pending requests addressed to you.                                                      |
| `GET`    | `/api/friends/outgoing`       | Required | Cursor-paged pending requests you sent.                                                              |
| `GET`    | `/api/friends/incoming-count` | Required | Badge helper `{ count }` of pending incoming requests.                                               |
| `POST`   | `/api/friends`                | Required | Body `{ userId }`. Sends a request (or auto-accepts a reciprocal pending). Returns `{ friendship }`. |
| `POST`   | `/api/friends/:id/accept`     | Required | Addressee accepts a pending request. Returns `{ friendship }`.                                       |
| `DELETE` | `/api/friends/:id`            | Required | Cancel / decline / unfriend. Returns `{ ok: true }`.                                                 |

DTO: `~/types/friendship.ts`. Domain: `server/db/friends/`. UI: `/friends`. Spec: [`friends-spec.md`](./friends-spec.md).

---

## Stories

24-hour ephemeral stories with views / reactions / owner insights.
**Visibility:** own stories + Accepted friends only (same friendship graph as Friends posts). Story media uploads follow the same ACL.

| Method   | Endpoint                     | Auth     | Description                                                                                                                  |
| -------- | ---------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/stories`               | Required | Active stories tray `{ groups }` (expired rows filtered in SQL; physical purge runs in the job worker).                      |
| `POST`   | `/api/stories`               | Required | Body `{ body?, uploadId? }` — at least one required. `body` max 500; `uploadId` must be an owned image. Returns `{ story }`. |
| `DELETE` | `/api/stories/:id`           | Required | Delete own story.                                                                                                            |
| `POST`   | `/api/stories/:id/view`      | Required | Record a view. Returns `{ ok: true }`.                                                                                       |
| `POST`   | `/api/stories/:id/reactions` | Required | Set reaction (`ReactionType` int). Returns `{ story, myReaction, reactions, reactionCount }`.                                |
| `DELETE` | `/api/stories/:id/reactions` | Required | Clear reaction. Same response shape.                                                                                         |
| `GET`    | `/api/stories/:id/insights`  | Required | Owner-only viewers + reactions rollup (`{ insights }`).                                                                      |

DTOs: `~/types/story.ts`. Domain: `server/db/feed/stories.ts`.

---

## Uploads (R2)

Requires `R2_*` env configuration. Files are stored in Cloudflare R2; the API returns ids / signed URLs — not raw bytes inline.

**Object key layout.** New uploads use `uploads/{folder}/{yyyy}/{mm}/{id}_{fileName}` where `uploads.kind` is numeric `UploadKind` (`0` image / `1` document / `2` audio) and `UPLOAD_KIND_STORAGE_FOLDER` maps it to folder names (`image` / `document` / `audio`). Older objects may still use the legacy `uploads/{yyyy}/{mm}/…` prefix; the DB `storage_key` is authoritative either way.

| Method | Endpoint           | Auth     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------ | ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST` | `/api/uploads`     | Required | Multipart form field `file`. Returns `{ upload: { id, fileName, mime, kind, sizeBytes, url } }`, where `kind` is numeric `UploadKind`. Rejects by extension, declared MIME, size, and magic-byte sniff (`utils/uploadPolicy.ts`, `server/utils/fileSignature.ts`). Client downscales JPEG/PNG/WebP first (`utils/compressImage.ts`, max edge 1920) via `useUploads`. Error `data.code`: `empty`, `unsupportedType`, `tooLarge`, `nameTooLong`, `contentMismatch`. Oversized multipart → `413`; missing R2 → `503`. |
| `GET`  | `/api/uploads/:id` | Optional | Default `302` to a signed R2 URL. `?redirect=0` / `?redirect=false` streams bytes through the API (`Content-Disposition: inline`). Same-origin auth via HttpOnly `mgmt_at` or `Authorization: Bearer`. `503` when R2 is unavailable.                                                                                                                                                                                                                                                                               |

**Allowed types / size caps:** JPEG/PNG/WebP 3MB; GIF 8MB; PDF/DOCX 10MB; TXT/Markdown 512KB; WebM/Ogg/M4A/MP4/MP3 audio 5MB.

**Lifecycle / cleanup.** When media is no longer displayable, the corresponding R2 object is deleted:

- User deletes a **post** → orphaned attachments purged from MySQL + R2
- User deletes a **story** → its upload purged if unused elsewhere
- **Story expires** (24h) → filtered out by reads; physical DB/R2 purge runs in the job worker (~2 min)
- User **changes or clears their avatar** → previous `avatar_upload_id` is orphan-purged when unused elsewhere
- Admin **deletes a user** → CASCADE removes DB rows; storage keys are deleted from R2 afterwards

Orphan check: an upload is kept while referenced by `post_attachments`, a **non-expired** story, `users.avatar_upload_id`, or `chat_messages.upload_id`. See `purgeOrphanedUploads` / `purgeExpiredStories` in `server/db/feed/uploads.ts` and `server/db/feed/stories.ts`. Profile avatars are intentionally **public** via `canViewerAccessUpload` so anonymous feed readers can load author photos. Chat media is private to conversation participants.

---

## Users directory

| Method | Endpoint               | Auth     | Description                                                                                                                                                                       |
| ------ | ---------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/users/directory` | Required | Query `q` (required, length 1–100), `limit` (1–20, default 20). Searches names only. Returns `{ users }` each `{ id, name, email, avatarUrl }`, with `email` intentionally blank. |

---

## Chat (direct messages)

Signed-in 1:1 messaging between Accepted friends only. Spec: [`chat-spec.md`](./chat-spec.md). Tables: migrations `0013_chat` + `0014_chat_media` + `0015_chat_unread_counters` + `0017_chat_message_reactions` (+ `0018_reaction_int_enums` aligns post/story reactions to the same `TINYINT` `ReactionType`). Client page: `/chat` uses SSE for the open thread (`…/stream`) with a slow REST fallback if the stream drops. Thread history uses cursor paging (`before` / `after`); the UI scroll-loads older pages at the top.

| Method   | Endpoint                                                    | Auth     | Description                                                                                                                                                                                                                                                                                                                                                                                           |
| -------- | ----------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/chat/conversations`                                   | Required | List the caller's conversations (peer, last message, `unreadCount`, `peerLastReadAt`) plus `unreadTotal`.                                                                                                                                                                                                                                                                                             |
| `POST`   | `/api/chat/conversations`                                   | Required | Body `{ peerUserId }` — get-or-create the 1:1 conversation with an Accepted friend (`400` if self, `403` if not friends, `404` if unknown).                                                                                                                                                                                                                                                           |
| `GET`    | `/api/chat/conversations/:id/messages`                      | Required | Query `limit` (1–100, default 50), optional `before` / `after` (message id cursors; ISO timestamp fallback accepted). Returns `{ messages, hasMore, peerLastReadAt }` chronological. `hasMore` is forced `false` when `after` is used. Each message includes `reactions` / `reactionCount` / `myReaction`; media includes `attachment`. Marks read unless `after` is set. Non-participants get `404`. |
| `GET`    | `/api/chat/conversations/:id/stream`                        | Required | **SSE** for the open thread. Auth via HttpOnly `mgmt_at`. Emits initial `ready`, then `message` / `read` / `reaction` / `deleted`, plus `ping` every ~25s. Thread `message` payloads omit viewer-specific `mine` / `readByPeer` (clients derive them); `myReaction` on the wire message is `null`. Participants only.                                                                                 |
| `POST`   | `/api/chat/conversations/:id/messages`                      | Required | Body `{ kind?, body?, stickerId?, uploadId?, durationMs? }`. `kind`: `0` text … `4` audio. Text/emoji `body` max 4000. Stickers: catalog `stickerId` max 64. Image/audio: owned `uploadId` max 64 matching kind; upload cannot already be attached to another chat message. Audio needs `durationMs` 200–120000. Returns `{ message }`.                                                               |
| `DELETE` | `/api/chat/conversations/:id/messages/:messageId`           | Required | Sender-only hard delete. Removes the message for both participants, updates `last_message_id`, recounts unread for both, purges any orphaned upload, and fans out an SSE `deleted` event `{ type, messageId, conversationId }`. Non-sender or non-existent message → `404`. Returns `{ ok: true, messageId }`.                                                                                        |
| `POST`   | `/api/chat/conversations/:id/messages/:messageId/reactions` | Required | Body `{ reaction }` — integer `0..5` (`ReactionType`). Returns `{ message, myReaction, reactions, reactionCount }` and fans out an SSE `reaction` event.                                                                                                                                                                                                                                              |
| `DELETE` | `/api/chat/conversations/:id/messages/:messageId/reactions` | Required | Clear the caller's reaction. Same response shape; `myReaction` is `null`.                                                                                                                                                                                                                                                                                                                             |
| `POST`   | `/api/chat/conversations/:id/read`                          | Required | Set the caller's `last_read_at` to now. Returns `{ lastReadAt }`; fans out thread SSE `read` and refreshes inbox unread.                                                                                                                                                                                                                                                                              |
| `GET`    | `/api/chat/unread`                                          | Required | REST unread snapshot: `{ unreadTotal, latest }` where `latest` is `{ conversationId, peerName, peerEmail, preview, createdAt } \| null`. Prefer the SSE stream for the live badge.                                                                                                                                                                                                                    |
| `GET`    | `/api/chat/inbox/stream`                                    | Required | **SSE** inbox stream. Auth via HttpOnly `mgmt_at`. Emits initial `inbox` snapshot, then `ready`, later `inbox` + `ping` (~25s). Headers include `X-Accel-Buffering: no`.                                                                                                                                                                                                                              |
| `GET`    | `/api/chat/catalog`                                         | Required | Built-in `{ stickers, emoji }` lists for the picker UI.                                                                                                                                                                                                                                                                                                                                               |

Message `kind` is the same integer-enum convention as the rest of the API (`ChatMessageKind` in `types/chat.ts`). The emoji picker **inserts into the composer draft** (does not auto-send); stickers, images, and voice notes send immediately after upload. Read receipts use `chat_conversation_reads`. Live delivery: inbox badge via `/api/chat/inbox/stream`; open thread via `/api/chat/conversations/:id/stream` (`useChat` module-scoped EventSource singleton + slow REST fallback). Reaction UI: long-press a bubble for a teleported emoji bar (no always-on React button). Chat media requires R2 (same as feed uploads).

**SSE + nginx:** Prod `docker/nginx.prod.conf.template` (rendered with `LAN_IP` to `nginx.prod.rendered.conf`) has dedicated locations for `/api/chat/inbox/stream` and `/api/chat/conversations/:id/stream` (`proxy_http_version 1.1`, `proxy_buffering off`, 1h read/send timeouts). The generic `/api/` block must not front these — its 60s timeout + default HTTP/1.0 buffering yields **504** on long-lived EventSource connections (especially behind Cloudflare Tunnel). Handlers also set `X-Accel-Buffering: no`.

---

## Money (expense ledger)

Signed-in per-user ledger. Spec: [`money-spec.md`](./money-spec.md). Amounts are integer **minor units** of the caller's display currency (`MoneyCurrency`: VND đồng / USD·CNY·TWD cents; `amountMinor` ≥ 0). Changing currency does **not** convert historical rows. `direction` / `category` are integer enums (`MoneyDirection`, `MoneyCategory` in `types/money.ts`).

| Method   | Endpoint                      | Auth     | Description                                                                                                                                      |
| -------- | ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/api/money/transactions`     | Required | Query `yearMonth=YYYY-MM` (default: caller's local calendar month). Returns `{ transactions, totals }` with `inMinor` / `outMinor` / `netMinor`. |
| `POST`   | `/api/money/transactions`     | Required | Upsert body `{ id?, occurredOn, amountMinor, direction, category, note? }`. Cross-user `id` → `404`.                                             |
| `DELETE` | `/api/money/transactions/:id` | Required | Ownership `404`.                                                                                                                                 |

Client page: `/money` (month navigator + totals + category/daily charts + filtered list + modal + CSV/JSON export). Nav shortcut `g m`. Savings: `/money/savings`.

---

## Money savings

Per-user savings goals. Spec: [`money-spec.md`](./money-spec.md). Status is an integer enum (`MoneySavingsGoalStatus`). `savedMinor` / `progress` are derived from contributions.

| Method   | Endpoint                                     | Auth     | Description                                                                                         |
| -------- | -------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/money/savings/goals`                   | Required | `{ goals }` with derived `savedMinor` / `progress`.                                                 |
| `POST`   | `/api/money/savings/goals`                   | Required | Upsert `{ id?, title, targetMinor, status?, targetDate?, note? }`. Cross-user `id` → `404`.         |
| `DELETE` | `/api/money/savings/goals/:id`               | Required | Cascades contributions. Ownership `404`.                                                            |
| `GET`    | `/api/money/savings/goals/:id/contributions` | Required | `{ contributions, goal }`.                                                                          |
| `POST`   | `/api/money/savings/goals/:id/contributions` | Required | Body `{ occurredOn, amountMinor (≥1), note? }`. Auto-completes Active goals when target is reached. |
| `DELETE` | `/api/money/savings/contributions/:id`       | Required | Ownership `404`.                                                                                    |

Client: `/money/savings` (goal cards + CSV/JSON export of loaded goals).

---

## Money budgets

Per-user monthly limits. Spec: [`money-spec.md`](./money-spec.md). `MoneyBudgetScope`: `Overall=0`, `Category=1`. Spent is derived from ledger `Out` for the month (overall) or category.

| Method   | Endpoint                  | Auth     | Description                                                                                                        |
| -------- | ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/api/money/budgets`      | Required | Query `yearMonth=YYYY-MM`. Returns `{ yearMonth, budgets, budgetMinor, spentMinor }` with per-row `spentMinor`.    |
| `POST`   | `/api/money/budgets`      | Required | Upsert `{ id?, yearMonth, scope, category?, amountMinor }`. Same natural slot overwrites. Cross-user `id` → `404`. |
| `DELETE` | `/api/money/budgets/:id`  | Required | Ownership `404`.                                                                                                   |
| `POST`   | `/api/money/budgets/copy` | Required | Body `{ fromYearMonth, toYearMonth }` — copy slots (upsert amounts).                                               |

Client: `/money/budgets` (month navigator + CSV/JSON export).

## Money user categories

Per-user custom categories (open-ended names). Built-ins remain `MoneyCategory` integers. Spec: [`money-spec.md`](./money-spec.md).

| Method   | Endpoint                    | Auth     | Description                                                |
| -------- | --------------------------- | -------- | ---------------------------------------------------------- |
| `GET`    | `/api/money/categories`     | Required | `{ categories }` (non-archived).                           |
| `POST`   | `/api/money/categories`     | Required | Upsert `{ id?, name, emoji, color (#RRGGBB), direction }`. |
| `DELETE` | `/api/money/categories/:id` | Required | Soft-archive. Ownership `404`.                             |

Transaction/budget upserts accept exactly one of `category` (builtin int) or `userCategoryId`.

---

## Epics (scoped to authenticated user)

| Method   | Endpoint         | Description                                                                                                                                        |
| -------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/epics`     | Returns the caller's Epics with derived hours, progress, taskCount.                                                                                |
| `POST`   | `/api/epics`     | Creates or updates one of the caller's Epics (`epicUpsertBodySchema`). Attempting to POST a body with an `id` owned by someone else returns `404`. |
| `DELETE` | `/api/epics/:id` | Removes one of the caller's Epics. Cross-user ids `404`. Child tasks have `epicId` cleared.                                                        |

---

## Tasks (scoped to authenticated user)

| Method   | Endpoint         | Description                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/api/tasks`     | Returns the caller's tasks. **Default (light):** omits `timeBlocks` and `checklist` arrays but returns accurate `spentHours` via a SQL `SUM` aggregate. Opt in with `?include=blocks` and/or `?include=checklists` (comma-separated, e.g. `?include=blocks,checklists`). Client note: the `useTasks().fetchAll()` composable defaults to light; calendar/editing views pass `{ include: ['blocks','checklists'] }` explicitly. |
| `POST`   | `/api/tasks`     | Creates or updates one of the caller's tasks (`taskUpsertBodySchema`, including `timeBlocks`). Cross-user ids `404`. Cross-user `epicId` is `400`.                                                                                                                                                                                                                                                                             |
| `DELETE` | `/api/tasks/:id` | Removes one of the caller's tasks. Cross-user ids `404`.                                                                                                                                                                                                                                                                                                                                                                       |

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

**`GET /api/tasks`** — Returns all tasks. **Light (default):** no `timeBlocks` or `checklist` arrays; `spentHours` is accurate via `COALESCE(SUM(spent_hours),0)` grouped by task. Opt in with `?include=blocks,checklists` (comma-separated; `checklist` singular is also accepted). Sort key when blocks are present: `dueDate ?? firstBlock.start ?? createdAt`; without blocks: `dueDate ?? createdAt`.

**`POST /api/tasks`** — Accepts a full task object including the `timeBlocks` array. If `id` matches an existing record it replaces it; otherwise appends new. Blocks are sorted by `start` on save.

**`DELETE /api/tasks/:id`** — Removes the task with the given `id`. Returns `404` if not found.

**`POST /api/timer/start`** — Sets the active timer to `{ taskId, startedAt: now }`. If a _different_ task already had a running timer, the elapsed interval is appended as a new `TimeBlock` on that task before the new timer starts; the response's `finalizedFor` field is the prior task's id (else `null`). Sessions < 30 s when finalized this way are dropped.

**`POST /api/timer/stop`** — Finalizes the active timer into a new `TimeBlock` on the owning task and clears `activeTimer`. Response: `{ stopped, discarded?, activeTimer: null, task, block }`. If the elapsed time is < 30 s, `discarded: true` and no block is appended (but the timer is still cleared).
