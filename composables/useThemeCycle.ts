import type { ThemePreference } from "~/composables/useSettings";

export function useThemeCycle() {
  const { t } = useI18n();
  const { settings, update, effectiveTheme } = useSettings();

  const themeCycle: Record<ThemePreference, ThemePreference> = {
    system: "light",
    light: "dark",
    dark: "system",
  };

  function cycleTheme() {
    update("theme", themeCycle[settings.value.theme]);
  }

  const themeLabel = computed(() => {
    if (settings.value.theme === "system") return t("nav.themeAuto");
    return settings.value.theme === "dark"
      ? t("nav.themeDark")
      : t("nav.themeLight");
  });

  return {
    settings,
    effectiveTheme,
    cycleTheme,
    themeLabel,
  };
}
