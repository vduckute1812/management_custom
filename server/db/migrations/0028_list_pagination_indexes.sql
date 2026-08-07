-- Composite indexes for cursor-paginated money, task, and epic lists.

ALTER TABLE money_transactions
  ADD INDEX idx_money_tx_user_occurred_id (user_id, occurred_on, id);

ALTER TABLE tasks
  ADD INDEX idx_tasks_user_updated_id (user_id, updated_at, id);

ALTER TABLE epics
  ADD INDEX idx_epics_user_updated_id (user_id, updated_at, id);
