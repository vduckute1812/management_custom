-- Convert post/story reaction ENUM strings to TINYINT UNSIGNED (ReactionType).
-- Like=0, Love=1, Haha=2, Wow=3, Sad=4, Angry=5

ALTER TABLE post_reactions
  ADD COLUMN reaction_int TINYINT UNSIGNED NULL AFTER reaction;

UPDATE post_reactions
SET reaction_int = CASE reaction
  WHEN 'like' THEN 0
  WHEN 'love' THEN 1
  WHEN 'haha' THEN 2
  WHEN 'wow' THEN 3
  WHEN 'sad' THEN 4
  WHEN 'angry' THEN 5
  ELSE 0
END;

ALTER TABLE post_reactions
  MODIFY COLUMN reaction_int TINYINT UNSIGNED NOT NULL;

ALTER TABLE post_reactions
  DROP COLUMN reaction;

ALTER TABLE post_reactions
  CHANGE COLUMN reaction_int reaction TINYINT UNSIGNED NOT NULL;

ALTER TABLE story_reactions
  ADD COLUMN reaction_int TINYINT UNSIGNED NULL AFTER reaction;

UPDATE story_reactions
SET reaction_int = CASE reaction
  WHEN 'like' THEN 0
  WHEN 'love' THEN 1
  WHEN 'haha' THEN 2
  WHEN 'wow' THEN 3
  WHEN 'sad' THEN 4
  WHEN 'angry' THEN 5
  ELSE 0
END;

ALTER TABLE story_reactions
  MODIFY COLUMN reaction_int TINYINT UNSIGNED NOT NULL;

ALTER TABLE story_reactions
  DROP COLUMN reaction;

ALTER TABLE story_reactions
  CHANGE COLUMN reaction_int reaction TINYINT UNSIGNED NOT NULL;
