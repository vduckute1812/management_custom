/** Savings goal lifecycle. */
export const MoneySavingsGoalStatus = {
  Active: 0,
  Completed: 1,
  Archived: 2,
} as const;
export type MoneySavingsGoalStatus =
  (typeof MoneySavingsGoalStatus)[keyof typeof MoneySavingsGoalStatus];
export const MONEY_SAVINGS_GOAL_STATUSES = [
  MoneySavingsGoalStatus.Active,
  MoneySavingsGoalStatus.Completed,
  MoneySavingsGoalStatus.Archived,
] as const;

export const MONEY_SAVINGS_GOAL_STATUS_I18N_KEYS: Record<
  MoneySavingsGoalStatus,
  string
> = {
  [MoneySavingsGoalStatus.Active]: "money.savings.status.active",
  [MoneySavingsGoalStatus.Completed]: "money.savings.status.completed",
  [MoneySavingsGoalStatus.Archived]: "money.savings.status.archived",
};

export interface MoneySavingsContribution {
  id: string;
  goalId: string;
  occurredOn: string;
  amountMinor: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MoneySavingsGoal {
  id: string;
  title: string;
  /** Target amount (≥ 0). */
  targetMinor: number;
  status: MoneySavingsGoalStatus;
  /** Optional deadline YYYY-MM-DD. */
  targetDate?: string;
  note?: string;
  /** Sum of contributions (derived). */
  savedMinor: number;
  /** savedMinor / targetMinor, capped conceptually in UI (derived). */
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export function isMoneySavingsGoalStatus(
  value: unknown,
): value is MoneySavingsGoalStatus {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (MONEY_SAVINGS_GOAL_STATUSES as readonly number[]).includes(value)
  );
}

export function toMoneySavingsGoalStatus(
  value: unknown,
): MoneySavingsGoalStatus {
  return isMoneySavingsGoalStatus(value)
    ? value
    : MoneySavingsGoalStatus.Active;
}

export function savingsProgress(
  savedMinor: number,
  targetMinor: number,
): number {
  if (!Number.isFinite(savedMinor) || savedMinor <= 0) return 0;
  if (!Number.isFinite(targetMinor) || targetMinor <= 0) return 0;
  return savedMinor / targetMinor;
}
