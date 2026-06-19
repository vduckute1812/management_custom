import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  RECURRENCE_RULES,
  TaskPriority,
  TaskStatus,
  generateId,
  getEpicById,
  getPool,
  getTaskById,
  nowISO,
  toTaskView,
  upsertTask,
  type ChecklistItem,
  type Recurrence,
  type RecurrenceRule,
  type Task,
  type TimeBlock,
} from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

function clampPercent(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function toNumberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function sanitizeChecklist(input: unknown): ChecklistItem[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw): ChecklistItem | null => {
      if (!raw || typeof raw !== "object") return null;
      const item = raw as Partial<ChecklistItem>;
      const text = typeof item.text === "string" ? item.text.trim() : "";
      if (!text) return null;
      return {
        id:
          typeof item.id === "string" && item.id
            ? item.id
            : generateId("chk"),
        text,
        done: item.done === true,
      };
    })
    .filter((i): i is ChecklistItem => i !== null);
}

function sanitizeBlocks(input: unknown): TimeBlock[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw): TimeBlock | null => {
      if (!raw || typeof raw !== "object") return null;
      const b = raw as Partial<TimeBlock> & { projected?: unknown };
      // Recurrence projections are client-only ghosts; never persist them.
      if (b.projected === true) return null;
      const start = typeof b.start === "string" ? b.start : "";
      const end = typeof b.end === "string" ? b.end : "";
      if (!start || !end) return null;
      const spent = toNumberOrUndefined(b.spentHours);
      return {
        id: typeof b.id === "string" && b.id ? b.id : generateId("block"),
        start,
        end,
        spentHours: spent !== undefined ? Math.max(0, spent) : undefined,
      };
    })
    .filter((b): b is TimeBlock => b !== null)
    .sort((a, b) => a.start.localeCompare(b.start));
}

function sanitizeRecurrence(input: unknown): Recurrence | undefined {
  if (!input || typeof input !== "object") return undefined;
  const r = input as Partial<Recurrence>;
  if (typeof r.rule !== "number" || !RECURRENCE_RULES.includes(r.rule as RecurrenceRule)) {
    return undefined;
  }
  const intervalRaw = toNumberOrUndefined(r.interval);
  const interval =
    intervalRaw === undefined || intervalRaw < 1
      ? 1
      : Math.min(365, Math.round(intervalRaw));
  const until =
    typeof r.until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.until)
      ? r.until
      : undefined;
  return { rule: r.rule as RecurrenceRule, interval, until };
}

function sanitize(input: Partial<Task>, base?: Task | null): Task {
  const now = nowISO();
  const status: TaskStatus =
    typeof input.status === "number" &&
    TASK_STATUSES.includes(input.status as TaskStatus)
      ? (input.status as TaskStatus)
      : base?.status ?? TaskStatus.Todo;

  const tags = Array.isArray(input.tags)
    ? input.tags.map((t) => String(t)).filter(Boolean)
    : base?.tags ?? [];

  const epicId =
    typeof input.epicId === "string" && input.epicId
      ? input.epicId
      : input.epicId === null || input.epicId === ""
      ? undefined
      : base?.epicId;

  const timeBlocks =
    input.timeBlocks !== undefined
      ? sanitizeBlocks(input.timeBlocks)
      : base?.timeBlocks ?? [];

  const checklist =
    input.checklist !== undefined
      ? sanitizeChecklist(input.checklist)
      : base?.checklist ?? [];

  const priority: TaskPriority =
    typeof input.priority === "number" &&
    TASK_PRIORITIES.includes(input.priority as TaskPriority)
      ? (input.priority as TaskPriority)
      : base?.priority ?? TaskPriority.Normal;

  let recurrence: Recurrence | undefined;
  if (input.recurrence === null) {
    recurrence = undefined;
  } else if (input.recurrence !== undefined) {
    recurrence = sanitizeRecurrence(input.recurrence);
  } else {
    recurrence = base?.recurrence;
  }

  return {
    id: base?.id ?? input.id ?? generateId("task"),
    epicId,
    title: String(input.title ?? base?.title ?? "Untitled task").trim(),
    notes:
      typeof input.notes === "string" ? input.notes : base?.notes ?? undefined,
    status,
    priority,
    dueDate: input.dueDate || base?.dueDate || undefined,
    estimatedHours:
      toNumberOrUndefined(input.estimatedHours) ?? base?.estimatedHours,
    progress: clampPercent(input.progress) ?? base?.progress,
    tags,
    timeBlocks,
    checklist,
    recurrence,
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
  };
}

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const body = await readBody<Partial<Task>>(event);
  if (!body || typeof body !== "object") {
    throw createError({ statusCode: 400, statusMessage: "Invalid task body" });
  }
  if (!body.title || !String(body.title).trim()) {
    throw createError({ statusCode: 400, statusMessage: "Title is required" });
  }

  // Guard against dangling or cross-user FKs — referencing an epic that
  // isn't yours surfaces as a 400 with a clear message rather than letting
  // the FK constraint or ownership filter produce a confusing 500/no-op.
  if (body.epicId) {
    const epic = await getEpicById(user.sub, body.epicId);
    if (!epic) {
      throw createError({
        statusCode: 400,
        statusMessage: `Unknown epicId: ${body.epicId}`,
      });
    }
  }

  // Two cases when body.id is set:
  //   (a) it belongs to the caller -> normal update
  //   (b) it belongs to someone else -> reject 404 (don't leak existence)
  // Without this guard, the SQL upsert's user-scoped IF() would silently
  // keep the original row while returning a misleading 200 to the caller.
  let existing: Awaited<ReturnType<typeof getTaskById>> = null;
  if (body.id) {
    existing = await getTaskById(user.sub, body.id);
    if (!existing && (await taskIdExistsForAnyone(body.id))) {
      throw createError({
        statusCode: 404,
        statusMessage: `Task not found: ${body.id}`,
      });
    }
  }
  const created = !existing;
  const task = sanitize(body, existing);

  await upsertTask(user.sub, task);
  return { task: toTaskView(task), created };
});

/**
 * Has *any* user got a task with this id? Used to distinguish "you're
 * creating a new task with a chosen id" from "you're trying to update a
 * task you don't own". We don't reveal which user owns it.
 */
async function taskIdExistsForAnyone(id: string): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<{ id: string }[] & { length: number }>(
    "SELECT id FROM tasks WHERE id = ? LIMIT 1",
    [id]
  );
  return rows.length > 0;
}
