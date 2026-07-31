-- Convert jobs.status from VARCHAR string tokens to TINYINT UNSIGNED.
--
-- JobStatus: Pending=0, Processing=1, Completed=2, Dead=3
-- The legacy TS union also listed "failed", but no code path ever wrote it
-- (failJob only writes pending or dead) — dropped.
--
-- Idempotent: information_schema guards so a partial prior run can resume.

SET @status_type := (
  SELECT DATA_TYPE FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'jobs'
     AND COLUMN_NAME = 'status'
   LIMIT 1
);
SET @status_int_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'jobs'
     AND COLUMN_NAME = 'status_int'
);

SET @sql := IF(
  @status_type IN ('enum', 'varchar', 'char', 'text') AND @status_int_exists = 0,
  'ALTER TABLE jobs ADD COLUMN status_int TINYINT UNSIGNED NULL AFTER status',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @status_int_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'jobs'
     AND COLUMN_NAME = 'status_int'
);
SET @sql := IF(
  @status_type IN ('enum', 'varchar', 'char', 'text') AND @status_int_exists > 0,
  'UPDATE jobs SET status_int = CASE status
     WHEN ''pending'' THEN 0
     WHEN ''processing'' THEN 1
     WHEN ''completed'' THEN 2
     WHEN ''dead'' THEN 3
     WHEN ''failed'' THEN 3
     ELSE 0 END',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @status_type IN ('enum', 'varchar', 'char', 'text') AND @status_int_exists > 0,
  'ALTER TABLE jobs MODIFY COLUMN status_int TINYINT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Drop indexes that lead with `status` before dropping the string column;
-- MySQL would otherwise leave broken index definitions behind.
SET @idx_claim := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'jobs'
     AND INDEX_NAME = 'idx_jobs_claim'
);
SET @sql := IF(
  @status_type IN ('enum', 'varchar', 'char', 'text') AND @idx_claim > 0,
  'ALTER TABLE jobs DROP INDEX idx_jobs_claim',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_type := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'jobs'
     AND INDEX_NAME = 'idx_jobs_type_status'
);
SET @sql := IF(
  @status_type IN ('enum', 'varchar', 'char', 'text') AND @idx_type > 0,
  'ALTER TABLE jobs DROP INDEX idx_jobs_type_status',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @status_type IN ('enum', 'varchar', 'char', 'text') AND @status_int_exists > 0,
  'ALTER TABLE jobs DROP COLUMN status',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @status_int_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'jobs'
     AND COLUMN_NAME = 'status_int'
);
SET @sql := IF(
  @status_int_exists > 0,
  'ALTER TABLE jobs CHANGE COLUMN status_int status TINYINT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Recreate indexes on the integer column (skip if already present).
SET @idx_claim := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'jobs'
     AND INDEX_NAME = 'idx_jobs_claim'
);
SET @sql := IF(
  @idx_claim = 0,
  'ALTER TABLE jobs ADD INDEX idx_jobs_claim (status, available_at, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_type := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'jobs'
     AND INDEX_NAME = 'idx_jobs_type_status'
);
SET @sql := IF(
  @idx_type = 0,
  'ALTER TABLE jobs ADD INDEX idx_jobs_type_status (type, status)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
