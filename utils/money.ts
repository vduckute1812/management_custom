/**
 * Format / parse VND minor units for the Money module.
 * Wire + DB use integer đồng; the UI may accept digit groups with separators.
 */

import {
  MONEY_CURRENCY,
  MoneyDirection,
  type MoneyCategory,
  type MoneyTransaction,
} from "~/types/money";

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

export interface MoneyCategorySlice {
  category: MoneyCategory;
  amountMinor: number;
  /** Share of the parent total, 0–1. */
  share: number;
}

/** Sum amounts for one direction, grouped by category (desc). */
export function sumByCategory(
  transactions: MoneyTransaction[],
  direction: MoneyDirection,
): MoneyCategorySlice[] {
  const map = new Map<MoneyCategory, number>();
  for (const tx of transactions) {
    if (tx.direction !== direction) continue;
    map.set(tx.category, (map.get(tx.category) ?? 0) + tx.amountMinor);
  }
  const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
  return Array.from(map.entries())
    .map(([category, amountMinor]) => ({
      category,
      amountMinor,
      share: total > 0 ? amountMinor / total : 0,
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
}

export interface MoneyDailyPoint {
  /** ISO date YYYY-MM-DD */
  day: string;
  outMinor: number;
  inMinor: number;
}

/**
 * Per-day in/out for a month.
 * When `fillAll`, every calendar day in the month is present (zeros allowed).
 */
export function sumDaily(
  transactions: MoneyTransaction[],
  yearMonth: string,
  opts?: { fillAll?: boolean },
): MoneyDailyPoint[] {
  const { start, end } = yearMonthRange(yearMonth);
  const map = new Map<string, { outMinor: number; inMinor: number }>();

  if (opts?.fillAll) {
    const [ys, ms] = yearMonth.split("-").map(Number);
    const last = new Date(ys!, ms!, 0).getDate();
    for (let d = 1; d <= last; d++) {
      const day = `${yearMonth}-${String(d).padStart(2, "0")}`;
      map.set(day, { outMinor: 0, inMinor: 0 });
    }
  }

  for (const tx of transactions) {
    if (tx.occurredOn < start || tx.occurredOn > end) continue;
    const entry = map.get(tx.occurredOn) ?? { outMinor: 0, inMinor: 0 };
    if (tx.direction === MoneyDirection.Out) {
      entry.outMinor += tx.amountMinor;
    } else {
      entry.inMinor += tx.amountMinor;
    }
    map.set(tx.occurredOn, entry);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({ day, ...v }));
}
