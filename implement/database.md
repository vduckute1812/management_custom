# Database

Schema, field references, and the conventions every row obeys. Paired with [`architecture.md`](./architecture.md) (pool & migration runner) and [`auth.md`](./auth.md) (the per-user scoping rules that drive `user_id` everywhere).

All data lives in the local MySQL database `rc`. The schema is owned by a SQL-file migration system rooted at `server/db/migrations/` and applied by `npm run migrate` — the server itself never auto-creates or alters tables. On boot, a Nitro plugin (`server/plugins/db-verify.ts`) calls `verifyMigrationsApplied()` and aborts the process if anything is pending or has drifted, so the app and the schema can never get out of step silently. Every row carrying user data also carries a `user_id` foreign key — the API filters by it on every read and write.

## Migration system

| File / Symbol                             | Role                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `server/db/migrations/NNNN_name.sql`      | Plain SQL files, applied in lexical order. `0001_initial.sql` is the baseline.        |
| `server/db/migrator.ts`                   | Discovery, status, apply (with `GET_LOCK('schema_migrations', 30)`), checksum drift.  |
| `schema_migrations` table                 | `id`, `name`, `checksum` (SHA-256), `applied_at`, `duration_ms`.                      |
| `npm run migrate`                         | Apply all pending migrations.                                                         |
| `npm run migrate:status`                  | Show applied vs pending vs drift.                                                     |
| `npm run migrate:reset`                   | DEV-ONLY drop of all known tables (requires `MIGRATE_RESET_CONFIRM=yes`).             |
| `server/plugins/db-verify.ts`             | Boot-time guard — refuses to start if any migration is pending or has drifted.       |

The "migrations are immutable once applied" rule is enforced via SHA-256: editing a previously-applied file fails the next status/migrate run and the server boot. See [`../server/db/migrations/README.md`](../server/db/migrations/README.md) for the full conventions.

---

## Integer enums, end-to-end

Every enum-shaped column on this database is `TINYINT UNSIGNED` and the
same integer flows unchanged through the entire stack: MySQL → row mapper →
API JSON → JWT claim → frontend code. There are no string ↔ integer
translation helpers anywhere; the TypeScript type *is* the integer.

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

| Column                  | Type                    | Mapping                                  |
| ----------------------- | ----------------------- | ---------------------------------------- |
| `users.role`            | `TINYINT UNSIGNED`      | `Normal=0, Admin=1, Superadmin=2`        |
| `epics.status`          | `TINYINT UNSIGNED`      | `Todo=0, InProgress=1, Done=2`           |
| `tasks.status`          | `TINYINT UNSIGNED`      | `Todo=0, InProgress=1, Done=2`           |
| `tasks.priority`        | `TINYINT UNSIGNED`      | `Low=0, Normal=1, High=2`                |
| `tasks.recurrence_rule` | `TINYINT UNSIGNED` NULL | `Daily=0, Weekly=1, Monthly=2`           |

`epics.color` is intentionally **not** an integer enum — it's a Tailwind
token (`brand`, `sky`, `emerald`, …) composed into class names like
`bg-${color}-100` all over the UI, so the strings carry real meaning
outside the type system. It's stored as `VARCHAR(16)`.

---

## Schema

```sql
-- Users (auth) --------------------------------------------------------
-- `role` follows the "integer enum at the boundary" pattern documented
-- above (normal=0, admin=1, superadmin=2). See server/db/types.ts for
-- the int↔string helpers.
CREATE TABLE users (
  id              VARCHAR(64) PRIMARY KEY,
  email           VARCHAR(320) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  name            VARCHAR(255) NULL,
  role            TINYINT UNSIGNED NOT NULL DEFAULT 0,
  email_verified  TINYINT(1)    NOT NULL DEFAULT 0,
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  UNIQUE KEY uniq_users_email (email),
  INDEX idx_users_role (role)
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

> **Note:** `epic.estimatedHours`, `epic.spentHours`, `epic.progress`, and `task.spentHours`, `task.checklistProgress` are **never stored** — they are always computed at read time in `server/utils/db.ts` and attached to the response by the API.

---

## Timestamps and timezones

- All `DATETIME(3)` columns store UTC; we never rely on MySQL's session timezone.
- The driver runs with `dateStrings: true`, so the server reads bare `"YYYY-MM-DD HH:mm:ss.SSS"` strings and promotes them to ISO 8601 (`"…Z"`) before they leave `db.ts`. Writes do the inverse, so JS `Date` → ISO → MySQL → ISO round-trips losslessly to the millisecond.

## Why JSON for `tags`

Tags are free-form strings on both epics and tasks. Modeling them as a separate `tags` table (and a many-to-many join) would solve query problems we don't have — a single user with a few dozen tags doesn't need indexed faceting. JSON columns keep the round-trip with the existing `string[]` type one line of code, and `JSON_CONTAINS` is available if we ever want to filter by tag in SQL.

---

## Field references

### Epic

| Field         | Type     | Required | Description                          |
| ------------- | -------- | -------- | ------------------------------------ |
| `id`          | string   | Yes      | `epic_<random>`                      |
| `title`       | string   | Yes      | Short display name                   |
| `description` | string   | No       | Markdown-supported overview          |
| `status`      | integer  | Yes      | `TaskStatus`: `0` Todo, `1` InProgress, `2` Done |
| `dueDate`     | ISO date | No       | `YYYY-MM-DD`                         |
| `tags`        | string[] | No       | Free-form labels                     |
| `createdAt`   | ISO 8601 | Yes      | Record creation                      |
| `updatedAt`   | ISO 8601 | Yes      | Last modification                    |

**Computed (not stored):** `estimatedHours`, `spentHours`, `progress`, `taskCount`.

### Task

| Field            | Type     | Required | Description                                  |
| ---------------- | -------- | -------- | -------------------------------------------- |
| `id`             | string   | Yes      | `task_<random>`                              |
| `epicId`         | string   | No       | Parent Epic; omit for standalone             |
| `title`          | string   | Yes      | Short display name                           |
| `notes`          | string   | No       | Markdown long-form                           |
| `status`         | integer  | Yes      | `TaskStatus`: `0` Todo, `1` InProgress, `2` Done |
| `priority`       | integer  | Yes      | `TaskPriority`: `0` Low, `1` Normal (default), `2` High |
| `dueDate`        | ISO date | No       | `YYYY-MM-DD`                                 |
| `estimatedHours` | number   | No       | Planned time budget                          |
| `progress`       | integer  | No       | `0–100`                                      |
| `tags`           | string[] | No       | Free-form labels                             |
| `timeBlocks`     | Block[]  | No       | Scheduled work sessions                      |
| `checklist`      | Item[]   | No       | Sub-steps `[{ id, text, done }]`             |
| `recurrence`     | object   | No       | `{ rule: RecurrenceRule, interval, until? }` — see below |
| `createdAt`      | ISO 8601 | Yes      | Record creation                              |
| `updatedAt`      | ISO 8601 | Yes      | Last modification                            |

**Computed (not stored):** `spentHours`, `checklistProgress`.

#### Recurrence

A recurring task carries its existing `timeBlocks` as **seeds**. The UI never auto-materializes future occurrences into the database — that would inflate `spentHours` with hours nobody actually logged. Instead, the dashboard projects ghost blocks within the visible window (daily = today, weekly = current week, monthly = the 6-week grid) by adding `interval × {day | week | month}` to each seed. Ghosts are dashed, lower-opacity, non-draggable, and never sent back to the server. To record an instance, the user runs the timer (or adds an explicit block) during that window — which appends a real, persisted block.

| Field      | Type     | Required | Description                                                  |
| ---------- | -------- | -------- | ------------------------------------------------------------ |
| `rule`     | integer  | Yes      | `RecurrenceRule`: `0` Daily, `1` Weekly, `2` Monthly         |
| `interval` | integer  | Yes      | `1` = every; `2` = every other; capped at 365                |
| `until`    | ISO date | No       | `YYYY-MM-DD`; no further occurrences are projected past this |

### Time Block

| Field        | Type     | Required | Description                          |
| ------------ | -------- | -------- | ------------------------------------ |
| `id`         | string   | Yes      | `block_<random>`                     |
| `start`      | ISO 8601 | Yes      | Block start datetime                 |
| `end`        | ISO 8601 | Yes      | Block end datetime                   |
| `spentHours` | number   | No       | Actual hours logged                  |

### Active Timer (top-level, optional)

| Field       | Type     | Required | Description                                       |
| ----------- | -------- | -------- | ------------------------------------------------- |
| `taskId`    | string   | Yes      | ID of the task currently being tracked            |
| `startedAt` | ISO 8601 | Yes      | When the timer started                            |

When `null` (or absent) no timer is active. On stop, a new TimeBlock is appended to the task's `timeBlocks` and `activeTimer` is cleared.

---

## Proposed schema extensions (Phase 8+)

These fields are documented here so the data model is forward-compatible. The current API ignores unknown fields gracefully (round-tripped untouched).

**TimeBlock:**

| Field    | Type     | Description                                                  |
| -------- | -------- | ------------------------------------------------------------ |
| `notes`  | string   | What actually happened during this block                     |
