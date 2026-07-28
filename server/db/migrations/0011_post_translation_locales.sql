-- Multilingual manuscripts: one post row per locale, linked by translation group.
-- Short updates stay monolingual (content_locale still stored; group usually null).

ALTER TABLE posts
  ADD COLUMN translation_group_id VARCHAR(64) NULL
    AFTER shared_post_id,
  ADD COLUMN content_locale VARCHAR(16) NOT NULL DEFAULT 'und'
    AFTER translation_group_id;

ALTER TABLE posts
  ADD INDEX idx_posts_translation_group (translation_group_id),
  ADD UNIQUE KEY uq_posts_group_locale (translation_group_id, content_locale);
