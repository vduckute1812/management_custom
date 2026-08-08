/**
 * Task reads: list + get-by-id with optional block/checklist hydration.
 */
import { isoToDB } from "../core/datetime";
import { rowToTask, type TaskRow } from "../core/mappers";
import { getPool } from "../core/pool";
import type { ChecklistItem, Task, TimeBlock } from "../core/types";
import { roundHours } from "../core/compute";
import { parseTimestampCursor } from "../core/timestampCursor";
import { TASKS_UNSCOPED_MAX } from "../../utils/listLimits";
import {
  loadBlocksByTask,
  loadChecklistByTask,
  loadSpentByTask,
} from "./tasksLoaders";

/**
 * Return all tasks for `userId`.
 *
 * Default (light) mode omits child arrays and instead attaches `spentHours`
 * via a single GROUP BY aggregate — cheaper than fetching every block row
 * when the caller only needs list metadata or epic roll-ups.
 *
 * Pass `includeBlocks: true` to load full `timeBlocks` arrays (required for
 * the calendar and task-editing views). Pass `includeChecklists: true` to
 * load `checklist` items (required by the task edit modal).
 */
export async function getAllTasks(
  userId: string,
  opts?: {
    includeBlocks?: boolean;
    includeChecklists?: boolean;
    limit?: number;
    cursor?: string | null;
    epicIds?: string[];
  },
): Promise<Task[]> {
  const includeBlocks = opts?.includeBlocks ?? false;
  const includeChecklists = opts?.includeChecklists ?? false;
  if (opts?.epicIds && opts.epicIds.length === 0) return [];

  const pool = getPool();
  const clauses = ["user_id = ?"];
  const params: unknown[] = [userId];
  if (opts?.epicIds) {
    clauses.push(`epic_id IN (${opts.epicIds.map(() => "?").join(",")})`);
    params.push(...opts.epicIds);
  }
  if (opts?.cursor) {
    const cursor = parseTimestampCursor(opts.cursor);
    const timestamp = isoToDB(cursor.timestamp);
    clauses.push("(updated_at < ? OR (updated_at = ? AND id < ?))");
    params.push(timestamp, timestamp, cursor.id);
  }
  const limit = opts?.limit ?? TASKS_UNSCOPED_MAX;
  params.push(limit);
  const [taskRows] = await pool.query<TaskRow[]>(
    `SELECT * FROM tasks
     WHERE ${clauses.join(" AND ")}
     ORDER BY updated_at DESC, id DESC
     LIMIT ?`,
    params,
  );
  const ids = taskRows.map((r) => r.id);

  const [blocksMap, checklistsMap] = await Promise.all([
    includeBlocks
      ? loadBlocksByTask(pool, ids)
      : Promise.resolve(new Map<string, TimeBlock[]>()),
    includeChecklists
      ? loadChecklistByTask(pool, ids)
      : Promise.resolve(new Map<string, ChecklistItem[]>()),
  ]);

  const tasks = taskRows.map((r) =>
    rowToTask(r, blocksMap.get(r.id) ?? [], checklistsMap.get(r.id) ?? []),
  );

  if (!includeBlocks) {
    // Attach aggregate spentHours so the light response is still accurate.
    const spentMap = await loadSpentByTask(pool, ids);
    for (const task of tasks) {
      task.spentHours = roundHours(spentMap.get(task.id) ?? 0);
    }
  }

  return tasks;
}

export async function getTaskById(
  userId: string,
  id: string,
): Promise<Task | null> {
  const pool = getPool();
  const [taskRows] = await pool.query<TaskRow[]>(
    "SELECT * FROM tasks WHERE id = ? AND user_id = ? LIMIT 1",
    [id, userId],
  );
  const taskRow = taskRows[0];
  if (!taskRow) return null;
  const [blocks, checklists] = await Promise.all([
    loadBlocksByTask(pool, [id]),
    loadChecklistByTask(pool, [id]),
  ]);
  return rowToTask(taskRow, blocks.get(id) ?? [], checklists.get(id) ?? []);
}
