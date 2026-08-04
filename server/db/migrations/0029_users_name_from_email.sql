-- Backfill empty display names from the email local-part.
-- New signups require a name; existing accounts without one get a derived name.

UPDATE users
SET name = LEFT(
  TRIM(
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(SUBSTRING_INDEX(email, '@', 1), '.', ' '),
          '_',
          ' '
        ),
        '-',
        ' '
      ),
      '+',
      ' '
    )
  ),
  255
)
WHERE name IS NULL OR TRIM(name) = '';

-- Any leftover empties (malformed emails) get a placeholder.
UPDATE users
SET name = 'User'
WHERE name IS NULL OR TRIM(name) = '';
