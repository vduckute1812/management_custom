-- Feed social upgrades: visibility ACL, multi-reactions, attachments, 24h stories.

ALTER TABLE posts
  ADD COLUMN visibility ENUM('public', 'private', 'shared') NOT NULL DEFAULT 'public'
    AFTER body;

CREATE TABLE post_audience (
  post_id     VARCHAR(64) NOT NULL,
  user_id     VARCHAR(64) NOT NULL,
  created_at  DATETIME(3) NOT NULL,
  PRIMARY KEY (post_id, user_id),
  CONSTRAINT fk_post_audience_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_post_audience_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_post_audience_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE post_reactions (
  post_id     VARCHAR(64) NOT NULL,
  user_id     VARCHAR(64) NOT NULL,
  reaction    ENUM('like', 'love', 'haha', 'wow', 'sad', 'angry') NOT NULL,
  created_at  DATETIME(3) NOT NULL,
  PRIMARY KEY (post_id, user_id),
  CONSTRAINT fk_post_reactions_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_post_reactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_post_reactions_post (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO post_reactions (post_id, user_id, reaction, created_at)
SELECT post_id, user_id, 'like', created_at FROM post_likes;

DROP TABLE post_likes;

CREATE TABLE uploads (
  id           VARCHAR(64) PRIMARY KEY,
  user_id      VARCHAR(64) NOT NULL,
  file_name    VARCHAR(255) NOT NULL,
  mime         VARCHAR(128) NOT NULL,
  kind         ENUM('image', 'document') NOT NULL,
  size_bytes   INT UNSIGNED NOT NULL,
  storage_key  VARCHAR(512) NOT NULL,
  created_at   DATETIME(3) NOT NULL,
  CONSTRAINT fk_uploads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_uploads_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE post_attachments (
  id           VARCHAR(64) PRIMARY KEY,
  post_id      VARCHAR(64) NOT NULL,
  upload_id    VARCHAR(64) NOT NULL,
  kind         ENUM('image', 'document') NOT NULL,
  file_name    VARCHAR(255) NOT NULL,
  mime         VARCHAR(128) NOT NULL,
  size_bytes   INT UNSIGNED NOT NULL,
  storage_key  VARCHAR(512) NOT NULL,
  created_at   DATETIME(3) NOT NULL,
  CONSTRAINT fk_post_attachments_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_post_attachments_upload FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE,
  INDEX idx_post_attachments_post (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stories (
  id                 VARCHAR(64) PRIMARY KEY,
  user_id            VARCHAR(64) NOT NULL,
  body               TEXT NULL,
  upload_id          VARCHAR(64) NULL,
  media_storage_key  VARCHAR(512) NULL,
  mime               VARCHAR(128) NULL,
  created_at         DATETIME(3) NOT NULL,
  expires_at         DATETIME(3) NOT NULL,
  CONSTRAINT fk_stories_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_stories_upload FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE SET NULL,
  INDEX idx_stories_expires (expires_at),
  INDEX idx_stories_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE story_views (
  story_id   VARCHAR(64) NOT NULL,
  user_id    VARCHAR(64) NOT NULL,
  viewed_at  DATETIME(3) NOT NULL,
  PRIMARY KEY (story_id, user_id),
  CONSTRAINT fk_story_views_story FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
  CONSTRAINT fk_story_views_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
