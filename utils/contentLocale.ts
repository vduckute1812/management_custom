import type { AppLocale } from "~/types/locale";
import { APP_LOCALES, isAppLocale } from "~/types/locale";

/**
 * Locales available for manuscript content (same set as UI languages).
 * Stored on `posts.content_locale`.
 */
export const CONTENT_LOCALES = APP_LOCALES;
export type ContentLocale = AppLocale;

export function isContentLocale(value: unknown): value is ContentLocale {
  return isAppLocale(value);
}

/** Short labels for locale chips (language-neutral codes). */
export const CONTENT_LOCALE_LABELS: Record<ContentLocale, string> = {
  en: "EN",
  vi: "VI",
  "zh-CN": "简",
  "zh-TW": "繁",
};
