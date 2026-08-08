/**
 * Per-user Money display currency (TINYINT end-to-end).
 * Amounts stay integer minor units: đồng for VND, cents for USD/CNY/TWD.
 * Changing currency does not convert historical amounts.
 */
export const MoneyCurrency = {
  VND: 0,
  USD: 1,
  CNY: 2,
  TWD: 3,
} as const;
export type MoneyCurrency = (typeof MoneyCurrency)[keyof typeof MoneyCurrency];

export const MONEY_CURRENCIES: readonly MoneyCurrency[] = [
  MoneyCurrency.VND,
  MoneyCurrency.USD,
  MoneyCurrency.CNY,
  MoneyCurrency.TWD,
] as const;

/** ISO 4217 codes for Intl.NumberFormat. */
export const MONEY_CURRENCY_CODE: Record<MoneyCurrency, string> = {
  [MoneyCurrency.VND]: "VND",
  [MoneyCurrency.USD]: "USD",
  [MoneyCurrency.CNY]: "CNY",
  [MoneyCurrency.TWD]: "TWD",
};

/** Fraction digits for display / parse (VND has no practical subunit). */
export const MONEY_CURRENCY_FRACTION_DIGITS: Record<MoneyCurrency, number> = {
  [MoneyCurrency.VND]: 0,
  [MoneyCurrency.USD]: 2,
  [MoneyCurrency.CNY]: 2,
  [MoneyCurrency.TWD]: 2,
};

/** i18n keys under `settings.currency.*` / `money.currency.*`. */
export const MONEY_CURRENCY_I18N_KEYS: Record<MoneyCurrency, string> = {
  [MoneyCurrency.VND]: "settings.currency.vnd",
  [MoneyCurrency.USD]: "settings.currency.usd",
  [MoneyCurrency.CNY]: "settings.currency.cny",
  [MoneyCurrency.TWD]: "settings.currency.twd",
};

/** @deprecated Prefer MoneyCurrency + MONEY_CURRENCY_CODE. */
export const MONEY_CURRENCY = "VND" as const;

export function isMoneyCurrency(value: unknown): value is MoneyCurrency {
  return (
    typeof value === "number" &&
    (MONEY_CURRENCIES as readonly number[]).includes(value)
  );
}

export function toMoneyCurrency(value: unknown): MoneyCurrency {
  const n = Number(value);
  return isMoneyCurrency(n) ? n : MoneyCurrency.VND;
}
