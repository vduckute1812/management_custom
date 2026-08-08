/**
 * Money cash-flow direction (TINYINT end-to-end).
 * `amountMinor` is always ≥ 0; direction is separate.
 */

/** Cash flow direction for a ledger row. */
export const MoneyDirection = {
  Out: 0,
  In: 1,
} as const;
export type MoneyDirection =
  (typeof MoneyDirection)[keyof typeof MoneyDirection];
export const MONEY_DIRECTIONS = [
  MoneyDirection.Out,
  MoneyDirection.In,
] as const;

export function isMoneyDirection(value: unknown): value is MoneyDirection {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (MONEY_DIRECTIONS as readonly number[]).includes(value)
  );
}

export function toMoneyDirection(value: unknown): MoneyDirection {
  return isMoneyDirection(value) ? value : MoneyDirection.Out;
}
