-- Money savings goals + contributions (Sprint 3).
-- Amounts are integer VND đồng (BIGINT >= 0).
--
-- MoneySavingsGoalStatus: Active=0, Completed=1, Archived=2

CREATE TABLE money_savings_goals (
  id            VARCHAR(64)  NOT NULL,
  user_id       VARCHAR(64)  NOT NULL,
  title         VARCHAR(120) NOT NULL,
  target_minor  BIGINT       NOT NULL,
  status        TINYINT UNSIGNED NOT NULL,
  target_date   DATE         NULL,
  note          VARCHAR(500) NULL,
  created_at    DATETIME(3)  NOT NULL,
  updated_at    DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_money_goal_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_money_goal_target CHECK (target_minor >= 0),
  INDEX idx_money_goal_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE money_savings_contributions (
  id            VARCHAR(64)  NOT NULL,
  goal_id       VARCHAR(64)  NOT NULL,
  user_id       VARCHAR(64)  NOT NULL,
  occurred_on   DATE         NOT NULL,
  amount_minor  BIGINT       NOT NULL,
  note          VARCHAR(500) NULL,
  created_at    DATETIME(3)  NOT NULL,
  updated_at    DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_money_contrib_goal
    FOREIGN KEY (goal_id) REFERENCES money_savings_goals(id) ON DELETE CASCADE,
  CONSTRAINT fk_money_contrib_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_money_contrib_amount CHECK (amount_minor >= 0),
  INDEX idx_money_contrib_goal_occurred (goal_id, occurred_on),
  INDEX idx_money_contrib_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
