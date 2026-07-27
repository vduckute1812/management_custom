-- First-class content formats for the feed.
--   update     — short social post (default)
--   manuscript — long-form writing (essays, thesis chapters, research notes)
-- Manuscripts carry an optional display title used in article-style cards.

ALTER TABLE posts
  ADD COLUMN format VARCHAR(32) NOT NULL DEFAULT 'update'
    AFTER body,
  ADD COLUMN title VARCHAR(255) NULL
    AFTER format;

ALTER TABLE posts
  ADD INDEX idx_posts_format_created (format, created_at);
