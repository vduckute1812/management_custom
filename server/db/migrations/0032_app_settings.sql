-- Install-wide key/value settings (integer keys + integer values).
-- setting_key: ArticlesDailyFetchEnabled=1
-- value_int for ArticlesDailyFetchEnabled: Off=0, On=1

CREATE TABLE app_settings (
  setting_key  TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  value_int    INT NOT NULL,
  updated_at   DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO app_settings (setting_key, value_int, updated_at)
VALUES (1, 1, UTC_TIMESTAMP(3));
