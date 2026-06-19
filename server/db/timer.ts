import { dbToISO, isoToDB } from "./datetime";
import type { TimerRow } from "./mappers";
import { getPool } from "./pool";
import type { RunningTimer } from "./types";

/**
 * Active timer — per-user singleton. Each user can have at most one
 * running timer; two users can run concurrent timers because the row is
 * keyed by user_id (see the `active_timer` DDL in `./schema.ts`).
 */

export async function getActiveTimer(
  userId: string
): Promise<RunningTimer | null> {
  const pool = getPool();
  const [rows] = await pool.query<TimerRow[]>(
    "SELECT * FROM active_timer WHERE user_id = ? LIMIT 1",
    [userId]
  );
  if (!rows.length) return null;
  return {
    taskId: rows[0].task_id,
    startedAt: dbToISO(rows[0].started_at),
  };
}

export async function setActiveTimer(
  userId: string,
  timer: RunningTimer | null
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
    [userId, timer.taskId, isoToDB(timer.startedAt)]
  );
}
