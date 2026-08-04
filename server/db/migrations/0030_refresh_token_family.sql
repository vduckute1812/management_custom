-- Refresh-token families for reuse detection.
-- Each login starts a family_id; rotation keeps the same family. Presenting a
-- already-revoked token in a family revokes the whole family (stolen refresh).
-- Existing rows become singleton families (family_id = id).

ALTER TABLE auth_refresh_tokens
  ADD COLUMN family_id VARCHAR(64) NULL AFTER user_id;

UPDATE auth_refresh_tokens
   SET family_id = id
 WHERE family_id IS NULL;

ALTER TABLE auth_refresh_tokens
  MODIFY family_id VARCHAR(64) NOT NULL,
  ADD INDEX idx_refresh_family (family_id);
