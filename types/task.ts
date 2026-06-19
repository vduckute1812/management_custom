/**
 * Shared domain types — client + server.
 *
 * # Enum encoding
 *
 * Every enum-shaped value (`status`, `priority`, `role`, `recurrence.rule`)
 * is a small integer end-to-end:
 *   - persisted as `TINYINT UNSIGNED` in MySQL,
 *   - shipped as `number` in API responses, JSON exports, and JWT claims,
 *   - consumed in TS code as named constants (e.g. `TaskStatus.Done`).
 *
 * Each enum is defined as a `const` object plus a numeric union type. This
 * pattern gives autocomplete (`TaskStatus.Done`) without TypeScript's
 * native `enum` runtime overhead, and the values are plain numbers so
 * comparison, ordering, and DB round-trips are all symbol-free.
 *
 * `EpicColor` and `CalendarView` are *not* integer enums — they're
 * Tailwind tokens / URL state respectively, and their strings carry real
 * meaning outside this module.
 */

// -------------------------------------------------------------------------
// TaskStatus
// -------------------------------------------------------------------------

export const TaskStatus = {
  Todo: 0,
  InProgress: 1,
  Done: 2,
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TASK_STATUSES: readonly TaskStatus[] = [
  TaskStatus.Todo,
  TaskStatus.InProgress,
  TaskStatus.Done,
];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.Todo]: "To do",
  [TaskStatus.InProgress]: "In progress",
  [TaskStatus.Done]: "Done",
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
  [TaskStatus.Todo]: "bg-slate-200 text-slate-700",
  [TaskStatus.InProgress]: "bg-amber-100 text-amber-800",
  [TaskStatus.Done]: "bg-emerald-100 text-emerald-700",
};

export const STATUS_DOTS: Record<TaskStatus, string> = {
  [TaskStatus.Todo]: "bg-slate-400",
  [TaskStatus.InProgress]: "bg-amber-500",
  [TaskStatus.Done]: "bg-emerald-500",
};

export const STATUS_BORDER: Record<TaskStatus, string> = {
  [TaskStatus.Todo]: "border-slate-400",
  [TaskStatus.InProgress]: "border-amber-500",
  [TaskStatus.Done]: "border-emerald-500",
};

// -------------------------------------------------------------------------
// TaskPriority — higher = more important so `ORDER BY priority DESC` sorts naturally
// -------------------------------------------------------------------------

export const TaskPriority = {
  Low: 0,
  Normal: 1,
  High: 2,
} as const;
export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

export const TASK_PRIORITIES: readonly TaskPriority[] = [
  TaskPriority.High,
  TaskPriority.Normal,
  TaskPriority.Low,
];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  [TaskPriority.High]: "High",
  [TaskPriority.Normal]: "Normal",
  [TaskPriority.Low]: "Low",
};

export const PRIORITY_BADGE: Record<TaskPriority, string> = {
  [TaskPriority.High]: "bg-rose-100 text-rose-700",
  [TaskPriority.Normal]: "bg-slate-100 text-slate-600",
  [TaskPriority.Low]: "bg-slate-50 text-slate-500",
};

// Used by the "Up next" sort: a lower rank value means "more important to
// surface first". High > Normal > Low translates to rank 0 < 1 < 2.
export const PRIORITY_RANK: Record<TaskPriority, number> = {
  [TaskPriority.High]: 0,
  [TaskPriority.Normal]: 1,
  [TaskPriority.Low]: 2,
};

// -------------------------------------------------------------------------
// RecurrenceRule
// -------------------------------------------------------------------------

export const RecurrenceRule = {
  Daily: 0,
  Weekly: 1,
  Monthly: 2,
} as const;
export type RecurrenceRule = (typeof RecurrenceRule)[keyof typeof RecurrenceRule];

export const RECURRENCE_RULES: readonly RecurrenceRule[] = [
  RecurrenceRule.Daily,
  RecurrenceRule.Weekly,
  RecurrenceRule.Monthly,
];

export const RECURRENCE_UNIT_LABEL: Record<RecurrenceRule, string> = {
  [RecurrenceRule.Daily]: "day",
  [RecurrenceRule.Weekly]: "week",
  [RecurrenceRule.Monthly]: "month",
};

// -------------------------------------------------------------------------
// UserRole — higher = more privileged
// -------------------------------------------------------------------------

export const UserRole = {
  Normal: 0,
  Admin: 1,
  Superadmin: 2,
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const USER_ROLES: readonly UserRole[] = [
  UserRole.Normal,
  UserRole.Admin,
  UserRole.Superadmin,
];

/**
 * Roles a user with admin powers may assign through the UI. `Superadmin` is
 * intentionally absent — it's seeded by `npm run migrate:auth` and can never
 * be granted from the app.
 */
export const ASSIGNABLE_USER_ROLES: readonly UserRole[] = [
  UserRole.Admin,
  UserRole.Normal,
];

export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.Normal]: "Member",
  [UserRole.Admin]: "Admin",
  [UserRole.Superadmin]: "Superadmin",
};

/** True for any role with admin-dashboard access. */
export function isAdminRole(role: UserRole): boolean {
  return role >= UserRole.Admin;
}

// -------------------------------------------------------------------------
// EpicColor — *not* an integer enum: each value is a Tailwind token used in
// dozens of class compositions (`bg-${color}-100`). Keeping it as a string
// trades a single byte of storage for far better legibility everywhere.
// -------------------------------------------------------------------------

export type EpicColor =
  | "brand"
  | "sky"
  | "emerald"
  | "amber"
  | "rose"
  | "violet"
  | "slate";

export const EPIC_COLORS: EpicColor[] = [
  "brand",
  "sky",
  "emerald",
  "amber",
  "rose",
  "violet",
  "slate",
];

// -------------------------------------------------------------------------
// Domain entities
// -------------------------------------------------------------------------

export interface TimeBlock {
  id: string;
  start: string;
  end: string;
  spentHours?: number;
  /**
   * True for client-side projections derived from a task's recurrence rule.
   * Never persisted: stripped by the server's `sanitizeBlocks` on save.
   */
  projected?: boolean;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface RunningTimer {
  taskId: string;
  /** ISO-8601 timestamp. */
  startedAt: string;
}

export interface Recurrence {
  rule: RecurrenceRule;
  /** Every N units (1 = every day/week/month). */
  interval: number;
  /** ISO date (YYYY-MM-DD) past which no further occurrences are generated. */
  until?: string;
}

export function describeRecurrence(r?: Recurrence | null): string {
  if (!r) return "Does not repeat";
  const unit = RECURRENCE_UNIT_LABEL[r.rule];
  const head =
    r.interval <= 1 ? `Every ${unit}` : `Every ${r.interval} ${unit}s`;
  return r.until ? `${head} · until ${r.until}` : head;
}

export interface Task {
  id: string;
  epicId?: string;
  title: string;
  notes?: string;
  status: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string;
  estimatedHours?: number;
  progress?: number;
  tags?: string[];
  timeBlocks?: TimeBlock[];
  checklist?: ChecklistItem[];
  recurrence?: Recurrence;
  /** Computed by the API/server — never written back. */
  spentHours?: number;
  /** Computed by the API/server — never written back. 0 when no checklist. */
  checklistProgress?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Epic {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  color?: EpicColor;
  dueDate?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  /** Computed by the API/server — never written back. */
  estimatedHours?: number;
  spentHours?: number;
  progress?: number;
  taskCount?: number;
}

export type CalendarView = "daily" | "weekly" | "monthly";

// -------------------------------------------------------------------------
// Auth
// -------------------------------------------------------------------------

/**
 * Public-safe shape of a user account. Server responses MUST NEVER include
 * `passwordHash` or any other internal field. Anything beyond these props
 * is admin-only and lives in `AdminUserSummary` below.
 */
export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserSummary extends AuthUser {
  taskCount: number;
  epicCount: number;
  hoursLogged: number;
  lastActivity?: string;
}

// -------------------------------------------------------------------------
// Epic color theming
// -------------------------------------------------------------------------

export interface EpicColorClasses {
  /** Soft surface for chips / cards. */
  bg: string;
  /** Text on soft surface. */
  text: string;
  /** 1px hairline used as ring. */
  ring: string;
  /** Saturated solid (dot, fill, stripe). */
  solid: string;
  /** Border-color helper for left-stripe accents. */
  border: string;
  /** Hex for chart datasets / inline SVG. */
  hex: string;
  /** Human label. */
  label: string;
}

export const EPIC_COLOR_CLASSES: Record<EpicColor, EpicColorClasses> = {
  brand: {
    bg: "bg-brand-100",
    text: "text-brand-800",
    ring: "ring-brand-300",
    solid: "bg-brand-500",
    border: "border-brand-500",
    hex: "#6366f1",
    label: "Indigo",
  },
  sky: {
    bg: "bg-sky-100",
    text: "text-sky-800",
    ring: "ring-sky-300",
    solid: "bg-sky-500",
    border: "border-sky-500",
    hex: "#0ea5e9",
    label: "Sky",
  },
  emerald: {
    bg: "bg-emerald-100",
    text: "text-emerald-800",
    ring: "ring-emerald-300",
    solid: "bg-emerald-500",
    border: "border-emerald-500",
    hex: "#10b981",
    label: "Emerald",
  },
  amber: {
    bg: "bg-amber-100",
    text: "text-amber-800",
    ring: "ring-amber-300",
    solid: "bg-amber-500",
    border: "border-amber-500",
    hex: "#f59e0b",
    label: "Amber",
  },
  rose: {
    bg: "bg-rose-100",
    text: "text-rose-800",
    ring: "ring-rose-300",
    solid: "bg-rose-500",
    border: "border-rose-500",
    hex: "#f43f5e",
    label: "Rose",
  },
  violet: {
    bg: "bg-violet-100",
    text: "text-violet-800",
    ring: "ring-violet-300",
    solid: "bg-violet-500",
    border: "border-violet-500",
    hex: "#8b5cf6",
    label: "Violet",
  },
  slate: {
    bg: "bg-slate-100",
    text: "text-slate-700",
    ring: "ring-slate-300",
    solid: "bg-slate-400",
    border: "border-slate-500",
    hex: "#64748b",
    label: "Slate",
  },
};

export function epicColorOf(color?: EpicColor | null): EpicColorClasses {
  return EPIC_COLOR_CLASSES[color ?? "slate"] ?? EPIC_COLOR_CLASSES.slate;
}
