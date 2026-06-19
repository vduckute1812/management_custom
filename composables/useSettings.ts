import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";

dayjs.extend(isoWeek);

export type WeekStart = "sun" | "mon";
export type TimeFormat = "12h" | "24h";
export type ThemePreference = "system" | "light" | "dark";
export type EffectiveTheme = "light" | "dark";
export type Density = "comfortable" | "compact";

export interface Settings {
  weekStart: WeekStart;
  timeFormat: TimeFormat;
  theme: ThemePreference;
  density: Density;
  notificationsEnabled: boolean;
  /** Minutes before a block's start time the notification should fire. */
  notificationLeadMinutes: number;
}

const DEFAULTS: Settings = {
  weekStart: "sun",
  timeFormat: "24h",
  theme: "system",
  density: "comfortable",
  notificationsEnabled: false,
  notificationLeadMinutes: 5,
};

const STORAGE_KEY = "mgmt:settings:v1";

function readFromStorage(): Settings {
  if (!import.meta.client) return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const lead = Number(parsed.notificationLeadMinutes);
    return {
      weekStart: parsed.weekStart === "mon" ? "mon" : "sun",
      timeFormat: parsed.timeFormat === "12h" ? "12h" : "24h",
      theme:
        parsed.theme === "light" || parsed.theme === "dark"
          ? parsed.theme
          : "system",
      density: parsed.density === "compact" ? "compact" : "comfortable",
      notificationsEnabled: parsed.notificationsEnabled === true,
      notificationLeadMinutes:
        Number.isFinite(lead) && lead >= 0 && lead <= 1440
          ? Math.round(lead)
          : DEFAULTS.notificationLeadMinutes,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist(settings: Settings) {
  if (!import.meta.client) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota / private-browsing failures
  }
}

export const useSettings = () => {
  const settings = useState<Settings>("settings", () => ({ ...DEFAULTS }));
  const hydrated = useState<boolean>("settings:hydrated", () => false);
  const systemTheme = useState<EffectiveTheme>("settings:systemTheme", () => "light");

  // Hydrate from localStorage on first client mount.
  if (import.meta.client && !hydrated.value) {
    settings.value = readFromStorage();
    if (window.matchMedia) {
      systemTheme.value = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";
    }
    hydrated.value = true;
  }

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    settings.value = { ...settings.value, [key]: value };
    persist(settings.value);
  }

  /** What's actually painted right now — resolves "system" via the media query. */
  const effectiveTheme = computed<EffectiveTheme>(() => {
    if (settings.value.theme === "system") return systemTheme.value;
    return settings.value.theme;
  });

  function setSystemTheme(theme: EffectiveTheme) {
    systemTheme.value = theme;
  }

  function startOfWeek(d: dayjs.Dayjs): dayjs.Dayjs {
    return settings.value.weekStart === "mon"
      ? d.startOf("isoWeek")
      : d.startOf("week");
  }

  function endOfWeek(d: dayjs.Dayjs): dayjs.Dayjs {
    return startOfWeek(d).add(6, "day").endOf("day");
  }

  function formatTime(d: dayjs.Dayjs): string {
    return settings.value.timeFormat === "12h"
      ? d.format("h:mm A")
      : d.format("HH:mm");
  }

  function formatHourLabel(hour: number): string {
    const t = dayjs().hour(hour).minute(0);
    return settings.value.timeFormat === "12h"
      ? t.format("h A")
      : t.format("HH:mm");
  }

  return {
    settings,
    update,
    startOfWeek,
    endOfWeek,
    formatTime,
    formatHourLabel,
    effectiveTheme,
    setSystemTheme,
  };
};
