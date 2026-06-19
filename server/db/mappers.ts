import type { RowDataPacket } from "mysql2/promise";
import { dbToISO, parseJsonArray } from "./datetime";
import {
  VALID_COLORS,
  TaskPriority,
  TaskStatus,
  UserRole,
  type AuthUser,
  type ChecklistItem,
  type Epic,
  type EpicColor,
  type Recurrence,
  type RecurrenceRule,
  type Task,
  type TimeBlock,
  type UserRecord,
} from "./types";

// MySQL returns enum-typed TINYINT columns as `number`. These helpers narrow
// the raw value back to its enum union and pin out-of-range values to the
// safest default so an out-of-band INSERT can never widen privilege or status.

function toStatus(n: unknown): TaskStatus {
  const v = Number(n);
  if (v === TaskStatus.Done) return TaskStatus.Done;
  if (v === TaskStatus.InProgress) return TaskStatus.InProgress;
  return TaskStatus.Todo;
}

function toPriority(n: unknown): TaskPriority {
  const v = Number(n);
  if (v === TaskPriority.High) return TaskPriority.High;
  if (v === TaskPriority.Low) return TaskPriority.Low;
  return TaskPriority.Normal;
}

function toRecurrence(n: unknown): RecurrenceRule {
  // Caller has already checked the column wasn't NULL; values outside
  // the known range collapse to Daily as the most benign default.
  const v = Number(n);
  if (v === 2) return 2 as RecurrenceRule; // Monthly
  if (v === 1) return 1 as RecurrenceRule; // Weekly
  return 0 as RecurrenceRule; // Daily
}

function toRole(n: unknown): UserRole {
  const v = Number(n);
  if (v >= UserRole.Superadmin) return UserRole.Superadmin;
  if (v === UserRole.Admin) return UserRole.Admin;
  return UserRole.Normal;
}

// -------------------------------------------------------------------------
// Row interfaces — match the column lists in `./schema.ts` exactly.
// -------------------------------------------------------------------------

export interface EpicRow extends RowDataPacket {
  id: string;
  user_id: string | null;
  title: string;
  description: string | null;
  // status/priority/recurrence_rule/role are TINYINT UNSIGNED in MySQL and
  // map 1:1 onto the corresponding enum constants in `~/types/task.ts`.
  status: number;
  color: string | null;
  due_date: string | null;
  tags: unknown;
  created_at: string;
  updated_at: string;
}

export interface TaskRow extends RowDataPacket {
  id: string;
  user_id: string | null;
  epic_id: string | null;
  title: string;
  notes: string | null;
  status: number;
  priority: number;
  due_date: string | null;
  estimated_hours: string | null;
  progress: number | null;
  tags: unknown;
  recurrence_rule: number | null;
  recurrence_interval: number | null;
  recurrence_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlockRow extends RowDataPacket {
  id: string;
  task_id: string;
  start_at: string;
  end_at: string;
  spent_hours: string | null;
}

export interface ChecklistRow extends RowDataPacket {
  id: string;
  task_id: string;
  text: string;
  done: number;
  position: number;
}

export interface TimerRow extends RowDataPacket {
  user_id: string;
  task_id: string;
  started_at: string;
}

export interface UserRow extends RowDataPacket {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  role: number;
  email_verified: number;
  created_at: string;
  updated_at: string;
}

export interface RefreshTokenRow extends RowDataPacket {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
}

export interface EmailVerificationRow extends RowDataPacket {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

// -------------------------------------------------------------------------
// Row → domain mappers
// -------------------------------------------------------------------------

export function rowToEpic(r: EpicRow): Epic {
  const color =
    typeof r.color === "string" && VALID_COLORS.includes(r.color)
      ? (r.color as EpicColor)
      : undefined;
  return {
    id: r.id,
    userId: r.user_id ?? undefined,
    title: r.title,
    description: r.description ?? undefined,
    status: toStatus(r.status),
    color,
    dueDate: r.due_date ?? undefined,
    tags: parseJsonArray(r.tags),
    createdAt: dbToISO(r.created_at),
    updatedAt: dbToISO(r.updated_at),
  };
}

export function rowToTask(
  r: TaskRow,
  blocks: TimeBlock[],
  checklist: ChecklistItem[]
): Task {
  const estimated =
    r.estimated_hours !== null && r.estimated_hours !== undefined
      ? Number(r.estimated_hours)
      : undefined;
  const recurrence: Recurrence | undefined =
    r.recurrence_rule !== null && r.recurrence_rule !== undefined
      ? {
          rule: toRecurrence(r.recurrence_rule),
          interval: r.recurrence_interval ?? 1,
          ...(r.recurrence_until ? { until: r.recurrence_until } : {}),
        }
      : undefined;

  return {
    id: r.id,
    userId: r.user_id ?? undefined,
    epicId: r.epic_id ?? undefined,
    title: r.title,
    notes: r.notes ?? undefined,
    status: toStatus(r.status),
    priority: toPriority(r.priority),
    dueDate: r.due_date ?? undefined,
    estimatedHours: estimated,
    progress: r.progress ?? undefined,
    tags: parseJsonArray(r.tags),
    timeBlocks: blocks,
    checklist,
    recurrence,
    createdAt: dbToISO(r.created_at),
    updatedAt: dbToISO(r.updated_at),
  };
}

export function rowToBlock(r: BlockRow): TimeBlock {
  return {
    id: r.id,
    start: dbToISO(r.start_at),
    end: dbToISO(r.end_at),
    spentHours:
      r.spent_hours !== null && r.spent_hours !== undefined
        ? Number(r.spent_hours)
        : undefined,
  };
}

export function rowToChecklistItem(r: ChecklistRow): ChecklistItem {
  return { id: r.id, text: r.text, done: r.done === 1 };
}

export function rowToUser(r: UserRow): UserRecord {
  return {
    id: r.id,
    email: r.email,
    name: r.name ?? undefined,
    role: toRole(r.role),
    emailVerified: r.email_verified === 1,
    passwordHash: r.password_hash,
    createdAt: dbToISO(r.created_at),
    updatedAt: dbToISO(r.updated_at),
  };
}

/** Strip the password hash before any value crosses the API boundary. */
export function toAuthUser(u: UserRecord): AuthUser {
  const { passwordHash: _ph, ...safe } = u;
  return safe;
}
