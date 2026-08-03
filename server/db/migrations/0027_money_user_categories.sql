-- Money user-defined categories + attach to ledger/budgets.
-- Built-in MoneyCategory (0–10) stays as TINYINT; custom rows are open-ended
-- entities (name/emoji/color are presentational strings, not enums).
-- MoneyDirection on user categories: Out=0, In=1.
--
-- Idempotent: safe to re-run after a partial apply (e.g. index rename clash
-- with 0024's idx_money_tx_user_category on (user_id, category)).

CREATE TABLE IF NOT EXISTS money_user_categories (
  id          VARCHAR(64)  NOT NULL,
  user_id     VARCHAR(64)  NOT NULL,
  name        VARCHAR(120) NOT NULL,
  emoji       VARCHAR(32)  NOT NULL DEFAULT '📌',
  color       VARCHAR(16)  NOT NULL DEFAULT '#94a3b8',
  direction   TINYINT UNSIGNED NOT NULL,
  sort_order  INT UNSIGNED NOT NULL DEFAULT 0,
  archived_at DATETIME(3)  NULL,
  created_at  DATETIME(3)  NOT NULL,
  updated_at  DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_money_user_category_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_money_user_category_direction CHECK (direction IN (0, 1)),
  UNIQUE KEY uq_money_user_category_owner_id (user_id, id),
  INDEX idx_money_user_category_list (user_id, archived_at, direction, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ledger: add user_category_id if missing.
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'money_transactions'
        AND COLUMN_NAME = 'user_category_id'
    ),
    'SELECT 1',
    'ALTER TABLE money_transactions ADD COLUMN user_category_id VARCHAR(64) NULL AFTER category'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE money_transactions
  MODIFY COLUMN category TINYINT UNSIGNED NULL;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'money_transactions'
        AND CONSTRAINT_NAME = 'fk_money_tx_user_category'
    ),
    'SELECT 1',
    'ALTER TABLE money_transactions ADD CONSTRAINT fk_money_tx_user_category FOREIGN KEY (user_id, user_category_id) REFERENCES money_user_categories (user_id, id) ON DELETE RESTRICT'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'money_transactions'
        AND CONSTRAINT_NAME = 'chk_money_tx_category_xor'
    ),
    'SELECT 1',
    'ALTER TABLE money_transactions ADD CONSTRAINT chk_money_tx_category_xor CHECK ((category IS NOT NULL AND user_category_id IS NULL) OR (category IS NULL AND user_category_id IS NOT NULL))'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Distinct from 0024's idx_money_tx_user_category (user_id, category).
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'money_transactions'
        AND INDEX_NAME = 'idx_money_tx_user_cat_id'
    ),
    'SELECT 1',
    'ALTER TABLE money_transactions ADD INDEX idx_money_tx_user_cat_id (user_id, user_category_id)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Budgets: drop old unique / generated column / check when present.
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'money_budgets'
        AND INDEX_NAME = 'uniq_money_budget_slot'
    ),
    'ALTER TABLE money_budgets DROP INDEX uniq_money_budget_slot',
    'SELECT 1'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'money_budgets'
        AND COLUMN_NAME = 'category_uniq'
    ),
    'ALTER TABLE money_budgets DROP COLUMN category_uniq',
    'SELECT 1'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'money_budgets'
        AND CONSTRAINT_NAME = 'chk_money_budget_scope'
    ),
    'ALTER TABLE money_budgets DROP CONSTRAINT chk_money_budget_scope',
    'SELECT 1'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'money_budgets'
        AND COLUMN_NAME = 'user_category_id'
    ),
    'SELECT 1',
    'ALTER TABLE money_budgets ADD COLUMN user_category_id VARCHAR(64) NULL AFTER category'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'money_budgets'
        AND COLUMN_NAME = 'slot_key'
    ),
    'SELECT 1',
    'ALTER TABLE money_budgets ADD COLUMN slot_key VARCHAR(96) GENERATED ALWAYS AS (CASE WHEN scope = 0 THEN ''o'' WHEN user_category_id IS NOT NULL THEN CONCAT(''u:'', user_category_id) WHEN category IS NOT NULL THEN CONCAT(''b:'', category) ELSE ''x'' END) STORED AFTER user_category_id'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'money_budgets'
        AND CONSTRAINT_NAME = 'fk_money_budget_user_category'
    ),
    'SELECT 1',
    'ALTER TABLE money_budgets ADD CONSTRAINT fk_money_budget_user_category FOREIGN KEY (user_id, user_category_id) REFERENCES money_user_categories (user_id, id) ON DELETE RESTRICT'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'money_budgets'
        AND CONSTRAINT_NAME = 'chk_money_budget_scope'
    ),
    'SELECT 1',
    'ALTER TABLE money_budgets ADD CONSTRAINT chk_money_budget_scope CHECK ((scope = 0 AND category IS NULL AND user_category_id IS NULL) OR (scope = 1 AND ((category IS NOT NULL AND user_category_id IS NULL) OR (category IS NULL AND user_category_id IS NOT NULL))))'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'money_budgets'
        AND INDEX_NAME = 'uniq_money_budget_slot'
    ),
    'SELECT 1',
    'ALTER TABLE money_budgets ADD UNIQUE KEY uniq_money_budget_slot (user_id, budget_ym, slot_key)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
