-- Convert posts.visibility, posts.format, uploads.kind, and
-- post_attachments.kind from string / MySQL ENUM tokens to TINYINT UNSIGNED.
--
-- PostVisibility: Public=0, Private=1, Shared=2
-- PostFormat:     Update=0, Manuscript=1
-- UploadKind:     Image=0, Document=1, Audio=2
--
-- Idempotent: a prior failed run can leave visibility/format already as
-- TINYINT while uploads.kind is still ENUM, and can leave
-- idx_posts_format_created as a leftover (created_at)-only index after
-- DROP COLUMN format (MySQL keeps the index name when other columns remain).

-- posts.visibility -------------------------------------------------------
SET @vis_type := (
  SELECT DATA_TYPE FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'posts'
     AND COLUMN_NAME = 'visibility'
   LIMIT 1
);
SET @vis_int_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'posts'
     AND COLUMN_NAME = 'visibility_int'
);

-- Fresh string/enum column → add + backfill + swap.
SET @sql := IF(
  @vis_type IN ('enum', 'varchar', 'char', 'text') AND @vis_int_exists = 0,
  'ALTER TABLE posts ADD COLUMN visibility_int TINYINT UNSIGNED NULL AFTER visibility',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @vis_int_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'posts'
     AND COLUMN_NAME = 'visibility_int'
);
SET @sql := IF(
  @vis_type IN ('enum', 'varchar', 'char', 'text') AND @vis_int_exists > 0,
  'UPDATE posts SET visibility_int = CASE visibility
     WHEN ''public'' THEN 0 WHEN ''private'' THEN 1 WHEN ''shared'' THEN 2 ELSE 0 END',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @vis_type IN ('enum', 'varchar', 'char', 'text') AND @vis_int_exists > 0,
  'ALTER TABLE posts MODIFY COLUMN visibility_int TINYINT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @vis_type IN ('enum', 'varchar', 'char', 'text') AND @vis_int_exists > 0,
  'ALTER TABLE posts DROP COLUMN visibility',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @vis_int_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'posts'
     AND COLUMN_NAME = 'visibility_int'
);
SET @sql := IF(
  @vis_int_exists > 0,
  'ALTER TABLE posts CHANGE COLUMN visibility_int visibility TINYINT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- posts.format -----------------------------------------------------------
SET @fmt_type := (
  SELECT DATA_TYPE FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'posts'
     AND COLUMN_NAME = 'format'
   LIMIT 1
);
SET @fmt_int_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'posts'
     AND COLUMN_NAME = 'format_int'
);

SET @sql := IF(
  @fmt_type IN ('enum', 'varchar', 'char', 'text') AND @fmt_int_exists = 0,
  'ALTER TABLE posts ADD COLUMN format_int TINYINT UNSIGNED NULL AFTER format',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fmt_int_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'posts'
     AND COLUMN_NAME = 'format_int'
);
SET @sql := IF(
  @fmt_type IN ('enum', 'varchar', 'char', 'text') AND @fmt_int_exists > 0,
  'UPDATE posts SET format_int = CASE format
     WHEN ''update'' THEN 0 WHEN ''manuscript'' THEN 1 ELSE 0 END',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @fmt_type IN ('enum', 'varchar', 'char', 'text') AND @fmt_int_exists > 0,
  'ALTER TABLE posts MODIFY COLUMN format_int TINYINT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Drop the old format index *before* dropping the VARCHAR column. If a prior
-- run already dropped `format`, MySQL may have left idx_posts_format_created
-- as a (created_at)-only index under the same name — drop that too.
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'posts'
     AND INDEX_NAME = 'idx_posts_format_created'
);
SET @sql := IF(
  @idx_exists > 0,
  'ALTER TABLE posts DROP INDEX idx_posts_format_created',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @fmt_type IN ('enum', 'varchar', 'char', 'text') AND @fmt_int_exists > 0,
  'ALTER TABLE posts DROP COLUMN format',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fmt_int_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'posts'
     AND COLUMN_NAME = 'format_int'
);
SET @sql := IF(
  @fmt_int_exists > 0,
  'ALTER TABLE posts CHANGE COLUMN format_int format TINYINT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Recreate the composite index on the integer format column.
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'posts'
     AND INDEX_NAME = 'idx_posts_format_created'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE posts ADD INDEX idx_posts_format_created (format, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- uploads.kind -----------------------------------------------------------
SET @up_kind_type := (
  SELECT DATA_TYPE FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'uploads'
     AND COLUMN_NAME = 'kind'
   LIMIT 1
);
SET @up_kind_int_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'uploads'
     AND COLUMN_NAME = 'kind_int'
);

SET @sql := IF(
  @up_kind_type IN ('enum', 'varchar', 'char', 'text') AND @up_kind_int_exists = 0,
  'ALTER TABLE uploads ADD COLUMN kind_int TINYINT UNSIGNED NULL AFTER kind',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @up_kind_int_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'uploads'
     AND COLUMN_NAME = 'kind_int'
);
SET @sql := IF(
  @up_kind_type IN ('enum', 'varchar', 'char', 'text') AND @up_kind_int_exists > 0,
  'UPDATE uploads SET kind_int = CASE kind
     WHEN ''image'' THEN 0 WHEN ''document'' THEN 1 WHEN ''audio'' THEN 2 ELSE 0 END',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @up_kind_type IN ('enum', 'varchar', 'char', 'text') AND @up_kind_int_exists > 0,
  'ALTER TABLE uploads MODIFY COLUMN kind_int TINYINT UNSIGNED NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @up_kind_type IN ('enum', 'varchar', 'char', 'text') AND @up_kind_int_exists > 0,
  'ALTER TABLE uploads DROP COLUMN kind',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @up_kind_int_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'uploads'
     AND COLUMN_NAME = 'kind_int'
);
SET @sql := IF(
  @up_kind_int_exists > 0,
  'ALTER TABLE uploads CHANGE COLUMN kind_int kind TINYINT UNSIGNED NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- post_attachments.kind --------------------------------------------------
SET @pa_kind_type := (
  SELECT DATA_TYPE FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'post_attachments'
     AND COLUMN_NAME = 'kind'
   LIMIT 1
);
SET @pa_kind_int_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'post_attachments'
     AND COLUMN_NAME = 'kind_int'
);

SET @sql := IF(
  @pa_kind_type IN ('enum', 'varchar', 'char', 'text') AND @pa_kind_int_exists = 0,
  'ALTER TABLE post_attachments ADD COLUMN kind_int TINYINT UNSIGNED NULL AFTER kind',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @pa_kind_int_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'post_attachments'
     AND COLUMN_NAME = 'kind_int'
);
SET @sql := IF(
  @pa_kind_type IN ('enum', 'varchar', 'char', 'text') AND @pa_kind_int_exists > 0,
  'UPDATE post_attachments SET kind_int = CASE kind
     WHEN ''image'' THEN 0 WHEN ''document'' THEN 1 WHEN ''audio'' THEN 2 ELSE 0 END',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @pa_kind_type IN ('enum', 'varchar', 'char', 'text') AND @pa_kind_int_exists > 0,
  'ALTER TABLE post_attachments MODIFY COLUMN kind_int TINYINT UNSIGNED NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @pa_kind_type IN ('enum', 'varchar', 'char', 'text') AND @pa_kind_int_exists > 0,
  'ALTER TABLE post_attachments DROP COLUMN kind',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @pa_kind_int_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'post_attachments'
     AND COLUMN_NAME = 'kind_int'
);
SET @sql := IF(
  @pa_kind_int_exists > 0,
  'ALTER TABLE post_attachments CHANGE COLUMN kind_int kind TINYINT UNSIGNED NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
