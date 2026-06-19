import type { Pool, PoolConnection } from "mysql2/promise";
import { dateOnlyOrNull, isoToDB, jsonOrNull } from "./datetime";
import {
  rowToBlock,
  rowToChecklistItem,
  rowToTask,
  type BlockRow,
  type ChecklistRow,
  type TaskRow,
} from "./mappers";
import { getPool } from "./pool";
import {
  TaskPriority,
  type ChecklistItem,
  type Task,
  type TimeBlock,
} from "./types";

// -------------------------------------------------------------------------
// Child loaders — kept private; the only consumers are getAllTasks /
// getTaskById, which always need blocks + checklist alongside the parent.
// -------------------------------------------------------------------------

async function loadBlocksByTask(
  conn: PoolConnection | Pool,
  taskIds: string[]
): Promise<Map<string, TimeBlock[]>> {
  const out = new Map<string, TimeBlock[]>();
  if (taskIds.length === 0) return out;
  const placeholders = taskIds.map(() => "?").join(",");
  const [rows] = await conn.query<BlockRow[]>(
    `SELECT * FROM time_blocks WHERE task_id IN (${placeholders}) ORDER BY start_at ASC`,
    taskIds
  );
  for (const row of rows) {
    const list = out.get(row.task_id) ?? [];
    list.push(rowToBlock(row));
    out.set(row.task_id, list);
  }
  return out;
}

async function loadChecklistByTask(
  conn: PoolConnection | Pool,
  taskIds: string[]
): Promise<Map<string, ChecklistItem[]>> {
  const out = new Map<string, ChecklistItem[]>();
  if (taskIds.length === 0) return out;
  const placeholders = taskIds.map(() => "?").join(",");
  const [rows] = await conn.query<ChecklistRow[]>(
    `SELECT * FROM checklist_items WHERE task_id IN (${placeholders}) ORDER BY task_id, position ASC`,
    taskIds
  );
  for (const row of rows) {
    const list = out.get(row.task_id) ?? [];
    list.push(rowToChecklistItem(row));
    out.set(row.task_id, list);
  }
  return out;
}

// -------------------------------------------------------------------------
// Task reads
// -------------------------------------------------------------------------

export async function getAllTasks(userId: string): Promise<Task[]> {
  const pool = getPool();
  const [taskRows] = await pool.query<TaskRow[]>(
    "SELECT * FROM tasks WHERE user_id = ?",
    [userId]
  );
  const ids = taskRows.map((r) => r.id);
  const blocks = await loadBlocksByTask(pool, ids);
  const checklists = await loadChecklistByTask(pool, ids);
  return taskRows.map((r) =>
    rowToTask(r, blocks.get(r.id) ?? [], checklists.get(r.id) ?? [])
  );
}

export async function getTaskById(
  userId: string,
  id: string
): Promise<Task | null> {
  const pool = getPool();
  const [taskRows] = await pool.query<TaskRow[]>(
    "SELECT * FROM tasks WHERE id = ? AND user_id = ? LIMIT 1",
    [id, userId]
  );
  if (!taskRows.length) return null;
  const blocks = await loadBlocksByTask(pool, [id]);
  const checklists = await loadChecklistByTask(pool, [id]);
  return rowToTask(
    taskRows[0],
    blocks.get(id) ?? [],
    checklists.get(id) ?? []
  );
}

// -------------------------------------------------------------------------
// Task writes
// -------------------------------------------------------------------------

/**
 * Insert or replace a task with all its children (blocks + checklist) in
 * one transaction, scoped to `userId`. The child arrays are treated as the
 * canonical state — any block/checklist row that's no longer in the input
 * is removed. Cross-user epic references are rejected before this is
 * called (see `server/api/tasks/index.post.ts`).
 */
export async function upsertTask(userId: string, task: Task): Promise<void> {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Defense-in-depth: if a row with this id already exists, it MUST belong
    // to `userId`. Without this, the unconditional DELETE-then-INSERT on
    // children below would happily wipe another user's blocks/checklist
    // even though the parent row is protected by the user_id IF() guards.
    const [existing] = await conn.query<TaskRow[]>(
      "SELECT user_id FROM tasks WHERE id = ? LIMIT 1",
      [task.id]
    );
    if (existing.length && existing[0].user_id !== userId) {
      await conn.rollback();
      throw new Error(
        `upsertTask: task ${task.id} is owned by another user; refusing to overwrite`
      );
    }

    await conn.query(
      `INSERT INTO tasks
        (id, user_id, epic_id, title, notes, status, priority, due_date,
         estimated_hours, progress, tags,
         recurrence_rule, recurrence_interval, recurrence_until,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         epic_id = IF(user_id = VALUES(user_id), VALUES(epic_id), epic_id),
         title = IF(user_id = VALUES(user_id), VALUES(title), title),
         notes = IF(user_id = VALUES(user_id), VALUES(notes), notes),
         status = IF(user_id = VALUES(user_id), VALUES(status), status),
         priority = IF(user_id = VALUES(user_id), VALUES(priority), priority),
         due_date = IF(user_id = VALUES(user_id), VALUES(due_date), due_date),
         estimated_hours = IF(user_id = VALUES(user_id), VALUES(estimated_hours), estimated_hours),
         progress = IF(user_id = VALUES(user_id), VALUES(progress), progress),
         tags = IF(user_id = VALUES(user_id), VALUES(tags), tags),
         recurrence_rule = IF(user_id = VALUES(user_id), VALUES(recurrence_rule), recurrence_rule),
         recurrence_interval = IF(user_id = VALUES(user_id), VALUES(recurrence_interval), recurrence_interval),
         recurrence_until = IF(user_id = VALUES(user_id), VALUES(recurrence_until), recurrence_until),
         updated_at = IF(user_id = VALUES(user_id), VALUES(updated_at), updated_at)`,
      [
        task.id,
        userId,
        task.epicId ?? null,
        task.title,
        task.notes ?? null,
        task.status,
        task.priority ?? TaskPriority.Normal,
        dateOnlyOrNull(task.dueDate),
        task.estimatedHours ?? null,
        task.progress ?? null,
        jsonOrNull(task.tags ?? []),
        task.recurrence ? task.recurrence.rule : null,
        task.recurrence?.interval ?? null,
        task.recurrence?.until ?? null,
        isoToDB(task.createdAt),
        isoToDB(task.updatedAt),
      ]
    );

    // Replace children. Treating the input as canonical mirrors the JSON
    // round-trip semantics the rest of the app already assumes.
    await conn.query("DELETE FROM time_blocks WHERE task_id = ?", [task.id]);
    const blocks = task.timeBlocks ?? [];
    if (blocks.length) {
      const values: unknown[] = [];
      const rows = blocks.map((b) => {
        values.push(
          b.id,
          task.id,
          isoToDB(b.start),
          isoToDB(b.end),
          b.spentHours ?? null
        );
        return "(?, ?, ?, ?, ?)";
      });
      await conn.query(
        `INSERT INTO time_blocks (id, task_id, start_at, end_at, spent_hours) VALUES ${rows.join(",")}`,
        values
      );
    }

    await conn.query("DELETE FROM checklist_items WHERE task_id = ?", [
      task.id,
    ]);
    const checklist = task.checklist ?? [];
    if (checklist.length) {
      const values: unknown[] = [];
      const rows = checklist.map((c, idx) => {
        values.push(c.id, task.id, c.text, c.done ? 1 : 0, idx);
        return "(?, ?, ?, ?, ?)";
      });
      await conn.query(
        `INSERT INTO checklist_items (id, task_id, text, done, position) VALUES ${rows.join(",")}`,
        values
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function deleteTask(
  userId: string,
  id: string
): Promise<Task | null> {
  const existing = await getTaskById(userId, id);
  if (!existing) return null;
  const pool = getPool();
  // Explicit user_id in the DELETE is belt-and-suspenders — getTaskById has
  // already filtered, but keeping the predicate prevents accidental cross-user
  // deletion if a future caller skips the pre-check.
  await pool.query("DELETE FROM tasks WHERE id = ? AND user_id = ?", [
    id,
    userId,
  ]);
  return existing;
}

/**
 * Append a single time block to a task (used by the timer endpoints). The
 * caller is expected to have verified ownership; we still re-check here so
 * the helper is safe to call directly.
 */
export async function appendBlock(
  userId: string,
  taskId: string,
  block: TimeBlock,
  updatedAt: string
): Promise<void> {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [ownerRows] = await conn.query<TaskRow[]>(
      "SELECT id FROM tasks WHERE id = ? AND user_id = ? LIMIT 1",
      [taskId, userId]
    );
    if (!ownerRows.length) {
      await conn.rollback();
      throw new Error(`appendBlock: task ${taskId} not owned by ${userId}`);
    }
    await conn.query(
      "INSERT INTO time_blocks (id, task_id, start_at, end_at, spent_hours) VALUES (?, ?, ?, ?, ?)",
      [
        block.id,
        taskId,
        isoToDB(block.start),
        isoToDB(block.end),
        block.spentHours ?? null,
      ]
    );
    await conn.query(
      "UPDATE tasks SET updated_at = ? WHERE id = ? AND user_id = ?",
      [isoToDB(updatedAt), taskId, userId]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
