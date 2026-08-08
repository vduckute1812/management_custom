import type { MoneyCategory } from "./categories";
import type { MoneyDirection } from "./direction";
import type { MoneyUserCategory } from "./categories";

export interface MoneyTransaction {
  id: string;
  /** ISO date `YYYY-MM-DD` (calendar day in the user's intent). */
  occurredOn: string;
  /** Always ≥ 0 (minor units). */
  amountMinor: number;
  direction: MoneyDirection;
  /** Built-in category when not using a custom row. */
  category: MoneyCategory | null;
  /** Custom category id when not using a built-in. */
  userCategoryId?: string;
  /** Joined custom category (when userCategoryId is set). */
  userCategory?: MoneyUserCategory;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MoneyMonthTotals {
  yearMonth: string;
  inMinor: number;
  outMinor: number;
  netMinor: number;
}
