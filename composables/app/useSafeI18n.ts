import { getCurrentInstance } from "vue";

/**
 * `useI18n()` from vue-i18n requires an active Vue setup instance.
 * In production builds its error codes are stripped, so calling it from a
 * Nuxt plugin / middleware / async callback surfaces as Nuxt's error page
 * with status 500 and description "26" (MUST_BE_CALL_SETUP_TOP).
 *
 * Prefer the real composable inside components; fall back to the global
 * composer Nuxt i18n installs on the app (`$i18n`) everywhere else.
 */
export function useSafeI18n() {
  if (getCurrentInstance()) {
    return useI18n();
  }
  return useNuxtApp().$i18n;
}
