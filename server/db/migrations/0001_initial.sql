-- Initial schema.
--
-- Every enum-shaped column is `TINYINT UNSIGNED`, not a SQL ENUM.
-- See implement/database.md "Why integer enums" for the rationale and
-- server/db/types.ts for the int↔string translation helpers used at the
-- app boundary. The mappings (and the DEFAULTs below) are:
--     users.role            normal=0,  admin=1
--     epics.status          todo=0,    in-progress=1,  done=2
--     tasks.status          todo=0,    in-progress=1,  done=2
--     tasks.priority        low=0,     normal=1,       high=2     (higher = more important)
--     tasks.recurrence_rule daily=0,   weekly=1,       monthly=2  (NULL = non-recurring)

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
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_refresh_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_email_verifications (
  id           VARCHAR(64) PRIMARY KEY,
  user_id      VARCHAR(64) NOT NULL,
  token_hash   CHAR(64)    NOT NULL,
  expires_at   DATETIME(3) NOT NULL,
  consumed_at  DATETIME(3) NULL,
  created_at   DATETIME(3) NOT NULL,
  UNIQUE KEY uniq_verify_token_hash (token_hash),
  CONSTRAINT fk_verify_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_verify_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  CONSTRAINT fk_epics_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_epics_user (user_id),
  INDEX idx_epics_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tasks_epic FOREIGN KEY (epic_id) REFERENCES epics(id) ON DELETE SET NULL,
  INDEX idx_tasks_user (user_id),
  INDEX idx_tasks_epic (epic_id),
  INDEX idx_tasks_status (status),
  INDEX idx_tasks_due (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE time_blocks (
  id           VARCHAR(64) PRIMARY KEY,
  task_id      VARCHAR(64) NOT NULL,
  start_at     DATETIME(3) NOT NULL,
  end_at       DATETIME(3) NOT NULL,
  spent_hours  DECIMAL(8,2) NULL,
  CONSTRAINT fk_blocks_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  INDEX idx_blocks_task (task_id),
  INDEX idx_blocks_start (start_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE checklist_items (
  id        VARCHAR(64) PRIMARY KEY,
  task_id   VARCHAR(64) NOT NULL,
  text      VARCHAR(2000) NOT NULL,
  done      TINYINT(1) NOT NULL DEFAULT 0,
  position  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_checklist_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  INDEX idx_checklist_task (task_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-user singleton: one row per user keyed by user_id so two users
-- can run timers concurrently without stepping on each other.
CREATE TABLE active_timer (
  user_id     VARCHAR(64) NOT NULL,
  task_id     VARCHAR(64) NOT NULL,
  started_at  DATETIME(3) NOT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_timer_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_timer_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
