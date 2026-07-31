-- Recompute posts.comment_count from post_comments.
--
-- Two prior bugs left the denormalized counter stale:
--   1. create/delete comment ran the INSERT/DELETE and the counter UPDATE as
--      separate pool queries (fixed in application code).
--   2. DELETE FROM users cascades the user's comments off other people's
--      posts without decrementing those posts' counters (fixed in deleteUser).
--
-- Idempotent: running twice yields the same counts.

UPDATE posts p
SET comment_count = (
  SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id
);
