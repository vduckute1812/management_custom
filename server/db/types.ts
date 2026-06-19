/**
 * Server-side re-exports of the shared domain types so server code never has
 * to import via the `~/types/task` alias (which the Nitro build doesn't
 * expose at runtime).
 *
 * Every enum is encoded as a small integer end-to-end (TS, JSON wire format,
 * MySQL `TINYINT UNSIGNED`). See `~/types/task.ts` for the rationale and
 * the canonical definitions of `TaskStatus`, `TaskPriority`, `RecurrenceRule`,
 * and `UserRole`. The mapping (kept identical to the client constants):
 *
 *   TaskStatus      Todo=0       InProgress=1   Done=2
 *   TaskPriority    Low=0        Normal=1       High=2     (higher = more important)
 *   RecurrenceRule  Daily=0      Weekly=1       Monthly=2  (NULL recurrence_rule = non-recurring)
 *   UserRole        Normal=0     Admin=1        Superadmin=2
 *
 * There are no `numberTo*` / `*ToNumber` translation helpers anymore —
 * the TS type IS the integer.
 */
import { TaskStatus } from "../../types/task";

export {
  TaskStatus,
  TaskPriority,
  RecurrenceRule,
  UserRole,
  TASK_STATUSES,
  TASK_PRIORITIES,
  RECURRENCE_RULES,
  USER_ROLES,
  ASSIGNABLE_USER_ROLES,
  isAdminRole,
  describeRecurrence,
  EPIC_COLORS,
  EPIC_COLOR_CLASSES,
  epicColorOf,
  RECURRENCE_UNIT_LABEL,
  STATUS_LABELS,
  STATUS_COLORS,
  STATUS_DOTS,
  STATUS_BORDER,
  PRIORITY_LABELS,
  PRIORITY_BADGE,
  PRIORITY_RANK,
  ROLE_LABELS,
  type ChecklistItem,
  type RunningTimer,
  type Recurrence,
  type TimeBlock,
  type EpicColor,
  type EpicColorClasses,
  type AuthUser,
  type AdminUserSummary,
  type CalendarView,
} from "../../types/task";

import type {
  Task as _SharedTask,
  Epic as _SharedEpic,
} from "../../types/task";

/**
 * Server-side `Task` extends the shared shape with `userId`. The field is
 * never serialised to API responses (see `toTaskView`); it lives in the DB
 * row and the in-memory record so per-user scoping queries can be expressed
 * without joining tables.
 */
export interface Task extends _SharedTask {
  userId?: string;
}

export interface Epic extends _SharedEpic {
  userId?: string;
}

// -------------------------------------------------------------------------
// Server-only types / aliases
// -------------------------------------------------------------------------

/**
 * Legacy alias kept for the existing color-mapper helper in db/mappers.ts.
 * Equivalent to `EPIC_COLORS`, just typed as a mutable array because the
 * mapper uses `.includes` against a value of `unknown` shape.
 */
export const VALID_COLORS: string[] = [
  "brand",
  "sky",
  "emerald",
  "amber",
  "rose",
  "violet",
  "slate",
];

/**
 * Aliases kept for legacy callers; new code should prefer TASK_PRIORITIES /
 * TASK_STATUSES / RECURRENCE_RULES / USER_ROLES.
 */
export { TASK_PRIORITIES as VALID_PRIORITIES } from "../../types/task";
export { TASK_STATUSES as VALID_STATUSES } from "../../types/task";
export { RECURRENCE_RULES as VALID_RECURRENCE_RULES } from "../../types/task";
export { USER_ROLES as VALID_USER_ROLES } from "../../types/task";

// -------------------------------------------------------------------------
// View-side / API-shape decorations (computed; never persisted)
// -------------------------------------------------------------------------

export interface TaskView extends _SharedTask {
  spentHours: number;
  checklistProgress: number;
}

export interface EpicView extends _SharedEpic {
  estimatedHours: number;
  spentHours: number;
  progress: number;
  taskCount: number;
}

// -------------------------------------------------------------------------
// Server-only auth shapes
// -------------------------------------------------------------------------

import type { AuthUser as _AuthUser } from "../../types/task";

/** Same as AuthUser but with the password hash — server-internal only. */
export interface UserRecord extends _AuthUser {
  passwordHash: string;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt?: string;
  userAgent?: string;
  ip?: string;
  createdAt: string;
}

export interface EmailVerificationRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  consumedAt?: string;
}

// Silence "imported but unused" — TaskStatus is re-exported above. Importing
// here keeps the relative-path resolver bound to the canonical module so
// dead-code elimination doesn't accidentally drop the re-export.
void TaskStatus;
