# Database

Schema, field references, and the conventions every row obeys. Paired with [`architecture.md`](./architecture.md) (pool & migration runner) and [`auth.md`](./auth.md) (the per-user scoping rules that drive `user_id` everywhere).

All relational data lives in the local MySQL database `rc`. The schema is owned by a SQL-file migration system rooted at `server/db/migrations/` and applied by `npm run migrate` — the server itself never auto-creates or alters tables. On boot, a Nitro plugin (`server/plugins/db-verify.ts`) calls `verifyMigrationsApplied()` and aborts the process if anything is pending or has drifted, so the app and the schema can never get out of step silently.

**Ownership.** Time-management rows (`epics`, `tasks`, …) always carry a `user_id` and are filtered by it. Feed rows (`posts`, `stories`, `uploads`, …) also carry author `user_id`, but **reads** may be public/shared via visibility ACLs. Install-wide reference data (`post_categories`) has no `user_id`. Binary payloads for attachments live in **Cloudflare R2** when configured; MySQL stores metadata + `storage_key` only.

**Migrations on disk today:** `0001_initial` → `0002_users_last_login_at` → `0003_posts_feed` → `0004_feed_social` → `0005_post_categories_story_analytics` → `0006_core_tech_categories` → … → `0010_users_profile_fields` → `0011_post_translation_locales` → `0012_auth_password_resets` → `0013_chat` → `0014_chat_media` → `0015_chat_unread_counters` → `0016_posts_comment_count` → `0017_chat_message_reactions` → `0018_reaction_int_enums` → `0019_post_upload_int_enums` → … → `0022_index_hygiene` → `0023_auth_oauth_identities` → `0024_money_transactions`.

## Migration system

| File / Symbol                        | Role                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| `server/db/migrations/NNNN_name.sql` | Plain SQL files, applied in lexical order. `0001_initial.sql` is the baseline.       |
| `server/db/migrator.ts`              | Discovery, status, apply (with `GET_LOCK('schema_migrations', 30)`), checksum drift. |
| `schema_migrations` table            | `id`, `name`, `checksum` (SHA-256), `applied_at`, `duration_ms`.                     |
| `npm run migrate`                    | Apply all pending migrations.                                                        |
| `npm run migrate:status`             | Show applied vs pending vs drift.                                                    |
| `npm run migrate:reset`              | DEV-ONLY drop of all known tables (requires `MIGRATE_RESET_CONFIRM=yes`).            |
| `server/plugins/db-verify.ts`        | Boot-time guard — refuses to start if any migration is pending or has drifted.       |

The "migrations are immutable once applied" rule is enforced via SHA-256: editing a previously-applied file fails the next status/migrate run and the server boot. See [`../server/db/migrations/README.md`](../server/db/migrations/README.md) for the full conventions.

---

## Integer enums, end-to-end

**New** enum-shaped columns must be `TINYINT UNSIGNED` + named integer consts —
the same integer flows unchanged through MySQL → row mapper → API JSON → JWT
claim → frontend. There are no string ↔ integer translation helpers for those
domains; the TypeScript type _is_ the integer.

Compliant integer columns are listed below. Migration `0019` converts post
visibility/format and upload/attachment kind to this convention. A few
**legacy string-token** columns remain (job type/status) and should be migrated
forward-only — do not add more of them.

In source, each enum is exported as a `const` object plus a numeric union:

```ts
// types/task.ts (mirrored verbatim in server/db/types.ts)
export const TaskStatus = { Todo: 0, InProgress: 1, Done: 2 } as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];
```

So `task.status === TaskStatus.Done` compiles to `task.status === 2`. You
get the named-constant ergonomics of an enum with none of TypeScript's
native `enum` runtime overhead, and the wire format is plain `number`.

Benefits over a string-ENUM column with translation at the boundary:

- **One source of truth.** Add a role / status / priority rank in a single
  `const` and every layer agrees by construction. No `numberToRole` /
  `roleToNumber` to keep in sync.
- **Cheap to compare & order.** `ORDER BY priority DESC` is "by importance"
  because the mapping is `low=0, normal=1, high=2`. Same for roles: `normal
= 0 < admin = 1 < superadmin = 2`, so `WHERE role >= 1` is "has admin
  powers".
- **Smaller wire payloads.** `{ "role": 2 }` vs `{ "role": "superadmin" }`.
- **Trivially extended.** Adding `Superadmin = 2` was a code change, not an
  `ALTER TABLE` — `TINYINT UNSIGNED` already accommodates every value we
  might invent.
- **Free from MySQL's ENUM footguns** (1-indexed storage, silent fallback
  to `''` on invalid input, awkward to introspect from a client).

**Agent rule:** **never create string field-type enums.** New enum-shaped
columns/API fields must be `TINYINT UNSIGNED` + named integer const — not
MySQL `ENUM('…')`, not `VARCHAR` tokens, not string unions on the wire. See
[`.cursor/skills/integer-db-enums/SKILL.md`](../.cursor/skills/integer-db-enums/SKILL.md).

| Column                                                                                     | Type                    | Mapping                                                                                 |
| ------------------------------------------------------------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------- |
| `users.role`                                                                               | `TINYINT UNSIGNED`      | `Normal=0, Admin=1, Superadmin=2`                                                       |
| `auth_identities.provider`                                                                 | `TINYINT UNSIGNED`      | `AuthProvider.Google=0`                                                                 |
| `epics.status`                                                                             | `TINYINT UNSIGNED`      | `Todo=0, InProgress=1, Done=2`                                                          |
| `tasks.status`                                                                             | `TINYINT UNSIGNED`      | `Todo=0, InProgress=1, Done=2`                                                          |
| `tasks.priority`                                                                           | `TINYINT UNSIGNED`      | `Low=0, Normal=1, High=2`                                                               |
| `tasks.recurrence_rule`                                                                    | `TINYINT UNSIGNED` NULL | `Daily=0, Weekly=1, Monthly=2`                                                          |
| `chat_messages.kind`                                                                       | `TINYINT UNSIGNED`      | `Text=0, Emoji=1, Sticker=2, Image=3, Audio=4`                                          |
| `post_reactions.reaction` / `story_reactions.reaction` / `chat_message_reactions.reaction` | `TINYINT UNSIGNED`      | `Like=0, Love=1, Haha=2, Wow=3, Sad=4, Angry=5` (`ReactionType` in `types/reaction.ts`) |
| `posts.visibility`                                                                         | `TINYINT UNSIGNED`      | `Public=0, Private=1, Shared=2` (`PostVisibility` in `types/post.ts`)                   |
| `posts.format`                                                                             | `TINYINT UNSIGNED`      | `Update=0, Manuscript=1` (`PostFormat` in `types/post.ts`)                              |
| `uploads.kind` / `post_attachments.kind`                                                   | `TINYINT UNSIGNED`      | `Image=0, Document=1, Audio=2` (`UploadKind` in `types/post.ts`)                        |
| `jobs.status`                                                                              | `TINYINT UNSIGNED`      | `Pending=0, Processing=1, Completed=2, Dead=3` (`JobStatus` in `types/job.ts`)          |
| `money_transactions.direction`                                                             | `TINYINT UNSIGNED`      | `Out=0, In=1` (`MoneyDirection` in `types/money.ts`)                                    |
| `money_transactions.category`                                                              | `TINYINT UNSIGNED`      | `Food=0` … `Other=10` (`MoneyCategory` in `types/money.ts`)                             |

`epics.color` is intentionally **not** an integer enum — it's a Tailwind
token (`brand`, `sky`, `emerald`, …) composed into class names like
`bg-${color}-100` all over the UI, so the strings carry real meaning
outside the type system. It's stored as `VARCHAR(16)`.

### Legacy string tokens (pending integer migration)

| Column      | Current DB    | Current TS               | Notes                                                                               |
| ----------- | ------------- | ------------------------ | ----------------------------------------------------------------------------------- |
| `jobs.type` | `VARCHAR(64)` | `JobTypes` string consts | Extensible worker registry key (`email.send`, …); kept as VARCHAR by design for now |

`post_attachments.kind` uses the same `UploadKind` values as uploads; today
post attachments are image/document only, while audio uploads attach via
`chat_messages.upload_id`.

---

## Schema

```sql
-- Users (auth) --------------------------------------------------------
-- `role` is the integer enum documented above (normal=0, admin=1,
-- superadmin=2). `last_login_at` is added by migration 0002.
CREATE TABLE users (
  id              VARCHAR(64) PRIMARY KEY,
  email           VARCHAR(320) NOT NULL,
  password_hash   VARCHAR(255) NULL,   -- NULL = OAuth-only (migration 0023)
  name            VARCHAR(255) NULL,
  avatar_upload_id VARCHAR(64) NULL,   -- migration 0010; FK → uploads(id)
  title           VARCHAR(120) NULL,   -- migration 0010
  job             VARCHAR(120) NULL,   -- migration 0010
  location        VARCHAR(120) NULL,   -- migration 0010
  role            TINYINT UNSIGNED NOT NULL DEFAULT 0,
  email_verified  TINYINT(1)    NOT NULL DEFAULT 0,
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  last_login_at   DATETIME(3)   NULL,
  UNIQUE KEY uniq_users_email (email),
  INDEX idx_users_role (role),
  CONSTRAINT fk_users_avatar_upload FOREIGN KEY (avatar_upload_id)
    REFERENCES uploads(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- OAuth identities (migration 0023). AuthProvider: Google=0
CREATE TABLE auth_identities (
  id               VARCHAR(64) PRIMARY KEY,
  user_id          VARCHAR(64) NOT NULL,
  provider         TINYINT UNSIGNED NOT NULL,
  provider_subject VARCHAR(255) NOT NULL,
  provider_email   VARCHAR(320) NULL,
  created_at       DATETIME(3) NOT NULL,
  updated_at       DATETIME(3) NOT NULL,
  UNIQUE KEY uniq_auth_identities_provider_subject (provider, provider_subject),
  UNIQUE KEY uniq_auth_identities_user_provider (user_id, provider),
  CONSTRAINT fk_auth_identities_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_auth_identities_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Money ledger (migration 0024). Amounts are VND đồng (BIGINT ≥ 0).
-- MoneyDirection: Out=0 In=1. MoneyCategory: Food=0 … Other=10.
CREATE TABLE money_transactions (
  id            VARCHAR(64)  NOT NULL,
  user_id       VARCHAR(64)  NOT NULL,
  occurred_on   DATE         NOT NULL,
  amount_minor  BIGINT       NOT NULL,
  direction     TINYINT UNSIGNED NOT NULL,
  category      TINYINT UNSIGNED NOT NULL,
  note          VARCHAR(500) NULL,
  created_at    DATETIME(3)  NOT NULL,
  updated_at    DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_money_tx_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_money_tx_amount CHECK (amount_minor >= 0),
  INDEX idx_money_tx_user_occurred (user_id, occurred_on),
  INDEX idx_money_tx_user_category (user_id, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Refresh tokens ------------------------------------------------------
-- We store SHA-256 hashes only; logout sets revoked_at. Refresh rotates
-- on every successful /api/auth/refresh.
CREATE TABLE auth_refresh_tokens (
  id           VARCHAR(64) PRIMARY KEY,
  user_id      VARCHAR(64) NOT NULL,
  token_hash   CHAR(64)    NOT NULL,
  expires_at   DATETIME(3) NOT NULL,
  revoked_at   DATETIME(3) NULL,
  user_agent   VARCHAR(512) NULL,
  ip           VARCHAR(64)  NULL,
  created_at   DATETIME(3) NOT NULL,
  UNIQUE KEY uniq_refresh_token_hash (token_hash),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_refresh_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Email verification --------------------------------------------------
CREATE TABLE auth_email_verifications (
  id           VARCHAR(64) PRIMARY KEY,
  user_id      VARCHAR(64) NOT NULL,
  token_hash   CHAR(64)    NOT NULL,
  expires_at   DATETIME(3) NOT NULL,
  consumed_at  DATETIME(3) NULL,
  created_at   DATETIME(3) NOT NULL,
  UNIQUE KEY uniq_verify_token_hash (token_hash),
  CONSTRAINT fk_verify_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_verify_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Epics ---------------------------------------------------------------
-- `status` uses the integer-enum pattern (see "Why integer enums"):
--     0 = todo, 1 = in-progress, 2 = done
CREATE TABLE epics (
  id           VARCHAR(64) PRIMARY KEY,
  user_id      VARCHAR(64) NOT NULL,
  title        VARCHAR(255) NOT NULL,
  description  TEXT,
  status       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  color        VARCHAR(16),
  due_date     DATE,
  tags         JSON,
  created_at   DATETIME(3) NOT NULL,
  updated_at   DATETIME(3) NOT NULL,
  CONSTRAINT fk_epics_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_epics_user   (user_id),
  INDEX idx_epics_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tasks ---------------------------------------------------------------
-- `tags` is a JSON array. Recurrence is flattened into three columns so
-- it indexes / queries naturally; an absent rule means a non-recurring task.
-- Integer-enum columns (see "Why integer enums"):
--     status:          0 = todo,   1 = in-progress, 2 = done
--     priority:        0 = low,    1 = normal,      2 = high     (higher = more important)
--     recurrence_rule: 0 = daily,  1 = weekly,      2 = monthly  (NULL = non-recurring)
CREATE TABLE tasks (
  id                  VARCHAR(64) PRIMARY KEY,
  user_id             VARCHAR(64) NOT NULL,
  epic_id             VARCHAR(64) NULL,
  title               VARCHAR(255) NOT NULL,
  notes               TEXT,
  status              TINYINT UNSIGNED NOT NULL DEFAULT 0,
  priority            TINYINT UNSIGNED NOT NULL DEFAULT 1,
  due_date            DATE,
  estimated_hours     DECIMAL(8,2),
  progress            TINYINT UNSIGNED,
  tags                JSON,
  recurrence_rule     TINYINT UNSIGNED  NULL,
  recurrence_interval SMALLINT UNSIGNED NULL,
  recurrence_until    DATE NULL,
  created_at          DATETIME(3) NOT NULL,
  updated_at          DATETIME(3) NOT NULL,
  CONSTRAINT fk_tasks_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tasks_epic FOREIGN KEY (epic_id)
    REFERENCES epics(id) ON DELETE SET NULL,
  INDEX idx_tasks_user   (user_id),
  INDEX idx_tasks_epic   (epic_id),
  INDEX idx_tasks_status (status),
  INDEX idx_tasks_due    (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Time blocks ---------------------------------------------------------
-- One row per scheduled session. Ownership inherited via task FK.
CREATE TABLE time_blocks (
  id           VARCHAR(64) PRIMARY KEY,
  task_id      VARCHAR(64) NOT NULL,
  start_at     DATETIME(3) NOT NULL,
  end_at       DATETIME(3) NOT NULL,
  spent_hours  DECIMAL(8,2) NULL,
  CONSTRAINT fk_blocks_task FOREIGN KEY (task_id)
    REFERENCES tasks(id) ON DELETE CASCADE,
  INDEX idx_blocks_task  (task_id),
  INDEX idx_blocks_start (start_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Checklist items -----------------------------------------------------
-- `position` preserves the order the user dragged things into.
CREATE TABLE checklist_items (
  id        VARCHAR(64) PRIMARY KEY,
  task_id   VARCHAR(64) NOT NULL,
  text      VARCHAR(2000) NOT NULL,
  done      TINYINT(1) NOT NULL DEFAULT 0,
  position  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_checklist_task FOREIGN KEY (task_id)
    REFERENCES tasks(id) ON DELETE CASCADE,
  INDEX idx_checklist_task (task_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Active timer (per user) --------------------------------------------
-- One row per user, keyed by user_id, so concurrent users can each have
-- one running timer without stepping on each other.
CREATE TABLE active_timer (
  user_id     VARCHAR(64) NOT NULL,
  task_id     VARCHAR(64) NOT NULL,
  started_at  DATETIME(3) NOT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_timer_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_timer_task FOREIGN KEY (task_id)
    REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

> **Note:** `epic.estimatedHours`, `epic.spentHours`, `epic.progress`, and `task.spentHours`, `task.checklistProgress` are **never stored** — they are always computed at read time in `server/db/compute.ts` (re-exported through `server/utils/db.ts`) and attached to the response by the API.

---

## Timestamps and timezones

- All `DATETIME(3)` columns store UTC; we never rely on MySQL's session timezone.
- The driver runs with `dateStrings: true`, so the server reads bare `"YYYY-MM-DD HH:mm:ss.SSS"` strings and promotes them to ISO 8601 (`"…Z"`) before they leave `db.ts`. Writes do the inverse, so JS `Date` → ISO → MySQL → ISO round-trips losslessly to the millisecond.

## Why JSON for `tags`

Tags are free-form strings on both epics and tasks. Modeling them as a separate `tags` table (and a many-to-many join) would solve query problems we don't have — a single user with a few dozen tags doesn't need indexed faceting. JSON columns keep the round-trip with the existing `string[]` type one line of code, and `JSON_CONTAINS` is available if we ever want to filter by tag in SQL.

---

## Field references

### AuthUser (wire; from `users`)

Public-safe account shape returned by auth routes (`GET /api/auth/me`, `PATCH /api/auth/profile`, login, …). Never includes `passwordHash`.

| Field           | Stored as                       | Required | Description                                                              |
| --------------- | ------------------------------- | -------- | ------------------------------------------------------------------------ |
| `id`            | `id`                            | Yes      | `user_<random>`                                                          |
| `email`         | `email`                         | Yes      | Unique login identity                                                    |
| `name`          | `name` VARCHAR(255)             | No       | Display name; signup/profile app max **120** chars                       |
| `avatarUrl`     | derived from `avatar_upload_id` | No       | `/api/uploads/{id}` when set; FK `ON DELETE SET NULL` (migration `0010`) |
| `title`         | `title` VARCHAR(120)            | No       | Short professional headline                                              |
| `job`           | `job` VARCHAR(120)              | No       | Job / role at work                                                       |
| `location`      | `location` VARCHAR(120)         | No       | Free-form location                                                       |
| `role`          | `role` TINYINT                  | Yes      | `UserRole`: `0` Normal, `1` Admin, `2` Superadmin                        |
| `emailVerified` | `email_verified`                | Yes      | Login requires `true`                                                    |
| `createdAt`     | `created_at`                    | Yes      | Account creation                                                         |
| `updatedAt`     | `updated_at`                    | Yes      | Last profile / role / verification change (not login stamps)             |

See [`auth.md`](./auth.md#profile-editing) for the edit path.

### Epic

| Field         | Type     | Required | Description                                      |
| ------------- | -------- | -------- | ------------------------------------------------ |
| `id`          | string   | Yes      | `epic_<random>`                                  |
| `title`       | string   | Yes      | Short display name                               |
| `description` | string   | No       | Markdown-supported overview                      |
| `status`      | integer  | Yes      | `TaskStatus`: `0` Todo, `1` InProgress, `2` Done |
| `dueDate`     | ISO date | No       | `YYYY-MM-DD`                                     |
| `tags`        | string[] | No       | Free-form labels                                 |
| `createdAt`   | ISO 8601 | Yes      | Record creation                                  |
| `updatedAt`   | ISO 8601 | Yes      | Last modification                                |

**Computed (not stored):** `estimatedHours`, `spentHours`, `progress`, `taskCount`.

### Task

| Field            | Type     | Required | Description                                              |
| ---------------- | -------- | -------- | -------------------------------------------------------- |
| `id`             | string   | Yes      | `task_<random>`                                          |
| `epicId`         | string   | No       | Parent Epic; omit for standalone                         |
| `title`          | string   | Yes      | Short display name                                       |
| `notes`          | string   | No       | Markdown long-form                                       |
| `status`         | integer  | Yes      | `TaskStatus`: `0` Todo, `1` InProgress, `2` Done         |
| `priority`       | integer  | Yes      | `TaskPriority`: `0` Low, `1` Normal (default), `2` High  |
| `dueDate`        | ISO date | No       | `YYYY-MM-DD`                                             |
| `estimatedHours` | number   | No       | Planned time budget                                      |
| `progress`       | integer  | No       | `0–100`                                                  |
| `tags`           | string[] | No       | Free-form labels                                         |
| `timeBlocks`     | Block[]  | No       | Scheduled work sessions                                  |
| `checklist`      | Item[]   | No       | Sub-steps `[{ id, text, done }]`                         |
| `recurrence`     | object   | No       | `{ rule: RecurrenceRule, interval, until? }` — see below |
| `createdAt`      | ISO 8601 | Yes      | Record creation                                          |
| `updatedAt`      | ISO 8601 | Yes      | Last modification                                        |

**Computed (not stored):** `spentHours`, `checklistProgress`.

#### Recurrence

A recurring task carries its existing `timeBlocks` as **seeds**. The UI never auto-materializes future occurrences into the database — that would inflate `spentHours` with hours nobody actually logged. Instead, the dashboard projects ghost blocks within the visible window (daily = today, weekly = current week, monthly = the 6-week grid) by adding `interval × {day | week | month}` to each seed. Ghosts are dashed, lower-opacity, non-draggable, and never sent back to the server. To record an instance, the user runs the timer (or adds an explicit block) during that window — which appends a real, persisted block.

| Field      | Type     | Required | Description                                                  |
| ---------- | -------- | -------- | ------------------------------------------------------------ |
| `rule`     | integer  | Yes      | `RecurrenceRule`: `0` Daily, `1` Weekly, `2` Monthly         |
| `interval` | integer  | Yes      | `1` = every; `2` = every other; capped at 365                |
| `until`    | ISO date | No       | `YYYY-MM-DD`; no further occurrences are projected past this |

### Time Block

| Field        | Type     | Required | Description          |
| ------------ | -------- | -------- | -------------------- |
| `id`         | string   | Yes      | `block_<random>`     |
| `start`      | ISO 8601 | Yes      | Block start datetime |
| `end`        | ISO 8601 | Yes      | Block end datetime   |
| `spentHours` | number   | No       | Actual hours logged  |

### Active Timer (top-level, optional)

| Field       | Type     | Required | Description                            |
| ----------- | -------- | -------- | -------------------------------------- |
| `taskId`    | string   | Yes      | ID of the task currently being tracked |
| `startedAt` | ISO 8601 | Yes      | When the timer started                 |

When `null` (or absent) no timer is active. On stop, a new TimeBlock is appended to the task's `timeBlocks` and `activeTimer` is cleared.

---

## Feed & stories (migrations 0003–0008)

Canonical DDL lives in the migration files; this section is the as-built map.

| Table              | Purpose                                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `posts`            | Feed posts: `body`, `format` (`0` update / `1` manuscript), optional `title`, `visibility` (`0` public / `1` private / `2` shared), optional `category_id`, `font_family`, `text_color`, optional `shared_post_id`, optional `translation_group_id`, `content_locale`, denormalized `comment_count` (migration `0016`; integer visibility/format in `0019`) |
| `post_audience`    | ACL rows for `visibility = 2` (`PostVisibility.Shared`)                                                                                                                                                                                                                                                                                                     |
| `post_reactions`   | One reaction per `(post_id, user_id)`; `reaction` is `TINYINT` (`ReactionType`: Like=0 … Angry=5)                                                                                                                                                                                                                                                           |
| `post_comments`    | Threaded comments on a post                                                                                                                                                                                                                                                                                                                                 |
| `post_attachments` | Attachment metadata linked to `uploads`; `kind` uses `UploadKind` (`0` image / `1` document; audio is chat-only via `chat_messages.upload_id`)                                                                                                                                                                                                              |
| `post_categories`  | Install-wide category catalog (seeded; no `user_id`). `0005` seeds generic dirs; `0006` seeds Electronics / Mechanical Engineering / IT / IoT with low `sort_order`                                                                                                                                                                                         |
| `uploads`          | Upload metadata + R2 `storage_key` (`uploads/{folder}/{yyyy}/{mm}/…` for new objects; `kind` uses `UploadKind`, and `UPLOAD_KIND_STORAGE_FOLDER` maps to `image`/`document`/`audio` folders)                                                                                                                                                                |
| `stories`          | 24h stories (`expires_at`), optional media                                                                                                                                                                                                                                                                                                                  |
| `story_views`      | Viewer rollup                                                                                                                                                                                                                                                                                                                                               |
| `story_reactions`  | Reactions on stories; `reaction` is `TINYINT` (`ReactionType`)                                                                                                                                                                                                                                                                                              |

Wire DTOs: `~/types/post.ts`, `~/types/story.ts`. Domain SQL: `server/db/posts.ts`, `server/db/stories.ts`, `server/db/uploads.ts`, `server/db/categories.ts`.

**Media cleanup.** Deleting a post/story, replacing/clearing a profile avatar, or deleting a user removes orphaned `uploads` rows and their Cloudflare R2 objects (`purgeOrphanedUploads` / pre-delete key sweep on `deleteUser`). Expired stories are filtered out of the tray by `expires_at`; physical delete + R2 sweep runs in the job worker (~2 min) via `purgeExpiredStories` (also available as `media.purgeExpired`). An upload stays alive while referenced by `post_attachments`, a non-expired story, or `users.avatar_upload_id`. See [`api.md`](./api.md#uploads-r2).

**Manuscripts.** `format = 1` (`PostFormat.Manuscript`) requires a non-empty `title`; body is `MEDIUMTEXT` (migration `0007`). Writing desk: `/feed/write`. Multilingual manuscripts use one row per locale sharing `translation_group_id` with `content_locale` in `en`/`vi`/`zh-CN`/`zh-TW` (migration `0011`).

**Category display names.** MySQL stores a canonical `name` (admin-editable). Seeded slugs resolve to UI copy via `CATEGORY_I18N_KEYS` + `utils/categoryLabel.ts` (`categories.*` in locale JSON). Custom admin directories without a key keep showing the DB `name`.

**Upload policy.** Allowed types, per-type size caps, and magic-byte checks live in `utils/uploadPolicy.ts` (client + server) and `server/utils/fileSignature.ts`. See [`api.md`](./api.md#uploads-r2).

---

## Chat (migrations 0013–0017)

Direct 1:1 messages between signed-in users. Spec: [`chat-spec.md`](./chat-spec.md).

| Table                     | Purpose                                                                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat_conversations`      | One row per pair; app enforces `user_a_id` &lt; `user_b_id` before insert (`UNIQUE(user_a_id, user_b_id)`). `last_message_at` + denormalized `last_message_id` (indexed, **no FK**) |
| `chat_messages`           | Messages: `kind` (`0` text / `1` emoji / `2` sticker / `3` image / `4` audio), optional `body`, `sticker_id`, `upload_id`, `duration_ms`                                            |
| `chat_conversation_reads` | Per `(conversation_id, user_id)` `last_read_at` + denormalized `unread_count` for badge/list                                                                                        |
| `chat_message_reactions`  | One reaction per `(message_id, user_id)`; `reaction` is `TINYINT` (`ReactionType`); FK cascade from message/user                                                                    |

Migration `0014` extends `uploads.kind` with `audio` and adds `chat_messages.upload_id` / `duration_ms`. Migration `0015` adds `unread_count` and `last_message_id` (backfilled) so list/badge queries avoid correlated `COUNT(*)` / last-message subqueries. Migration `0017` adds message reactions as `TINYINT`. Migration `0018` converts legacy post/story `ENUM` reaction strings to the same `TINYINT` `ReactionType` constants. Migration `0019` converts post visibility/format and upload/attachment kind to `TINYINT` consts. Chat participants may fetch attached uploads via `canViewerAccessUpload`. Orphan purge treats `chat_messages.upload_id` as a live reference.

Wire DTOs + sticker catalog: `~/types/chat.ts`. Shared reaction consts: `~/types/reaction.ts`. Domain SQL: `server/db/chat.ts`. Deleting a user cascades conversations and messages.

---

## Money (migration 0024)

Per-user expense ledger. Spec: [`money-spec.md`](./money-spec.md).

| Table                | Purpose                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `money_transactions` | Ledger rows: `occurred_on` (DATE), `amount_minor` (BIGINT ≥ 0), `direction` (`Out=0`/`In=1`), `category` (`Food=0`…`Other=10`), optional `note` |

Wire DTOs: `~/types/money.ts`. Domain SQL: `server/db/money.ts`. Deleting a user cascades their transactions.

---

## Jobs queue (migration 0009)

| Table  | Purpose                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------- |
| `jobs` | Durable background work: `type`, JSON `payload`, `status`, attempts, `available_at`, lock metadata |

Statuses: `pending` → `processing` → `completed`, or retry as `pending`, or `dead` after max attempts. Claimed with `FOR UPDATE SKIP LOCKED`. See [`cache-queue.md`](./cache-queue.md).

Domain module: `server/db/jobs.ts`. Worker: `server/plugins/job-worker.ts`.

---

## Proposed schema extensions

These fields are documented so the data model stays forward-compatible. The current API ignores unknown fields gracefully (round-tripped untouched).

**TimeBlock:**

| Field   | Type   | Description                              |
| ------- | ------ | ---------------------------------------- |
| `notes` | string | What actually happened during this block |
