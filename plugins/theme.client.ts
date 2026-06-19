/**
 * Mirrors the user's appearance preferences onto `<html data-*>` attributes
 * so CSS can react centrally rather than every component reading the settings
 * ref. Tracks `prefers-color-scheme` for the "system" theme mode, and writes
 * `data-density` so the compact-density overrides in main.css apply globally.
 *
 * Pure client-side: the server can't know which theme the user chose without
 * a cookie round-trip, so we tolerate one frame of "default then swap" on
 * first paint.
 */
export default defineNuxtPlugin(() => {
  const { settings, effectiveTheme, setSystemTheme } = useSettings();

  function applyTheme(theme: "light" | "dark") {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }

  function applyDensity(density: "comfortable" | "compact") {
    document.documentElement.dataset.density = density;
  }

  applyTheme(effectiveTheme.value);
  applyDensity(settings.value.density);

  watch(effectiveTheme, (next) => applyTheme(next), { immediate: false });
  watch(
    () => settings.value.density,
    (next) => applyDensity(next),
    { immediate: false }
  );

  if (window.matchMedia) {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemTheme(mql.matches ? "dark" : "light");
    const onChange = (e: MediaQueryListEvent) =>
      setSystemTheme(e.matches ? "dark" : "light");
    if (mql.addEventListener) {
      mql.addEventListener("change", onChange);
    } else {
      // Safari < 14 legacy API.
      mql.addListener(onChange);
    }
  }
});
