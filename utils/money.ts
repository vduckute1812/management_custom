/**
 * Format / parse VND minor units for the Money module.
 * Wire + DB use integer đồng; the UI may accept digit groups with separators.
 */

import { MONEY_CURRENCY } from "~/types/money";

/** Format minor units for display (vi-VN grouping, no fraction). */
export function formatMoneyMinor(
  amountMinor: number,
  locale = "vi-VN",
): string {
  const n = Number.isFinite(amountMinor) ? Math.trunc(amountMinor) : 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: MONEY_CURRENCY,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${n.toLocaleString("vi-VN")} ₫`;
  }
}

/** Compact absolute amount without currency symbol (for inputs). */
export function formatMoneyMinorPlain(amountMinor: number): string {
  const n = Number.isFinite(amountMinor)
    ? Math.trunc(Math.abs(amountMinor))
    : 0;
  return n.toLocaleString("vi-VN");
}

/**
 * Parse a user-typed amount into minor units.
 * Accepts digits with optional thousand separators (., spaces); strips to digits.
 */
export function parseMoneyMinorInput(raw: string): number | null {
  const digits = raw.trim().replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

/** `YYYY-MM` for a Date (local calendar parts). */
export function toYearMonth(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function isYearMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Inclusive start/end ISO dates for a yearMonth (local calendar). */
export function yearMonthRange(yearMonth: string): {
  start: string;
  end: string;
} {
  const [ys, ms] = yearMonth.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const start = `${ys}-${ms}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${ys}-${ms}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}
