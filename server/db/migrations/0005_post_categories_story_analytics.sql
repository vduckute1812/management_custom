-- Post categories, optional rich-text style fields, and story reactions/analytics.

CREATE TABLE post_categories (
  id          VARCHAR(64) PRIMARY KEY,
  slug        VARCHAR(64) NOT NULL,
  name        VARCHAR(120) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  DATETIME(3) NOT NULL,
  UNIQUE KEY uq_post_categories_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO post_categories (id, slug, name, sort_order, created_at) VALUES
  ('cat_general', 'general', 'General', 10, UTC_TIMESTAMP(3)),
  ('cat_math', 'math', 'Math', 20, UTC_TIMESTAMP(3)),
  ('cat_announcements', 'announcements', 'Announcements', 30, UTC_TIMESTAMP(3)),
  ('cat_docs', 'docs', 'Documents', 40, UTC_TIMESTAMP(3)),
  ('cat_ideas', 'ideas', 'Ideas', 50, UTC_TIMESTAMP(3));

ALTER TABLE posts
  ADD COLUMN category_id VARCHAR(64) NULL AFTER visibility,
  ADD COLUMN font_family VARCHAR(64) NULL AFTER category_id,
  ADD COLUMN text_color VARCHAR(32) NULL AFTER font_family,
  ADD CONSTRAINT fk_posts_category
    FOREIGN KEY (category_id) REFERENCES post_categories(id) ON DELETE SET NULL,
  ADD INDEX idx_posts_category (category_id);

CREATE TABLE story_reactions (
  story_id    VARCHAR(64) NOT NULL,
  user_id     VARCHAR(64) NOT NULL,
  reaction    ENUM('like', 'love', 'haha', 'wow', 'sad', 'angry') NOT NULL,
  created_at  DATETIME(3) NOT NULL,
  PRIMARY KEY (story_id, user_id),
  CONSTRAINT fk_story_reactions_story FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
  CONSTRAINT fk_story_reactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_story_reactions_story (story_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
