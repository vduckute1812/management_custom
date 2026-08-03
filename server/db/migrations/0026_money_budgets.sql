-- Money monthly budgets (Sprint 4).
-- Amounts are integer VND đồng (BIGINT >= 0).
--
-- MoneyBudgetScope: Overall=0, Category=1
-- When scope=Category, category uses MoneyCategory (Food=0 … Other=10).
-- category_uniq is a generated stand-in so Overall (NULL category) stays unique
-- under MySQL's NULL-friendly UNIQUE semantics (255 is outside MoneyCategory).

CREATE TABLE money_budgets (
  id            VARCHAR(64)  NOT NULL,
  user_id       VARCHAR(64)  NOT NULL,
  year_month    CHAR(7)      NOT NULL,
  scope         TINYINT UNSIGNED NOT NULL,
  category      TINYINT UNSIGNED NULL,
  category_uniq TINYINT UNSIGNED
    GENERATED ALWAYS AS (IFNULL(category, 255)) STORED,
  amount_minor  BIGINT       NOT NULL,
  created_at    DATETIME(3)  NOT NULL,
  updated_at    DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_money_budget_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_money_budget_amount CHECK (amount_minor >= 0),
  CONSTRAINT chk_money_budget_scope CHECK (
    (scope = 0 AND category IS NULL) OR (scope = 1 AND category IS NOT NULL)
  ),
  CONSTRAINT chk_money_budget_year_month CHECK (
    year_month REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$'
  ),
  UNIQUE KEY uniq_money_budget_slot (user_id, year_month, scope, category_uniq),
  INDEX idx_money_budget_user_month (user_id, year_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
