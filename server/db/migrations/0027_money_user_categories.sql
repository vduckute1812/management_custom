-- Money user-defined categories + attach to ledger/budgets.
-- Built-in MoneyCategory (0–10) stays as TINYINT; custom rows are open-ended
-- entities (name/emoji/color are presentational strings, not enums).
-- MoneyDirection on user categories: Out=0, In=1.

CREATE TABLE money_user_categories (
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

-- Ledger: either builtin category OR user_category_id (exactly one).
ALTER TABLE money_transactions
  ADD COLUMN user_category_id VARCHAR(64) NULL AFTER category;

ALTER TABLE money_transactions
  MODIFY COLUMN category TINYINT UNSIGNED NULL;

ALTER TABLE money_transactions
  ADD CONSTRAINT fk_money_tx_user_category
    FOREIGN KEY (user_id, user_category_id)
    REFERENCES money_user_categories (user_id, id)
    ON DELETE RESTRICT;

ALTER TABLE money_transactions
  ADD CONSTRAINT chk_money_tx_category_xor CHECK (
    (category IS NOT NULL AND user_category_id IS NULL)
    OR (category IS NULL AND user_category_id IS NOT NULL)
  );

ALTER TABLE money_transactions
  ADD INDEX idx_money_tx_user_category (user_id, user_category_id);

-- Budgets: replace category_uniq with a string slot_key that covers custom cats.
ALTER TABLE money_budgets
  DROP INDEX uniq_money_budget_slot;

ALTER TABLE money_budgets
  DROP COLUMN category_uniq;

ALTER TABLE money_budgets
  DROP CONSTRAINT chk_money_budget_scope;

ALTER TABLE money_budgets
  ADD COLUMN user_category_id VARCHAR(64) NULL AFTER category;

ALTER TABLE money_budgets
  ADD COLUMN slot_key VARCHAR(96)
    GENERATED ALWAYS AS (
      CASE
        WHEN scope = 0 THEN 'o'
        WHEN user_category_id IS NOT NULL THEN CONCAT('u:', user_category_id)
        WHEN category IS NOT NULL THEN CONCAT('b:', category)
        ELSE 'x'
      END
    ) STORED AFTER user_category_id;

ALTER TABLE money_budgets
  ADD CONSTRAINT fk_money_budget_user_category
    FOREIGN KEY (user_id, user_category_id)
    REFERENCES money_user_categories (user_id, id)
    ON DELETE RESTRICT;

ALTER TABLE money_budgets
  ADD CONSTRAINT chk_money_budget_scope CHECK (
    (scope = 0 AND category IS NULL AND user_category_id IS NULL)
    OR (
      scope = 1 AND (
        (category IS NOT NULL AND user_category_id IS NULL)
        OR (category IS NULL AND user_category_id IS NOT NULL)
      )
    )
  );

ALTER TABLE money_budgets
  ADD UNIQUE KEY uniq_money_budget_slot (user_id, budget_ym, slot_key);
