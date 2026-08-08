-- Public / visibility-filtered feed: equality on visibility + ORDER BY created_at, id.
-- Complements idx_posts_created (created_at only) and idx_posts_category_created.

SET @db := DATABASE();

SET @exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'posts'
    AND INDEX_NAME = 'idx_posts_visibility_created'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE posts ADD INDEX idx_posts_visibility_created (visibility, created_at, id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
