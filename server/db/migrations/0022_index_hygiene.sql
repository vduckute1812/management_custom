-- Index hygiene + structural uniqueness for chat media reuse.
--
-- Add:
--   posts (category_id, created_at) — category-filtered feed ORDER BY created_at
--   time_blocks (end_at)            — admin dashboard GROUP BY DATE(end_at)
--
-- Drop (redundant / unused):
--   idx_posts_translation_group — left prefix of uq_posts_group_locale
--   idx_users_role              — no query filters users by role
--   idx_posts_format_created    — no live query leads with format
--   idx_chat_conversations_user_a — left prefix of uniq_chat_pair
--
-- Replace idx_chat_messages_upload with UNIQUE(upload_id): one upload may
-- attach to at most one chat message (nullable UNIQUE still allows many NULLs).
--
-- Idempotent via information_schema guards.

-- posts (category_id, created_at) ----------------------------------------
SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'posts'
     AND INDEX_NAME = 'idx_posts_category_created'
);
SET @sql := IF(
  @idx = 0,
  'ALTER TABLE posts ADD INDEX idx_posts_category_created (category_id, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Drop the single-column category index once the composite exists (same leading
-- column; keeping both wastes write cost).
SET @idx_old := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'posts'
     AND INDEX_NAME = 'idx_posts_category'
);
SET @idx_new := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'posts'
     AND INDEX_NAME = 'idx_posts_category_created'
);
SET @sql := IF(
  @idx_old > 0 AND @idx_new > 0,
  'ALTER TABLE posts DROP INDEX idx_posts_category',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- time_blocks (end_at) ---------------------------------------------------
SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'time_blocks'
     AND INDEX_NAME = 'idx_blocks_end'
);
SET @sql := IF(
  @idx = 0,
  'ALTER TABLE time_blocks ADD INDEX idx_blocks_end (end_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Drop redundant / unused indexes ----------------------------------------
SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'posts'
     AND INDEX_NAME = 'idx_posts_translation_group'
);
SET @sql := IF(
  @idx > 0,
  'ALTER TABLE posts DROP INDEX idx_posts_translation_group',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'users'
     AND INDEX_NAME = 'idx_users_role'
);
SET @sql := IF(
  @idx > 0,
  'ALTER TABLE users DROP INDEX idx_users_role',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'posts'
     AND INDEX_NAME = 'idx_posts_format_created'
);
SET @sql := IF(
  @idx > 0,
  'ALTER TABLE posts DROP INDEX idx_posts_format_created',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'chat_conversations'
     AND INDEX_NAME = 'idx_chat_conversations_user_a'
);
SET @sql := IF(
  @idx > 0,
  'ALTER TABLE chat_conversations DROP INDEX idx_chat_conversations_user_a',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- chat_messages.upload_id UNIQUE ----------------------------------------
SET @idx_old := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'chat_messages'
     AND INDEX_NAME = 'idx_chat_messages_upload'
);
SET @sql := IF(
  @idx_old > 0,
  'ALTER TABLE chat_messages DROP INDEX idx_chat_messages_upload',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_uq := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'chat_messages'
     AND INDEX_NAME = 'uniq_chat_messages_upload'
);
SET @sql := IF(
  @idx_uq = 0,
  'ALTER TABLE chat_messages ADD UNIQUE KEY uniq_chat_messages_upload (upload_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
