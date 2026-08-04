/**
 * Format / parse Money minor units for the active currency.
 * Wire + DB use integer minor units (đồng for VND, cents for USD/CNY/TWD).
 */

import {
  MONEY_CATEGORY_COLORS,
  MONEY_CATEGORY_EMOJI,
  MONEY_CATEGORY_I18N_KEYS,
  MONEY_CURRENCY_CODE,
  MONEY_CURRENCY_FRACTION_DIGITS,
  MoneyCurrency,
  MoneyDirection,
  moneyCategoryKey,
  moneyCategoryPickFromTx,
  type MoneyCategory,
  type MoneyCategoryPick,
  type MoneyCurrency as MoneyCurrencyT,
  type MoneyMonthTotals,
  type MoneyTransaction,
} from "~/types/money";

export function formatMoneyMinor(
  amountMinor: number,
  locale = "vi-VN",
  currency: MoneyCurrencyT = MoneyCurrency.VND,
): string {
  const n = Number.isFinite(amountMinor) ? Math.trunc(amountMinor) : 0;
  const code = MONEY_CURRENCY_CODE[currency] ?? "VND";
  const fraction = MONEY_CURRENCY_FRACTION_DIGITS[currency] ?? 0;
  const major = fraction > 0 ? n / 10 ** fraction : n;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      maximumFractionDigits: fraction,
      minimumFractionDigits: fraction,
    }).format(major);
  } catch {
    return `${major.toLocaleString(locale)} ${code}`;
  }
}

/** Compact absolute amount in major units without currency symbol (for inputs). */
export function formatMoneyMinorPlain(
  amountMinor: number,
  locale = "vi-VN",
  currency: MoneyCurrencyT = MoneyCurrency.VND,
): string {
  const n = Number.isFinite(amountMinor)
    ? Math.trunc(Math.abs(amountMinor))
    : 0;
  const fraction = MONEY_CURRENCY_FRACTION_DIGITS[currency] ?? 0;
  if (fraction === 0) {
    return n.toLocaleString(locale, { maximumFractionDigits: 0 });
  }
  const major = n / 10 ** fraction;
  return major.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: fraction,
  });
}

/**
 * Parse a user-typed amount into minor units.
 * VND (0 fraction): digits only; `.` / `,` / spaces are thousand separators.
 * USD/CNY/TWD (2 fraction): last `.` or `,` with 1–2 trailing digits is decimal.
 */
export function parseMoneyMinorInput(
  raw: string,
  currency: MoneyCurrencyT = MoneyCurrency.VND,
): number | null {
  const trimmed = raw.trim().replace(/\s+/g, "");
  if (!trimmed) return null;

  const fraction = MONEY_CURRENCY_FRACTION_DIGITS[currency] ?? 0;
  if (fraction === 0) {
    const digits = trimmed.replace(/[^\d]/g, "");
    if (!digits) return null;
    const n = Number(digits);
    if (!Number.isSafeInteger(n) || n < 0) return null;
    return n;
  }

  // Fractional currencies: decide decimal vs thousand separators.
  const lastDot = trimmed.lastIndexOf(".");
  const lastComma = trimmed.lastIndexOf(",");
  const decPos = Math.max(lastDot, lastComma);
  let majorStr: string;
  if (decPos >= 0) {
    const after = trimmed.slice(decPos + 1);
    const before = trimmed.slice(0, decPos);
    // 1–2 digits after the last separator → decimal; else thousand grouping.
    if (/^\d{1,2}$/.test(after) && !/[.,]/.test(after)) {
      const intPart = before.replace(/[^\d]/g, "") || "0";
      const fracPart = after.padEnd(fraction, "0").slice(0, fraction);
      majorStr = `${intPart}.${fracPart}`;
    } else {
      majorStr = trimmed.replace(/[^\d]/g, "");
    }
  } else {
    majorStr = trimmed.replace(/[^\d]/g, "");
  }

  if (!majorStr || majorStr === ".") return null;
  const major = Number(majorStr);
  if (!Number.isFinite(major) || major < 0) return null;
  const minor = Math.round(major * 10 ** fraction);
  if (!Number.isSafeInteger(minor) || minor < 0) return null;
  return minor;
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
  key: string;
  pick: MoneyCategoryPick;
  /** Built-in only; null for custom. */
  category: MoneyCategory | null;
  userCategoryId?: string;
  label: string;
  emoji: string;
  color: string;
  amountMinor: number;
  /** Share of the parent total, 0–1. */
  share: number;
}

export function resolveMoneyCategoryMeta(
  tx: Pick<MoneyTransaction, "category" | "userCategoryId" | "userCategory">,
  t: (key: string) => string,
): {
  pick: MoneyCategoryPick;
  key: string;
  label: string;
  emoji: string;
  color: string;
} | null {
  const pick = moneyCategoryPickFromTx(tx);
  if (!pick) return null;
  if (pick.kind === "custom") {
    const custom = tx.userCategory;
    return {
      pick,
      key: moneyCategoryKey(pick),
      label: custom?.name ?? t("money.categories.other"),
      emoji: custom?.emoji ?? "📌",
      color: custom?.color ?? "#94a3b8",
    };
  }
  return {
    pick,
    key: moneyCategoryKey(pick),
    label: t(MONEY_CATEGORY_I18N_KEYS[pick.category]),
    emoji: MONEY_CATEGORY_EMOJI[pick.category],
    color: MONEY_CATEGORY_COLORS[pick.category],
  };
}

/** Sum amounts for one direction, grouped by builtin/custom category (desc). */
export function sumByCategory(
  transactions: MoneyTransaction[],
  direction: MoneyDirection,
  t: (key: string) => string,
): MoneyCategorySlice[] {
  const map = new Map<
    string,
    {
      pick: MoneyCategoryPick;
      category: MoneyCategory | null;
      userCategoryId?: string;
      label: string;
      emoji: string;
      color: string;
      amountMinor: number;
    }
  >();
  for (const tx of transactions) {
    if (tx.direction !== direction) continue;
    const meta = resolveMoneyCategoryMeta(tx, t);
    if (!meta) continue;
    const prev = map.get(meta.key);
    if (prev) {
      prev.amountMinor += tx.amountMinor;
    } else {
      map.set(meta.key, {
        pick: meta.pick,
        category: meta.pick.kind === "builtin" ? meta.pick.category : null,
        userCategoryId:
          meta.pick.kind === "custom" ? meta.pick.userCategoryId : undefined,
        label: meta.label,
        emoji: meta.emoji,
        color: meta.color,
        amountMinor: tx.amountMinor,
      });
    }
  }
  const total = Array.from(map.values()).reduce((a, b) => a + b.amountMinor, 0);
  return Array.from(map.entries())
    .map(([key, row]) => ({
      key,
      pick: row.pick,
      category: row.category,
      userCategoryId: row.userCategoryId,
      label: row.label,
      emoji: row.emoji,
      color: row.color,
      amountMinor: row.amountMinor,
      share: total > 0 ? row.amountMinor / total : 0,
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

/** Recompute month totals from an in-memory list (after local patch). */
export function computeMonthTotals(
  transactions: MoneyTransaction[],
  yearMonth: string,
): MoneyMonthTotals {
  let inMinor = 0;
  let outMinor = 0;
  for (const tx of transactions) {
    if (tx.direction === MoneyDirection.In) inMinor += tx.amountMinor;
    else outMinor += tx.amountMinor;
  }
  return {
    yearMonth,
    inMinor,
    outMinor,
    netMinor: inMinor - outMinor,
  };
}

/** `YYYY-MM` from an ISO calendar date `YYYY-MM-DD`. */
export function yearMonthFromOccurredOn(occurredOn: string): string {
  return occurredOn.slice(0, 7);
}

/**
 * Insert or replace a transaction in a month list, sorted by occurredOn desc
 * then id. Returns a new array (does not mutate).
 */
export function upsertTransactionInMonth(
  list: MoneyTransaction[],
  tx: MoneyTransaction,
): MoneyTransaction[] {
  const next = list.filter((row) => row.id !== tx.id);
  next.push(tx);
  next.sort((a, b) => {
    const byDate = b.occurredOn.localeCompare(a.occurredOn);
    if (byDate !== 0) return byDate;
    return b.id.localeCompare(a.id);
  });
  return next;
}
