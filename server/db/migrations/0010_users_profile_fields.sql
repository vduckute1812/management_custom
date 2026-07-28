-- Profile fields editable by the account owner: avatar (upload id),
-- display title, job, and location. Avatar points at `uploads.id` so
-- existing R2 + ACL plumbing serves the image; orphan purge and upload
-- ACL treat avatar references as live.

ALTER TABLE users
  ADD COLUMN avatar_upload_id VARCHAR(64) NULL AFTER name,
  ADD COLUMN title VARCHAR(120) NULL AFTER avatar_upload_id,
  ADD COLUMN job VARCHAR(120) NULL AFTER title,
  ADD COLUMN location VARCHAR(120) NULL AFTER job,
  ADD CONSTRAINT fk_users_avatar_upload
    FOREIGN KEY (avatar_upload_id) REFERENCES uploads(id) ON DELETE SET NULL;
