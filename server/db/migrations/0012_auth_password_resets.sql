-- One-shot opaque tokens for password reset emails.
-- Same threat model as auth_email_verifications: only SHA-256 hashes are stored.

CREATE TABLE auth_password_resets (
  id           VARCHAR(64) PRIMARY KEY,
  user_id      VARCHAR(64) NOT NULL,
  token_hash   CHAR(64)    NOT NULL,
  expires_at   DATETIME(3) NOT NULL,
  consumed_at  DATETIME(3) NULL,
  created_at   DATETIME(3) NOT NULL,
  UNIQUE KEY uniq_reset_token_hash (token_hash),
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_reset_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
