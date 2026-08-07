import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { dbToISO, isoToDB } from "./datetime";
import { generateId, nowISO } from "./ids";
import { getPool } from "./pool";
import { JobStatus, type JobStatus as JobStatusValue } from "../../types/job";

export type { JobStatusValue as JobStatus };

export interface JobRow {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: JobStatusValue;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  lockedAt: string | null;
  lockedBy: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface JobDbRow extends RowDataPacket {
  id: string;
  type: string;
  payload: string | Record<string, unknown>;
  status: number;
  attempts: number;
  max_attempts: number;
  available_at: string;
  locked_at: string | null;
  locked_by: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function parsePayload(
  raw: string | Record<string, unknown>,
): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function toJobStatus(raw: number): JobStatusValue {
  const n = Number(raw);
  if (
    n === JobStatus.Pending ||
    n === JobStatus.Processing ||
    n === JobStatus.Completed ||
    n === JobStatus.Dead
  ) {
    return n;
  }
  return JobStatus.Pending;
}

function mapJob(row: JobDbRow): JobRow {
  return {
    id: row.id,
    type: row.type,
    payload: parsePayload(row.payload),
    status: toJobStatus(row.status),
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.max_attempts ?? 5),
    availableAt: dbToISO(row.available_at),
    lockedAt: row.locked_at ? dbToISO(row.locked_at) : null,
    lockedBy: row.locked_by,
    lastError: row.last_error,
    createdAt: dbToISO(row.created_at),
    updatedAt: dbToISO(row.updated_at),
  };
}

export async function enqueueJob(args: {
  type: string;
  payload: Record<string, unknown>;
  /** Delay before the job becomes claimable (seconds). */
  delaySeconds?: number;
  maxAttempts?: number;
}): Promise<JobRow> {
  const pool = getPool();
  const id = generateId("job");
  const now = nowISO();
  const delay = Math.max(0, args.delaySeconds ?? 0);
  const availableAt = new Date(Date.now() + delay * 1000).toISOString();
  const maxAttempts = Math.min(Math.max(args.maxAttempts ?? 5, 1), 25);

  await pool.query(
    `INSERT INTO jobs
       (id, type, payload, status, attempts, max_attempts, available_at,
        locked_at, locked_by, last_error, created_at, updated_at)
     VALUES (?, ?, CAST(? AS JSON), ?, 0, ?, ?, NULL, NULL, NULL, ?, ?)`,
    [
      id,
      args.type,
      JSON.stringify(args.payload ?? {}),
      JobStatus.Pending,
      maxAttempts,
      isoToDB(availableAt),
      isoToDB(now),
      isoToDB(now),
    ],
  );

  const job = await getJobById(id);
  if (!job) throw new Error(`enqueueJob: failed to reload ${id}`);
  return job;
}

export async function getJobById(id: string): Promise<JobRow | null> {
  const pool = getPool();
  const [rows] = await pool.query<JobDbRow[]>(
    `SELECT * FROM jobs WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ? mapJob(rows[0]) : null;
}

/**
 * Atomically claim the next available pending job for this worker.
 * Uses a short transaction + SELECT … FOR UPDATE SKIP LOCKED when available.
 */
export async function claimNextJob(workerId: string): Promise<JobRow | null> {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<JobDbRow[]>(
      `SELECT * FROM jobs
       WHERE status = ? AND available_at <= ?
       ORDER BY
         CASE WHEN type LIKE 'articles.%' THEN 1 ELSE 0 END ASC,
         available_at ASC,
         created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [JobStatus.Pending, isoToDB(nowISO())],
    );
    const row = rows[0];
    if (!row) {
      await conn.commit();
      return null;
    }

    const now = nowISO();
    await conn.query(
      `UPDATE jobs
       SET status = ?,
           attempts = attempts + 1,
           locked_at = ?,
           locked_by = ?,
           updated_at = ?
       WHERE id = ?`,
      [JobStatus.Processing, isoToDB(now), workerId, isoToDB(now), row.id],
    );
    await conn.commit();

    const claimed = await getJobById(row.id);
    return claimed;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function completeJob(id: string): Promise<void> {
  const pool = getPool();
  const now = nowISO();
  await pool.query(
    `UPDATE jobs
     SET status = ?,
         locked_at = NULL,
         locked_by = NULL,
         last_error = NULL,
         updated_at = ?
     WHERE id = ?`,
    [JobStatus.Completed, isoToDB(now), id],
  );
}

/**
 * Mark a failed attempt. Retries with exponential backoff until max_attempts,
 * then moves the job to `dead`.
 */
export async function failJob(
  id: string,
  error: string,
): Promise<JobRow | null> {
  const job = await getJobById(id);
  if (!job) return null;

  const pool = getPool();
  const now = nowISO();
  // Avoid persisting LLM API keys that may appear in provider error URLs.
  const message = error
    .replace(/key=[^&\s"']+/gi, "key=REDACTED")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer REDACTED")
    .slice(0, 4000);
  const exhausted = job.attempts >= job.maxAttempts;

  if (exhausted) {
    await pool.query(
      `UPDATE jobs
       SET status = ?,
           locked_at = NULL,
           locked_by = NULL,
           last_error = ?,
           updated_at = ?
       WHERE id = ?`,
      [JobStatus.Dead, message, isoToDB(now), id],
    );
  } else {
    // Exponential backoff: 15s, 30s, 60s, … capped at 15 minutes.
    const backoffSec = Math.min(15 * 2 ** Math.max(job.attempts - 1, 0), 900);
    const availableAt = new Date(Date.now() + backoffSec * 1000).toISOString();
    await pool.query(
      `UPDATE jobs
       SET status = ?,
           available_at = ?,
           locked_at = NULL,
           locked_by = NULL,
           last_error = ?,
           updated_at = ?
       WHERE id = ?`,
      [JobStatus.Pending, isoToDB(availableAt), message, isoToDB(now), id],
    );
  }

  return getJobById(id);
}

/** Recover jobs stuck in processing longer than `staleAfterSeconds`. */
export async function requeueStaleJobs(
  staleAfterSeconds = 300,
): Promise<number> {
  const pool = getPool();
  const cutoff = new Date(Date.now() - staleAfterSeconds * 1000).toISOString();
  const now = nowISO();
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE jobs
     SET status = ?,
         locked_at = NULL,
         locked_by = NULL,
         updated_at = ?
     WHERE status = ? AND locked_at IS NOT NULL AND locked_at < ?`,
    [JobStatus.Pending, isoToDB(now), JobStatus.Processing, isoToDB(cutoff)],
  );
  return result.affectedRows ?? 0;
}

/** Named counts for the admin queue snapshot (stable JSON keys). */
export async function countJobsByStatus(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  dead: number;
}> {
  const pool = getPool();
  const [rows] = await pool.query<
    (RowDataPacket & { status: number; cnt: number })[]
  >(`SELECT status, COUNT(*) AS cnt FROM jobs GROUP BY status`);
  const out = { pending: 0, processing: 0, completed: 0, dead: 0 };
  for (const row of rows) {
    const status = toJobStatus(row.status);
    const n = Number(row.cnt ?? 0);
    if (status === JobStatus.Pending) out.pending = n;
    else if (status === JobStatus.Processing) out.processing = n;
    else if (status === JobStatus.Completed) out.completed = n;
    else if (status === JobStatus.Dead) out.dead = n;
  }
  return out;
}

/** Drop every job whose payload targets this email (verify / reset / send). */
export async function deleteJobsForRecipientEmail(
  email: string,
  executor: Pool | PoolConnection = getPool(),
): Promise<number> {
  const normalised = email.trim().toLowerCase();
  if (!normalised) return 0;
  const [result] = await executor.query<ResultSetHeader>(
    `DELETE FROM jobs
     WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.to'))) = ?`,
    [normalised],
  );
  return result.affectedRows ?? 0;
}

/** Drop old terminal jobs to keep the table lean. */
export async function purgeOldJobs(olderThanDays = 14): Promise<number> {
  const pool = getPool();
  const cutoff = new Date(
    Date.now() - olderThanDays * 24 * 3600 * 1000,
  ).toISOString();
  const [result] = await pool.query<ResultSetHeader>(
    `DELETE FROM jobs
     WHERE status IN (?, ?) AND updated_at < ?`,
    [JobStatus.Completed, JobStatus.Dead, isoToDB(cutoff)],
  );
  return result.affectedRows ?? 0;
}

/**
 * Auth email jobs may still carry legacy plaintext tokens. Purge them after
 * one day even when the global retention is longer.
 */
export async function purgeSensitiveEmailJobs(
  olderThanHours = 24,
): Promise<number> {
  const pool = getPool();
  const cutoff = new Date(
    Date.now() - olderThanHours * 3600 * 1000,
  ).toISOString();
  const [result] = await pool.query<ResultSetHeader>(
    `DELETE FROM jobs
     WHERE type IN (?, ?)
       AND status IN (?, ?)
       AND updated_at < ?`,
    [
      "email.verification",
      "email.passwordReset",
      JobStatus.Completed,
      JobStatus.Dead,
      isoToDB(cutoff),
    ],
  );
  return result.affectedRows ?? 0;
}
