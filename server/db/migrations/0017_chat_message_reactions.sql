-- Reactions on chat messages (integer enum — see ReactionType in types/reaction.ts).
-- Like=0, Love=1, Haha=2, Wow=3, Sad=4, Angry=5

CREATE TABLE chat_message_reactions (
  message_id  VARCHAR(64) NOT NULL,
  user_id     VARCHAR(64) NOT NULL,
  reaction    TINYINT UNSIGNED NOT NULL,
  created_at  DATETIME(3) NOT NULL,
  PRIMARY KEY (message_id, user_id),
  CONSTRAINT fk_chat_message_reactions_message FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_message_reactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_chat_message_reactions_message (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
