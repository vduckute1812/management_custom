-- Track the last successful sign-in per user, so the admin dashboard
-- can distinguish "actively logging time" (max time_blocks.end_at) from
-- "has actually opened the app recently" (this column).
--
-- NULL on existing rows means "never signed in since this column existed";
-- the seed account stays NULL until its first interactive login. The login
-- endpoint stamps NOW(3) here on every successful credentials check.

ALTER TABLE users
  ADD COLUMN last_login_at DATETIME(3) NULL AFTER updated_at;
