export const APP_LOCALES = ["en", "vi", "zh-CN", "zh-TW"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export function isAppLocale(value: unknown): value is AppLocale {
  return (
    typeof value === "string" &&
    (APP_LOCALES as readonly string[]).includes(value)
  );
}

/** dayjs locale pack name for each app locale. */
export const DAYJS_LOCALE: Record<AppLocale, string> = {
  en: "en",
  vi: "vi",
  "zh-CN": "zh-cn",
  "zh-TW": "zh-tw",
};

/** BCP 47 tag for Intl / toLocaleDateString. */
export const INTL_LOCALE: Record<AppLocale, string> = {
  en: "en-US",
  vi: "vi-VN",
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
};
