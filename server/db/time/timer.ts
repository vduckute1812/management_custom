import { dbToISO, isoToDB } from "../core/datetime";
import type { TimerRow } from "../core/mappers";
import { getPool } from "../core/pool";
import type { RunningTimer } from "../core/types";

/**
 * Active timer — per-user singleton. Each user can have at most one
 * running timer; two users can run concurrent timers because the row is
 * keyed by user_id (see the `active_timer` DDL in `./schema.ts`).
 */

export async function getActiveTimer(
  userId: string,
): Promise<RunningTimer | null> {
  const pool = getPool();
  const [rows] = await pool.query<TimerRow[]>(
    "SELECT * FROM active_timer WHERE user_id = ? LIMIT 1",
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    taskId: row.task_id,
    startedAt: dbToISO(row.started_at),
  };
}

export async function setActiveTimer(
  userId: string,
  timer: RunningTimer | null,
): Promise<void> {
  const pool = getPool();
  if (!timer) {
    await pool.query("DELETE FROM active_timer WHERE user_id = ?", [userId]);
    return;
  }
  await pool.query(
    `INSERT INTO active_timer (user_id, task_id, started_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       task_id = VALUES(task_id),
       started_at = VALUES(started_at)`,
    [userId, timer.taskId, isoToDB(timer.startedAt)],
  );
}
