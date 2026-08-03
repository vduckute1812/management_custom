-- Money ledger (Sprint 1).
-- Amounts are integer minor units (VND đồng). amount_minor is always >= 0;
-- direction tells in vs out.
--
-- MoneyDirection: Out=0, In=1
-- MoneyCategory: Food=0 Transport=1 Housing=2 Utilities=3 Health=4
--   Entertainment=5 Shopping=6 Education=7 Income=8 Transfer=9 Other=10

CREATE TABLE money_transactions (
  id            VARCHAR(64)  NOT NULL,
  user_id       VARCHAR(64)  NOT NULL,
  occurred_on   DATE         NOT NULL,
  amount_minor  BIGINT       NOT NULL,
  direction     TINYINT UNSIGNED NOT NULL,
  category      TINYINT UNSIGNED NOT NULL,
  note          VARCHAR(500) NULL,
  created_at    DATETIME(3)  NOT NULL,
  updated_at    DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_money_tx_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_money_tx_amount CHECK (amount_minor >= 0),
  INDEX idx_money_tx_user_occurred (user_id, occurred_on),
  INDEX idx_money_tx_user_category (user_id, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
