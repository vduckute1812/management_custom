-- Long-form writing (essays / thesis chapters) needs more than MySQL TEXT
-- (~64 KiB). MEDIUMTEXT holds up to 16 MiB — plenty for UTF-8 Vietnamese.
ALTER TABLE posts
  MODIFY COLUMN body MEDIUMTEXT NOT NULL;
