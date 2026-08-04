-- Automated content pipeline: fetched + AI-rewritten articles awaiting admin review.
-- status: Draft=0, PendingApproval=1, Approved=2, Rejected=3 (TINYINT UNSIGNED).
-- url_hash is SHA-256 hex of the normalized original_url for cheap unique dedupe.

CREATE TABLE pending_articles (
  id                  VARCHAR(64)   PRIMARY KEY,
  original_title      VARCHAR(512)  NOT NULL,
  original_url        VARCHAR(2048) NOT NULL,
  url_hash            CHAR(64)      NOT NULL,
  source_name         VARCHAR(255)  NOT NULL,
  category_id         VARCHAR(64)   NULL,
  raw_content         MEDIUMTEXT    NOT NULL,
  rewritten_title     VARCHAR(512)  NULL,
  rewritten_content   MEDIUMTEXT    NULL,
  excerpt             TEXT          NULL,
  status              TINYINT UNSIGNED NOT NULL DEFAULT 0,
  published_post_id   VARCHAR(64)   NULL,
  source_published_at DATETIME(3)   NULL,
  created_at          DATETIME(3)   NOT NULL,
  updated_at          DATETIME(3)   NOT NULL,
  published_at        DATETIME(3)   NULL,
  UNIQUE KEY uniq_pending_articles_url_hash (url_hash),
  INDEX idx_pending_articles_status_created (status, created_at),
  INDEX idx_pending_articles_category (category_id),
  INDEX idx_pending_articles_published_post (published_post_id),
  CONSTRAINT fk_pending_articles_category
    FOREIGN KEY (category_id) REFERENCES post_categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_pending_articles_post
    FOREIGN KEY (published_post_id) REFERENCES posts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
