/**
 * Shared mappers for money savings goals and contributions.
 */
import type { RowDataPacket } from "mysql2/promise";
import {
  savingsProgress,
  toMoneySavingsGoalStatus,
  type MoneySavingsContribution,
  type MoneySavingsGoal,
} from "~/types/money";
import { dbToISO } from "../core/datetime";

export interface GoalRow extends RowDataPacket {
  id: string;
  user_id: string;
  title: string;
  target_minor: number | string;
  status: number;
  target_date: string | Date | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  saved_minor?: number | string;
}

export interface ContribRow extends RowDataPacket {
  id: string;
  goal_id: string;
  user_id: string;
  occurred_on: string | Date;
  amount_minor: number | string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export function dateOnlyFromDb(
  value: string | Date | null | undefined,
): string | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const s = String(value).slice(0, 10);
  return s || undefined;
}

export function rowToGoal(r: GoalRow): MoneySavingsGoal {
  const targetMinor = Number(r.target_minor);
  const savedMinor = Number(r.saved_minor ?? 0);
  return {
    id: r.id,
    title: r.title,
    targetMinor,
    status: toMoneySavingsGoalStatus(r.status),
    targetDate: dateOnlyFromDb(r.target_date),
    note: r.note ?? undefined,
    savedMinor,
    progress: savingsProgress(savedMinor, targetMinor),
    createdAt: dbToISO(r.created_at),
    updatedAt: dbToISO(r.updated_at),
  };
}

export function rowToContribution(r: ContribRow): MoneySavingsContribution {
  return {
    id: r.id,
    goalId: r.goal_id,
    occurredOn:
      dateOnlyFromDb(r.occurred_on) ?? String(r.occurred_on).slice(0, 10),
    amountMinor: Number(r.amount_minor),
    note: r.note ?? undefined,
    createdAt: dbToISO(r.created_at),
    updatedAt: dbToISO(r.updated_at),
  };
}
