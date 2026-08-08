-- Cover chat message keyset pagination:
--   WHERE conversation_id = ? AND (created_at, id) <cursor>
--   ORDER BY created_at DESC/ASC, id DESC/ASC
-- Extends 0013's (conversation_id, created_at) with trailing `id` so ties on
-- the same millisecond stay index-ordered without filesort.

ALTER TABLE chat_messages
  ADD INDEX idx_chat_messages_conversation_created_id
    (conversation_id, created_at, id);
