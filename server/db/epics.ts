import { dateOnlyOrNull, isoToDB, jsonOrNull } from "./datetime";
import { nowISO } from "./ids";
import { rowToEpic, type EpicRow } from "./mappers";
import { getPool } from "./pool";
import type { Epic } from "./types";

/**
 * Epic reads + writes — all scoped to the authenticated `userId`.
 *
 * Convention: every server-side helper takes `userId` as its first arg and
 * embeds it in both the query filter AND the row payload. Routes that need
 * to see all users' data (admin dashboards) use the per-entity
 * `*ForAllUsers` variants in `./admin.ts`.
 */

export async function getAllEpics(userId: string): Promise<Epic[]> {
  const pool = getPool();
  const [rows] = await pool.query<EpicRow[]>(
    "SELECT * FROM epics WHERE user_id = ? ORDER BY created_at ASC",
    [userId]
  );
  return rows.map(rowToEpic);
}

export async function getEpicById(
  userId: string,
  id: string
): Promise<Epic | null> {
  const pool = getPool();
  const [rows] = await pool.query<EpicRow[]>(
    "SELECT * FROM epics WHERE id = ? AND user_id = ? LIMIT 1",
    [id, userId]
  );
  return rows.length ? rowToEpic(rows[0]) : null;
}

/**
 * Insert/update an epic owned by `userId`. The owning user is set on insert
 * and cannot be changed on update.
 */
export async function upsertEpic(userId: string, epic: Epic): Promise<void> {
  const pool = getPool();

  // Defense-in-depth: refuse to upsert an id owned by someone else. The
  // INSERT ... ON DUPLICATE KEY UPDATE guards every column with IF(user_id =
  // VALUES(user_id), VALUES(col), col), but it's clearer (and an audit
  // signal) to fail loudly than to silently no-op.
  const [existing] = await pool.query<EpicRow[]>(
    "SELECT user_id FROM epics WHERE id = ? LIMIT 1",
    [epic.id]
  );
  if (existing.length && existing[0].user_id !== userId) {
    throw new Error(
      `upsertEpic: epic ${epic.id} is owned by another user; refusing to overwrite`
    );
  }

  await pool.query(
    `INSERT INTO epics
      (id, user_id, title, description, status, color, due_date, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = IF(user_id = VALUES(user_id), VALUES(title), title),
       description = IF(user_id = VALUES(user_id), VALUES(description), description),
       status = IF(user_id = VALUES(user_id), VALUES(status), status),
       color = IF(user_id = VALUES(user_id), VALUES(color), color),
       due_date = IF(user_id = VALUES(user_id), VALUES(due_date), due_date),
       tags = IF(user_id = VALUES(user_id), VALUES(tags), tags),
       updated_at = IF(user_id = VALUES(user_id), VALUES(updated_at), updated_at)`,
    [
      epic.id,
      userId,
      epic.title,
      epic.description ?? null,
      epic.status,
      epic.color ?? null,
      dateOnlyOrNull(epic.dueDate),
      jsonOrNull(epic.tags ?? []),
      isoToDB(epic.createdAt),
      isoToDB(epic.updatedAt),
    ]
  );
}

/**
 * Delete an epic owned by `userId`. Per spec, child tasks (also owned by
 * the same user) survive but have their `epic_id` cleared and `updated_at`
 * bumped. Cross-user epic ids are silently treated as "not found".
 */
export async function deleteEpic(
  userId: string,
  id: string
): Promise<{ removed: Epic; orphanedTasks: number } | null> {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [epicRows] = await conn.query<EpicRow[]>(
      "SELECT * FROM epics WHERE id = ? AND user_id = ? LIMIT 1",
      [id, userId]
    );
    if (!epicRows.length) {
      await conn.rollback();
      return null;
    }
    const removed = rowToEpic(epicRows[0]);

    const [updateResult] = await conn.query(
      "UPDATE tasks SET updated_at = ? WHERE epic_id = ? AND user_id = ?",
      [isoToDB(nowISO()), id, userId]
    );
    const orphaned =
      (updateResult as { affectedRows?: number }).affectedRows ?? 0;

    await conn.query("DELETE FROM epics WHERE id = ? AND user_id = ?", [
      id,
      userId,
    ]);

    await conn.commit();
    return { removed, orphanedTasks: orphaned };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
