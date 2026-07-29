-- Denormalized chat inbox counters for cheap list + badge queries.
-- unread_count lives on the reader's chat_conversation_reads row.
-- last_message_id on the conversation avoids a per-row last-message subquery.

ALTER TABLE chat_conversation_reads
  ADD COLUMN unread_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER last_read_at;

ALTER TABLE chat_conversation_reads
  ADD INDEX idx_chat_reads_user_unread (user_id, unread_count);

ALTER TABLE chat_conversations
  ADD COLUMN last_message_id VARCHAR(64) NULL AFTER last_message_at;

ALTER TABLE chat_conversations
  ADD INDEX idx_chat_conversations_last_message (last_message_id);

-- Point each conversation at its newest message (if any).
UPDATE chat_conversations c
LEFT JOIN chat_messages m ON m.id = (
  SELECT m2.id
  FROM chat_messages m2
  WHERE m2.conversation_id = c.id
  ORDER BY m2.created_at DESC, m2.id DESC
  LIMIT 1
)
SET c.last_message_id = m.id;

-- Recompute unread for existing read rows.
UPDATE chat_conversation_reads r
SET r.unread_count = (
  SELECT COUNT(*)
  FROM chat_messages m
  WHERE m.conversation_id = r.conversation_id
    AND m.sender_id <> r.user_id
    AND m.created_at > r.last_read_at
);

-- Ensure both participants have a reads row so SUM(unread_count) is complete.
-- Epoch last_read_at means "never opened"; unread_count holds the badge.
INSERT INTO chat_conversation_reads (conversation_id, user_id, last_read_at, unread_count)
SELECT
  c.id,
  c.user_a_id,
  '1970-01-01 00:00:00.000',
  (
    SELECT COUNT(*)
    FROM chat_messages m
    WHERE m.conversation_id = c.id
      AND m.sender_id <> c.user_a_id
  )
FROM chat_conversations c
WHERE NOT EXISTS (
  SELECT 1
  FROM chat_conversation_reads r
  WHERE r.conversation_id = c.id
    AND r.user_id = c.user_a_id
);

INSERT INTO chat_conversation_reads (conversation_id, user_id, last_read_at, unread_count)
SELECT
  c.id,
  c.user_b_id,
  '1970-01-01 00:00:00.000',
  (
    SELECT COUNT(*)
    FROM chat_messages m
    WHERE m.conversation_id = c.id
      AND m.sender_id <> c.user_b_id
  )
FROM chat_conversations c
WHERE NOT EXISTS (
  SELECT 1
  FROM chat_conversation_reads r
  WHERE r.conversation_id = c.id
    AND r.user_id = c.user_b_id
);
