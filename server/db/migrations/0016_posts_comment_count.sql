-- Denormalized comment counts for cheap feed list queries.

ALTER TABLE posts
  ADD COLUMN comment_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER updated_at;

UPDATE posts p
SET p.comment_count = (
  SELECT COUNT(*)
  FROM post_comments pc
  WHERE pc.post_id = p.id
);
