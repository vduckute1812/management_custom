import type { Dayjs } from "dayjs";
import type { AppLocale } from "~/types/locale";
import type { CalendarView } from "~/types/task";

function capitalizeFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Locale-aware calendar toolbar title (daily / weekly / monthly). */
export function formatCalendarHeader(
  cursor: Dayjs,
  view: CalendarView,
  locale: AppLocale,
  weekStart: (d: Dayjs) => Dayjs,
): string {
  if (view === "daily") {
    if (locale === "vi") {
      return `${capitalizeFirst(cursor.format("dddd"))}, ngày ${cursor.format("D/M/YYYY")}`;
    }
    if (locale === "zh-CN" || locale === "zh-TW") {
      return cursor.format("YYYY年M月D日 dddd");
    }
    return cursor.format("dddd, MMMM D, YYYY");
  }

  if (view === "weekly") {
    const start = weekStart(cursor);
    const end = start.add(6, "day");
    if (locale === "vi") {
      return `${start.format("D/M")} – ${end.format("D/M/YYYY")}`;
    }
    if (locale === "zh-CN" || locale === "zh-TW") {
      return `${start.format("M月D日")} – ${end.format("YYYY年M月D日")}`;
    }
    return `${start.format("MMM D")} – ${end.format("MMM D, YYYY")}`;
  }

  if (locale === "vi") {
    return `Tháng ${cursor.format("M/YYYY")}`;
  }
  if (locale === "zh-CN" || locale === "zh-TW") {
    return cursor.format("YYYY年M月");
  }
  return cursor.format("MMMM YYYY");
}
