/**
 * Money savings goals: list / get / upsert / delete.
 */
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  type MoneySavingsGoal,
  type MoneySavingsGoalStatus as MoneySavingsGoalStatusT,
} from "~/types/money";
import { isoToDB } from "../core/datetime";
import { generateId, nowISO } from "../core/ids";
import { getPool } from "../core/pool";
import { SAVINGS_GOALS_MAX } from "../../utils/listLimits";
import { type GoalRow, rowToGoal } from "./moneySavingsShared";

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
       g.id DESC
     LIMIT ?`,
    [userId, userId, SAVINGS_GOALS_MAX],
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
