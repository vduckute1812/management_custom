import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  MoneySavingsGoalStatus,
  savingsProgress,
  toMoneySavingsGoalStatus,
  type MoneySavingsContribution,
  type MoneySavingsGoal,
  type MoneySavingsGoalStatus as MoneySavingsGoalStatusT,
} from "../../types/money";
import { dbToISO, isoToDB } from "./datetime";
import { generateId, nowISO } from "./ids";
import { getPool } from "./pool";
import { encodeTimestampCursor, parseTimestampCursor } from "./timestampCursor";
import { SAVINGS_CONTRIBUTIONS_PAGE_SIZE } from "../utils/listLimits";

interface GoalRow extends RowDataPacket {
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

interface ContribRow extends RowDataPacket {
  id: string;
  goal_id: string;
  user_id: string;
  occurred_on: string | Date;
  amount_minor: number | string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

function dateOnlyFromDb(
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

function rowToGoal(r: GoalRow): MoneySavingsGoal {
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

function rowToContribution(r: ContribRow): MoneySavingsContribution {
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

export async function listMoneySavingsGoals(
  userId: string,
): Promise<MoneySavingsGoal[]> {
  const pool = getPool();
  // Aggregate via LEFT JOIN once (not a correlated SUM per goal row).
  const [rows] = await pool.query<GoalRow[]>(
    `SELECT g.*,
       COALESCE(s.saved_minor, 0) AS saved_minor
     FROM money_savings_goals g
     LEFT JOIN (
       SELECT c.goal_id, SUM(c.amount_minor) AS saved_minor
         FROM money_savings_contributions c
         INNER JOIN money_savings_goals g2 ON g2.id = c.goal_id
        WHERE g2.user_id = ?
        GROUP BY c.goal_id
     ) s ON s.goal_id = g.id
     WHERE g.user_id = ?
     ORDER BY
       CASE g.status WHEN 0 THEN 0 WHEN 1 THEN 1 ELSE 2 END,
       g.updated_at DESC,
       g.id DESC`,
    [userId, userId],
  );
  return rows.map(rowToGoal);
}

export async function getMoneySavingsGoalById(
  userId: string,
  id: string,
): Promise<MoneySavingsGoal | null> {
  const pool = getPool();
  const [rows] = await pool.query<GoalRow[]>(
    `SELECT g.*,
       COALESCE(s.saved_minor, 0) AS saved_minor
     FROM money_savings_goals g
     LEFT JOIN (
       SELECT goal_id, SUM(amount_minor) AS saved_minor
         FROM money_savings_contributions
        WHERE goal_id = ?
        GROUP BY goal_id
     ) s ON s.goal_id = g.id
     WHERE g.user_id = ? AND g.id = ?
     LIMIT 1`,
    [id, userId, id],
  );
  const row = rows[0];
  return row ? rowToGoal(row) : null;
}

export async function moneySavingsGoalIdExists(id: string): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM money_savings_goals WHERE id = ? LIMIT 1`,
    [id],
  );
  return Boolean(rows[0]);
}

export interface UpsertMoneySavingsGoalInput {
  id?: string;
  title: string;
  targetMinor: number;
  status: MoneySavingsGoalStatusT;
  targetDate?: string | null;
  note?: string | null;
}

export async function upsertMoneySavingsGoal(
  userId: string,
  input: UpsertMoneySavingsGoalInput,
): Promise<{ goal: MoneySavingsGoal; created: boolean }> {
  const pool = getPool();
  const now = nowISO();
  const note = input.note?.trim() || null;
  const title = input.title.trim();
  const targetDate = input.targetDate || null;

  if (input.id) {
    const existing = await getMoneySavingsGoalById(userId, input.id);
    if (existing) {
      await pool.query(
        `UPDATE money_savings_goals
         SET title = ?, target_minor = ?, status = ?, target_date = ?,
             note = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        [
          title,
          input.targetMinor,
          input.status,
          targetDate,
          note,
          isoToDB(now),
          input.id,
          userId,
        ],
      );
      const updated = await getMoneySavingsGoalById(userId, input.id);
      if (!updated) throw new Error("upsertMoneySavingsGoal: update vanished");
      return { goal: updated, created: false };
    }
    if (await moneySavingsGoalIdExists(input.id)) {
      const err = new Error("NOT_FOUND");
      (err as { code?: string }).code = "NOT_FOUND";
      throw err;
    }
  }

  const id = generateId("msg");
  await pool.query(
    `INSERT INTO money_savings_goals
      (id, user_id, title, target_minor, status, target_date, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      title,
      input.targetMinor,
      input.status,
      targetDate,
      note,
      isoToDB(now),
      isoToDB(now),
    ],
  );
  const created = await getMoneySavingsGoalById(userId, id);
  if (!created) throw new Error("upsertMoneySavingsGoal: insert vanished");
  return { goal: created, created: true };
}

export async function deleteMoneySavingsGoal(
  userId: string,
  id: string,
): Promise<boolean> {
  const pool = getPool();
  const [result] = await pool.query<ResultSetHeader>(
    `DELETE FROM money_savings_goals WHERE id = ? AND user_id = ?`,
    [id, userId],
  );
  return (result.affectedRows ?? 0) > 0;
}

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
