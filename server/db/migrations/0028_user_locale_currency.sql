-- Per-user UI locale (emails) + Money display currency.
-- locale: BCP-47 tag (en / vi / zh-CN / zh-TW) — open tag set, not an enum.
-- money_currency: TINYINT MoneyCurrency — VND=0, USD=1, CNY=2, TWD=3.
-- Existing rows keep VND; new signups get currency from their locale.
-- Idempotent: safe to re-run after a partial apply.

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'locale'
    ),
    'SELECT 1',
    'ALTER TABLE users ADD COLUMN locale VARCHAR(16) NOT NULL DEFAULT ''en'' AFTER location'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'money_currency'
    ),
    'SELECT 1',
    'ALTER TABLE users ADD COLUMN money_currency TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER locale'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- CHECK constraint (MySQL 8.0.16+). Skip when already present.
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND CONSTRAINT_NAME = 'chk_users_money_currency'
    ),
    'SELECT 1',
    'ALTER TABLE users ADD CONSTRAINT chk_users_money_currency CHECK (money_currency IN (0, 1, 2, 3))'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
