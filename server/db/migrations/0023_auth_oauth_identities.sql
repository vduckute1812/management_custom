-- Google OAuth (+ future providers): nullable password for OAuth-only users,
-- and auth_identities linking a provider subject to a local user.
--
-- AuthProvider: Google=0

ALTER TABLE users
  MODIFY COLUMN password_hash VARCHAR(255) NULL;

CREATE TABLE auth_identities (
  id                VARCHAR(64)  NOT NULL,
  user_id           VARCHAR(64)  NOT NULL,
  provider          TINYINT UNSIGNED NOT NULL,
  provider_subject  VARCHAR(255) NOT NULL,
  provider_email    VARCHAR(320) NULL,
  created_at        DATETIME(3)  NOT NULL,
  updated_at        DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_auth_identities_provider_subject (provider, provider_subject),
  UNIQUE KEY uniq_auth_identities_user_provider (user_id, provider),
  CONSTRAINT fk_auth_identities_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_auth_identities_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
