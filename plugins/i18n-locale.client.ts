import dayjs from "dayjs";
import "dayjs/locale/vi";
import "dayjs/locale/zh-cn";
import "dayjs/locale/zh-tw";
import {
  DAYJS_LOCALE,
  INTL_LOCALE,
  isAppLocale,
  type AppLocale,
} from "~/types/locale";

function applyLocaleSideEffects(code: AppLocale) {
  dayjs.locale(DAYJS_LOCALE[code]);
  if (import.meta.client) {
    document.documentElement.lang = INTL_LOCALE[code];
  }
}

export default defineNuxtPlugin(() => {
  const { settings, update } = useSettings();
  const { locale, setLocale, locales } = useI18n();

  const available = new Set(
    locales.value.map((l) => (typeof l === "string" ? l : l.code))
  );

  async function syncFromSettings() {
    const preferred = settings.value.locale;
    if (!available.has(preferred)) return;
    if (locale.value !== preferred) {
      await setLocale(preferred);
    }
    applyLocaleSideEffects(preferred);
  }

  // Settings hydrate synchronously on first client useSettings() call.
  void syncFromSettings();

  watch(
    () => settings.value.locale,
    (next) => {
      if (!isAppLocale(next) || !available.has(next)) return;
      if (locale.value !== next) {
        void setLocale(next).then(() => applyLocaleSideEffects(next));
      } else {
        applyLocaleSideEffects(next);
      }
    }
  );

  watch(locale, (next) => {
    if (!isAppLocale(next)) return;
    applyLocaleSideEffects(next);
    if (settings.value.locale !== next) {
      update("locale", next);
    }
  });
});
