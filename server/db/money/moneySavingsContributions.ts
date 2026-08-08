/**
 * Money savings contributions: list / add / get / delete.
 */
import type { ResultSetHeader } from "mysql2/promise";
import {
  MoneySavingsGoalStatus,
  type MoneySavingsContribution,
} from "~/types/money";
import { isoToDB } from "../core/datetime";
import { generateId, nowISO } from "../core/ids";
import { getPool } from "../core/pool";
import {
  encodeTimestampCursor,
  parseTimestampCursor,
} from "../core/timestampCursor";
import { SAVINGS_CONTRIBUTIONS_PAGE_SIZE } from "../../utils/listLimits";
import { getMoneySavingsGoalById } from "./moneySavingsGoals";
import { type ContribRow, rowToContribution } from "./moneySavingsShared";

export async function listMoneySavingsContributions(
  userId: string,
  goalId: string,
  options: { limit?: number; cursor?: string | null } = {},
): Promise<{
  contributions: MoneySavingsContribution[];
  nextCursor: string | null;
}> {
  const goal = await getMoneySavingsGoalById(userId, goalId);
  if (!goal) return { contributions: [], nextCursor: null };
  const pool = getPool();
  const limit = Math.min(
    Math.max(options.limit ?? SAVINGS_CONTRIBUTIONS_PAGE_SIZE, 1),
    100,
  );
  const params: unknown[] = [goalId, userId];
  let cursorClause = "";
  if (options.cursor) {
    const cursor = parseTimestampCursor(options.cursor);
    const occurredOn = cursor.timestamp.slice(0, 10);
    cursorClause = `AND (
      occurred_on < ?
      OR (occurred_on = ? AND id < ?)
    )`;
    params.push(occurredOn, occurredOn, cursor.id);
  }
  params.push(limit + 1);
  const [rows] = await pool.query<ContribRow[]>(
    `SELECT * FROM money_savings_contributions
     WHERE goal_id = ? AND user_id = ?
       ${cursorClause}
     ORDER BY occurred_on DESC, id DESC
     LIMIT ?`,
    params,
  );
  const hasMore = rows.length > limit;
  const contributions = (hasMore ? rows.slice(0, limit) : rows).map(
    rowToContribution,
  );
  const last = contributions[contributions.length - 1];
  return {
    contributions,
    nextCursor:
      hasMore && last
        ? encodeTimestampCursor(`${last.occurredOn}T00:00:00.000Z`, last.id)
        : null,
  };
}

export interface AddMoneySavingsContributionInput {
  goalId: string;
  occurredOn: string;
  amountMinor: number;
  note?: string | null;
}

export async function addMoneySavingsContribution(
  userId: string,
  input: AddMoneySavingsContributionInput,
): Promise<MoneySavingsContribution> {
  const goal = await getMoneySavingsGoalById(userId, input.goalId);
  if (!goal) {
    const err = new Error("NOT_FOUND");
    (err as { code?: string }).code = "NOT_FOUND";
    throw err;
  }
  const pool = getPool();
  const now = nowISO();
  const id = generateId("msc");
  const note = input.note?.trim() || null;
  await pool.query(
    `INSERT INTO money_savings_contributions
      (id, goal_id, user_id, occurred_on, amount_minor, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.goalId,
      userId,
      input.occurredOn,
      input.amountMinor,
      note,
      isoToDB(now),
      isoToDB(now),
    ],
  );
  // Auto-complete when target reached and still Active.
  if (
    goal.status === MoneySavingsGoalStatus.Active &&
    goal.targetMinor > 0 &&
    goal.savedMinor + input.amountMinor >= goal.targetMinor
  ) {
    await pool.query(
      `UPDATE money_savings_goals SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      [MoneySavingsGoalStatus.Completed, isoToDB(now), input.goalId, userId],
    );
  } else {
    await pool.query(
      `UPDATE money_savings_goals SET updated_at = ? WHERE id = ? AND user_id = ?`,
      [isoToDB(now), input.goalId, userId],
    );
  }
  const [rows] = await pool.query<ContribRow[]>(
    `SELECT * FROM money_savings_contributions WHERE id = ? LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw new Error("addMoneySavingsContribution: insert vanished");
  return rowToContribution(row);
}

export async function getMoneySavingsContributionById(
  userId: string,
  id: string,
): Promise<MoneySavingsContribution | null> {
  const pool = getPool();
  const [rows] = await pool.query<ContribRow[]>(
    `SELECT * FROM money_savings_contributions WHERE id = ? AND user_id = ? LIMIT 1`,
    [id, userId],
  );
  const row = rows[0];
  return row ? rowToContribution(row) : null;
}

export async function deleteMoneySavingsContribution(
  userId: string,
  id: string,
): Promise<boolean> {
  const existing = await getMoneySavingsContributionById(userId, id);
  if (!existing) return false;
  const pool = getPool();
  const [result] = await pool.query<ResultSetHeader>(
    `DELETE FROM money_savings_contributions WHERE id = ? AND user_id = ?`,
    [id, userId],
  );
  if ((result.affectedRows ?? 0) > 0) {
    await pool.query(
      `UPDATE money_savings_goals SET updated_at = ? WHERE id = ? AND user_id = ?`,
      [isoToDB(nowISO()), existing.goalId, userId],
    );
  }
  return (result.affectedRows ?? 0) > 0;
}
