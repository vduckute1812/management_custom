-- Durable background job queue (email, cache fan-out, future workers).
-- MySQL-backed so a single-node Pi deploy works without Redis.
-- Redis remains optional and is used only for the shared cache driver.

CREATE TABLE jobs (
  id            VARCHAR(64)  PRIMARY KEY,
  type          VARCHAR(64)  NOT NULL,
  payload       JSON         NOT NULL,
  status        VARCHAR(16)  NOT NULL DEFAULT 'pending',
  attempts      INT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts  INT UNSIGNED NOT NULL DEFAULT 5,
  available_at  DATETIME(3)  NOT NULL,
  locked_at     DATETIME(3)  NULL,
  locked_by     VARCHAR(64)  NULL,
  last_error    TEXT         NULL,
  created_at    DATETIME(3)  NOT NULL,
  updated_at    DATETIME(3)  NOT NULL,
  INDEX idx_jobs_claim (status, available_at, created_at),
  INDEX idx_jobs_type_status (type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
