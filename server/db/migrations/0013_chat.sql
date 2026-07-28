-- Direct messages between users (1:1 conversations) with text, emoji, and stickers.

CREATE TABLE chat_conversations (
  id               VARCHAR(64) PRIMARY KEY,
  user_a_id        VARCHAR(64) NOT NULL,
  user_b_id        VARCHAR(64) NOT NULL,
  last_message_at  DATETIME(3) NULL,
  created_at       DATETIME(3) NOT NULL,
  UNIQUE KEY uniq_chat_pair (user_a_id, user_b_id),
  CONSTRAINT fk_chat_conversations_user_a FOREIGN KEY (user_a_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_conversations_user_b FOREIGN KEY (user_b_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_chat_conversations_user_a (user_a_id, last_message_at),
  INDEX idx_chat_conversations_user_b (user_b_id, last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- kind: text=0, emoji=1, sticker=2 (TINYINT, same integer-enum convention as the rest of the schema)
CREATE TABLE chat_messages (
  id                VARCHAR(64) PRIMARY KEY,
  conversation_id   VARCHAR(64) NOT NULL,
  sender_id         VARCHAR(64) NOT NULL,
  kind              TINYINT UNSIGNED NOT NULL DEFAULT 0,
  body              TEXT NULL,
  sticker_id        VARCHAR(64) NULL,
  created_at        DATETIME(3) NOT NULL,
  CONSTRAINT fk_chat_messages_conversation FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_chat_messages_conversation (conversation_id, created_at),
  INDEX idx_chat_messages_sender (sender_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE chat_conversation_reads (
  conversation_id   VARCHAR(64) NOT NULL,
  user_id           VARCHAR(64) NOT NULL,
  last_read_at      DATETIME(3) NOT NULL,
  PRIMARY KEY (conversation_id, user_id),
  CONSTRAINT fk_chat_reads_conversation FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_reads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
