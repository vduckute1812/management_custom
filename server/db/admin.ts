import type { RowDataPacket } from "mysql2/promise";
import { roundHours } from "./compute";
import { dbToISO } from "./datetime";
import { getPool } from "./pool";
import { TaskStatus, type UserRole } from "./types";

// `TaskStatus` is simultaneously a runtime const object (`TaskStatus.Done === 2`)
// and a numeric union type (`0 | 1 | 2`). The single import above brings both
// shapes into scope.

/**
 * Admin cross-user aggregations.
 *
 * UNSCOPED reads — callers MUST already have verified `role=admin`
 * (see `server/utils/authContext.ts#requireAdmin`).
 */

// -------------------------------------------------------------------------
// Per-user summary table
// -------------------------------------------------------------------------

export interface AdminUserSummaryRow {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  taskCount: number;
  epicCount: number;
  hoursLogged: number;
  lastActivity?: string;
  lastLoginAt?: string;
}

export async function getAdminUserSummaries(): Promise<AdminUserSummaryRow[]> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       u.id, u.email, u.name, u.role, u.email_verified,
       u.created_at, u.updated_at, u.last_login_at,
       (SELECT COUNT(*) FROM tasks t WHERE t.user_id = u.id)       AS task_count,
       (SELECT COUNT(*) FROM epics e WHERE e.user_id = u.id)       AS epic_count,
       COALESCE((
         SELECT SUM(b.spent_hours)
           FROM time_blocks b
           JOIN tasks t2 ON t2.id = b.task_id
          WHERE t2.user_id = u.id
       ), 0) AS hours_logged,
       (
         SELECT MAX(b.end_at)
           FROM time_blocks b
           JOIN tasks t3 ON t3.id = b.task_id
          WHERE t3.user_id = u.id
       ) AS last_activity
       FROM users u
       ORDER BY u.created_at ASC`
  );
  return rows.map((r) => ({
    id: String(r.id),
    email: String(r.email),
    name: r.name ?? undefined,
    role: coerceRole(Number(r.role)),
    emailVerified: Number(r.email_verified) === 1,
    createdAt: dbToISO(String(r.created_at)),
    updatedAt: dbToISO(String(r.updated_at)),
    taskCount: Number(r.task_count ?? 0),
    epicCount: Number(r.epic_count ?? 0),
    hoursLogged: roundHours(Number(r.hours_logged ?? 0)),
    lastActivity: r.last_activity ? dbToISO(String(r.last_activity)) : undefined,
    lastLoginAt: r.last_login_at ? dbToISO(String(r.last_login_at)) : undefined,
  }));
}

function coerceRole(n: number): UserRole {
  if (n >= 2) return 2 as UserRole;
  if (n === 1) return 1 as UserRole;
  return 0 as UserRole;
}

function coerceStatus(n: number): TaskStatus {
  if (n === TaskStatus.Done) return TaskStatus.Done;
  if (n === TaskStatus.InProgress) return TaskStatus.InProgress;
  return TaskStatus.Todo;
}

// -------------------------------------------------------------------------
// Daily activity series
// -------------------------------------------------------------------------

export interface DailyHoursRow {
  date: string;
  hours: number;
}

/** Total hours logged per day across all users (last `days` days). */
export async function getDailyHoursAllUsers(
  days = 30
): Promise<DailyHoursRow[]> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DATE(b.end_at) AS d,
            COALESCE(SUM(b.spent_hours), 0) AS h
       FROM time_blocks b
      WHERE b.end_at >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY)
      GROUP BY DATE(b.end_at)
      ORDER BY DATE(b.end_at) ASC`,
    [days]
  );
  return rows.map((r) => ({
    date: String(r.d),
    hours: roundHours(Number(r.h ?? 0)),
  }));
}

// -------------------------------------------------------------------------
// Status breakdown
// -------------------------------------------------------------------------

export interface TaskStatusBucket {
  status: TaskStatus;
  count: number;
}

export async function getStatusBreakdownAllUsers(): Promise<TaskStatusBucket[]> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT status, COUNT(*) AS n FROM tasks GROUP BY status`
  );
  const out: TaskStatusBucket[] = [
    { status: TaskStatus.Todo, count: 0 },
    { status: TaskStatus.InProgress, count: 0 },
    { status: TaskStatus.Done, count: 0 },
  ];
  for (const r of rows) {
    const status = coerceStatus(Number(r.status));
    const bucket = out.find((b) => b.status === status);
    if (bucket) bucket.count = Number(r.n);
  }
  return out;
}
