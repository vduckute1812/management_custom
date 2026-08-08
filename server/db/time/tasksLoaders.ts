/**
 * Batch child loaders for tasks (blocks, checklist, spent aggregate).
 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  rowToBlock,
  rowToChecklistItem,
  type BlockRow,
  type ChecklistRow,
} from "../core/mappers";
import type { ChecklistItem, TimeBlock } from "../core/types";

interface SpentAggRow extends RowDataPacket {
  task_id: string;
  spent: number;
}

export async function loadBlocksByTask(
  conn: PoolConnection | Pool,
  taskIds: string[],
): Promise<Map<string, TimeBlock[]>> {
  const out = new Map<string, TimeBlock[]>();
  if (taskIds.length === 0) return out;
  const placeholders = taskIds.map(() => "?").join(",");
  const [rows] = await conn.query<BlockRow[]>(
    `SELECT * FROM time_blocks WHERE task_id IN (${placeholders}) ORDER BY start_at ASC`,
    taskIds,
  );
  for (const row of rows) {
    const list = out.get(row.task_id) ?? [];
    list.push(rowToBlock(row));
    out.set(row.task_id, list);
  }
  return out;
}

export async function loadChecklistByTask(
  conn: PoolConnection | Pool,
  taskIds: string[],
): Promise<Map<string, ChecklistItem[]>> {
  const out = new Map<string, ChecklistItem[]>();
  if (taskIds.length === 0) return out;
  const placeholders = taskIds.map(() => "?").join(",");
  const [rows] = await conn.query<ChecklistRow[]>(
    `SELECT * FROM checklist_items WHERE task_id IN (${placeholders}) ORDER BY task_id, position ASC`,
    taskIds,
  );
  for (const row of rows) {
    const list = out.get(row.task_id) ?? [];
    list.push(rowToChecklistItem(row));
    out.set(row.task_id, list);
  }
  return out;
}

/**
 * Aggregate `SUM(spent_hours)` per task without loading individual block rows.
 * Used by the light path when `includeBlocks` is false.
 */
export async function loadSpentByTask(
  conn: PoolConnection | Pool,
  taskIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (taskIds.length === 0) return out;
  const placeholders = taskIds.map(() => "?").join(",");
  const [rows] = await conn.query<SpentAggRow[]>(
    `SELECT task_id, COALESCE(SUM(spent_hours), 0) AS spent
     FROM time_blocks
     WHERE task_id IN (${placeholders})
     GROUP BY task_id`,
    taskIds,
  );
  for (const row of rows) {
    out.set(row.task_id, Number(row.spent));
  }
  return out;
}
