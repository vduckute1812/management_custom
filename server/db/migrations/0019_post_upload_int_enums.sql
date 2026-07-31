-- Convert posts.visibility, posts.format, uploads.kind, and
-- post_attachments.kind from string / MySQL ENUM tokens to TINYINT UNSIGNED.
--
-- PostVisibility: Public=0, Private=1, Shared=2
-- PostFormat:     Update=0, Manuscript=1
-- UploadKind:     Image=0, Document=1, Audio=2
--
-- post_attachments.kind is widened to the same UploadKind domain as uploads
-- (audio remains chat-only in application code; posts still attach image/document).

-- posts.visibility -------------------------------------------------------
ALTER TABLE posts
  ADD COLUMN visibility_int TINYINT UNSIGNED NULL AFTER visibility;

UPDATE posts
SET visibility_int = CASE visibility
  WHEN 'public' THEN 0
  WHEN 'private' THEN 1
  WHEN 'shared' THEN 2
  ELSE 0
END;

ALTER TABLE posts
  MODIFY COLUMN visibility_int TINYINT UNSIGNED NOT NULL DEFAULT 0;

ALTER TABLE posts
  DROP COLUMN visibility;

ALTER TABLE posts
  CHANGE COLUMN visibility_int visibility TINYINT UNSIGNED NOT NULL DEFAULT 0;

-- posts.format -----------------------------------------------------------
ALTER TABLE posts
  ADD COLUMN format_int TINYINT UNSIGNED NULL AFTER format;

UPDATE posts
SET format_int = CASE format
  WHEN 'update' THEN 0
  WHEN 'manuscript' THEN 1
  ELSE 0
END;

ALTER TABLE posts
  MODIFY COLUMN format_int TINYINT UNSIGNED NOT NULL DEFAULT 0;

ALTER TABLE posts
  DROP COLUMN format;

ALTER TABLE posts
  CHANGE COLUMN format_int format TINYINT UNSIGNED NOT NULL DEFAULT 0;

-- Recreate the format+created_at index dropped with the VARCHAR column.
ALTER TABLE posts
  ADD INDEX idx_posts_format_created (format, created_at);

-- uploads.kind -----------------------------------------------------------
ALTER TABLE uploads
  ADD COLUMN kind_int TINYINT UNSIGNED NULL AFTER kind;

UPDATE uploads
SET kind_int = CASE kind
  WHEN 'image' THEN 0
  WHEN 'document' THEN 1
  WHEN 'audio' THEN 2
  ELSE 0
END;

ALTER TABLE uploads
  MODIFY COLUMN kind_int TINYINT UNSIGNED NOT NULL;

ALTER TABLE uploads
  DROP COLUMN kind;

ALTER TABLE uploads
  CHANGE COLUMN kind_int kind TINYINT UNSIGNED NOT NULL;

-- post_attachments.kind --------------------------------------------------
ALTER TABLE post_attachments
  ADD COLUMN kind_int TINYINT UNSIGNED NULL AFTER kind;

UPDATE post_attachments
SET kind_int = CASE kind
  WHEN 'image' THEN 0
  WHEN 'document' THEN 1
  WHEN 'audio' THEN 2
  ELSE 0
END;

ALTER TABLE post_attachments
  MODIFY COLUMN kind_int TINYINT UNSIGNED NOT NULL;

ALTER TABLE post_attachments
  DROP COLUMN kind;

ALTER TABLE post_attachments
  CHANGE COLUMN kind_int kind TINYINT UNSIGNED NOT NULL;
