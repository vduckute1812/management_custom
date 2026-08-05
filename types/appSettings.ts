/**
 * Install-wide app settings — TINYINT keys, integer values end-to-end.
 */

/** ArticlesDailyFetchEnabled=1 */
export const AppSettingKey = {
  ArticlesDailyFetchEnabled: 1,
} as const;
export type AppSettingKey = (typeof AppSettingKey)[keyof typeof AppSettingKey];

export const APP_SETTING_KEYS = [
  AppSettingKey.ArticlesDailyFetchEnabled,
] as const;

export function isAppSettingKey(value: unknown): value is AppSettingKey {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (APP_SETTING_KEYS as readonly number[]).includes(value)
  );
}

export function toAppSettingKey(value: unknown): AppSettingKey | null {
  const n = typeof value === "string" ? Number(value) : value;
  return isAppSettingKey(n) ? n : null;
}
