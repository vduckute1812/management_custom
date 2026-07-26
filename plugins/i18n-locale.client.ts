import dayjs from "dayjs";
import "dayjs/locale/vi";
import "dayjs/locale/zh-cn";
import "dayjs/locale/zh-tw";
import {
  DAYJS_LOCALE,
  INTL_LOCALE,
  isAppLocale,
  localeForCountry,
  localeForTimezone,
  type AppLocale,
} from "~/types/locale";

function applyLocaleSideEffects(code: AppLocale) {
  dayjs.locale(DAYJS_LOCALE[code]);
  if (import.meta.client) {
    document.documentElement.lang = INTL_LOCALE[code];
  }
}

function hasStoredLocale(): boolean {
  try {
    const raw = window.localStorage.getItem("mgmt:settings:v1");
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { locale?: unknown };
    return isAppLocale(parsed.locale);
  } catch {
    return false;
  }
}

async function detectLocaleFromLocation(): Promise<AppLocale | null> {
  try {
    const { country } = await $fetch<{ country: string | null }>("/api/geo");
    if (country) return localeForCountry(country);
  } catch {
    // Direct LAN access or an unavailable endpoint: try the device timezone.
  }

  try {
    return localeForTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return null;
  }
}

export default defineNuxtPlugin(() => {
  const { settings, update } = useSettings();
  // Plugins have no Vue setup instance — useI18n() throws prod error "26".
  const { locale, setLocale, locales } = useSafeI18n();

  const available = new Set(
    locales.value.map((l) => (typeof l === "string" ? l : l.code)),
  );

  async function applyPreferredLocale(preferred: AppLocale) {
    if (!available.has(preferred)) return;
    if (locale.value !== preferred) {
      await setLocale(preferred);
    }
    applyLocaleSideEffects(preferred);
  }

  async function initializeLocale() {
    if (hasStoredLocale()) {
      await applyPreferredLocale(settings.value.locale);
      return;
    }

    const detected = await detectLocaleFromLocation();
    // A language may have been selected while the geo request was in flight.
    if (hasStoredLocale()) return;

    // If geo-IP and timezone are unavailable, retain i18n's browser-language
    // detection when it resolved to one of this app's supported locales.
    const preferred =
      detected ??
      (isAppLocale(locale.value) ? locale.value : settings.value.locale);
    update("locale", preferred);
  }

  // Settings hydrate synchronously on the first client useSettings() call.
  // Location detection only runs when no locale preference exists, so a
  // language selected by the user is never overwritten.
  void initializeLocale();

  watch(
    () => settings.value.locale,
    (next) => {
      if (!isAppLocale(next) || !available.has(next)) return;
      if (locale.value !== next) {
        void setLocale(next).then(() => applyLocaleSideEffects(next));
      } else {
        applyLocaleSideEffects(next);
      }
    },
  );

  watch(locale, (next) => {
    if (!isAppLocale(next)) return;
    applyLocaleSideEffects(next);
    if (settings.value.locale !== next) {
      update("locale", next);
    }
  });
});
