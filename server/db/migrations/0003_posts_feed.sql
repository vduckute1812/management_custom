-- Shared social feed (Facebook-style posts within the install).
--
-- Posts are visible to every authenticated user. Likes are unique per
-- (post, user). Comments belong to a post. A share creates a new post
-- that points at the original via shared_post_id.

CREATE TABLE posts (
  id              VARCHAR(64) PRIMARY KEY,
  user_id         VARCHAR(64) NOT NULL,
  body            TEXT        NOT NULL,
  shared_post_id  VARCHAR(64) NULL,
  created_at      DATETIME(3) NOT NULL,
  updated_at      DATETIME(3) NOT NULL,
  CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_posts_shared FOREIGN KEY (shared_post_id) REFERENCES posts(id) ON DELETE SET NULL,
  INDEX idx_posts_created (created_at),
  INDEX idx_posts_user (user_id),
  INDEX idx_posts_shared (shared_post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE post_likes (
  post_id     VARCHAR(64) NOT NULL,
  user_id     VARCHAR(64) NOT NULL,
  created_at  DATETIME(3) NOT NULL,
  PRIMARY KEY (post_id, user_id),
  CONSTRAINT fk_post_likes_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_post_likes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_post_likes_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE post_comments (
  id          VARCHAR(64) PRIMARY KEY,
  post_id     VARCHAR(64) NOT NULL,
  user_id     VARCHAR(64) NOT NULL,
  body        TEXT        NOT NULL,
  created_at  DATETIME(3) NOT NULL,
  updated_at  DATETIME(3) NOT NULL,
  CONSTRAINT fk_post_comments_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_post_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_post_comments_post (post_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
