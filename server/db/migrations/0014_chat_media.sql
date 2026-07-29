-- Chat media messages (images + voice) and audio upload kind.

ALTER TABLE uploads
  MODIFY COLUMN kind ENUM('image', 'document', 'audio') NOT NULL;

ALTER TABLE chat_messages
  ADD COLUMN upload_id VARCHAR(64) NULL AFTER sticker_id,
  ADD COLUMN duration_ms INT UNSIGNED NULL AFTER upload_id,
  ADD CONSTRAINT fk_chat_messages_upload
    FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE SET NULL,
  ADD INDEX idx_chat_messages_upload (upload_id);
