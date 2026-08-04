import { MoneyCurrency, type MoneyCurrency as MoneyCurrencyT } from "./money";

export const APP_LOCALES = ["en", "vi", "zh-CN", "zh-TW"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export function isAppLocale(value: unknown): value is AppLocale {
  return (
    typeof value === "string" &&
    (APP_LOCALES as readonly string[]).includes(value)
  );
}

/**
 * Default Money currency for a UI locale (signup / first preference only).
 * Later language changes do not rewrite currency — the user picks that
 * explicitly in Settings.
 */
export function defaultMoneyCurrencyForLocale(
  locale: AppLocale,
): MoneyCurrencyT {
  switch (locale) {
    case "vi":
      return MoneyCurrency.VND;
    case "zh-CN":
      return MoneyCurrency.CNY;
    case "zh-TW":
      return MoneyCurrency.TWD;
    case "en":
    default:
      return MoneyCurrency.USD;
  }
}

/** Coerce unknown / missing DB values to a supported app locale. */
export function toAppLocale(
  value: unknown,
  fallback: AppLocale = "en",
): AppLocale {
  return isAppLocale(value) ? value : fallback;
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

/** ISO 3166-1 alpha-2 country → app locale, for location-based detection. */
const COUNTRY_LOCALE: Record<string, AppLocale> = {
  VN: "vi",
  CN: "zh-CN",
  TW: "zh-TW",
  HK: "zh-TW",
  MO: "zh-TW",
};

/**
 * Locale for a visitor's country. Any country without a dedicated locale
 * (US, UK, …) falls back to English — the app's default.
 */
export function localeForCountry(country: string): AppLocale {
  return COUNTRY_LOCALE[country.toUpperCase()] ?? "en";
}

/**
 * Best-effort locale from an IANA timezone. Used as a fallback when no
 * geo-IP country is available (LAN access, dev). Returns null when the
 * timezone doesn't clearly identify a supported region, so callers can
 * keep browser-language detection as the final fallback.
 */
export function localeForTimezone(timeZone: string): AppLocale | null {
  switch (timeZone) {
    case "Asia/Ho_Chi_Minh":
    case "Asia/Saigon":
      return "vi";
    case "Asia/Shanghai":
    case "Asia/Chongqing":
    case "Asia/Harbin":
    case "Asia/Urumqi":
    case "Asia/Kashgar":
      return "zh-CN";
    case "Asia/Taipei":
    case "Asia/Hong_Kong":
    case "Asia/Macau":
      return "zh-TW";
    default:
      return null;
  }
}
