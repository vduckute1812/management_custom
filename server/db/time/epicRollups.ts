/**
 * Per-epic task rollups for list/detail hydration without loading every task row.
 */
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "../core/pool";
import { roundHours } from "../core/compute";

export interface EpicTaskRollup {
  epicId: string;
  taskCount: number;
  estimatedHours: number;
  spentHours: number;
  progress: number;
}

interface EpicRollupRow extends RowDataPacket {
  epic_id: string;
  task_count: number | string;
  estimated_hours: number | string;
  spent_hours: number | string;
  progress: number | string | null;
}

/**
 * Aggregate task count / hours / progress for the given epics in one query.
 * Prefer this over `getAllTasks({ epicIds, limit: 2000 })` on list endpoints.
 */
export async function listEpicTaskRollups(
  userId: string,
  epicIds: string[],
): Promise<Map<string, EpicTaskRollup>> {
  const out = new Map<string, EpicTaskRollup>();
  if (!userId || epicIds.length === 0) return out;

  const pool = getPool();
  const placeholders = epicIds.map(() => "?").join(",");
  const [rows] = await pool.query<EpicRollupRow[]>(
    `SELECT
       t.epic_id AS epic_id,
       COUNT(*) AS task_count,
       COALESCE(SUM(t.estimated_hours), 0) AS estimated_hours,
       COALESCE(SUM(COALESCE(s.spent, 0)), 0) AS spent_hours,
       CASE
         WHEN COALESCE(SUM(t.estimated_hours), 0) > 0 THEN
           ROUND(
             SUM(COALESCE(t.progress, 0) * COALESCE(t.estimated_hours, 0))
             / SUM(t.estimated_hours)
           )
         ELSE
           ROUND(AVG(COALESCE(t.progress, 0)))
       END AS progress
     FROM tasks t
     LEFT JOIN (
       SELECT task_id, COALESCE(SUM(spent_hours), 0) AS spent
       FROM time_blocks
       GROUP BY task_id
     ) s ON s.task_id = t.id
     WHERE t.user_id = ?
       AND t.epic_id IN (${placeholders})
     GROUP BY t.epic_id`,
    [userId, ...epicIds],
  );

  for (const row of rows) {
    const epicId = String(row.epic_id);
    out.set(epicId, {
      epicId,
      taskCount: Number(row.task_count) || 0,
      estimatedHours: roundHours(Number(row.estimated_hours) || 0),
      spentHours: roundHours(Number(row.spent_hours) || 0),
      progress: Math.round(Number(row.progress) || 0),
    });
  }
  return out;
}
