import type { z } from "zod";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  TaskPriority,
  TaskStatus,
  type ChecklistItem,
  type Recurrence,
  type RecurrenceRule,
  type Task,
  type TimeBlock,
} from "~/types/task";
import {
  RECURRENCE_RULES,
  generateId,
  getEpicById,
  getPool,
  getTaskById,
  nowISO,
  toTaskView,
  upsertTask,
} from "~/server/utils/db";
import { DomainError } from "~/server/utils/http";
import type { taskUpsertBodySchema } from "~/server/schemas";
import type { RowDataPacket } from "mysql2/promise";

type TaskUpsertBody = z.infer<typeof taskUpsertBodySchema>;

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
          typeof item.id === "string" && item.id ? item.id : generateId("chk"),
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
  if (
    typeof r.rule !== "number" ||
    !RECURRENCE_RULES.includes(r.rule as RecurrenceRule)
  ) {
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

function materializeTask(input: TaskUpsertBody, base?: Task | null): Task {
  const now = nowISO();

  if (
    input.status !== undefined &&
    !TASK_STATUSES.includes(input.status as TaskStatus)
  ) {
    throw new DomainError(400, "Invalid status");
  }
  if (
    input.priority !== undefined &&
    !TASK_PRIORITIES.includes(input.priority as TaskPriority)
  ) {
    throw new DomainError(400, "Invalid priority");
  }

  const status: TaskStatus =
    input.status !== undefined
      ? (input.status as TaskStatus)
      : (base?.status ?? TaskStatus.Todo);

  const priority: TaskPriority =
    input.priority !== undefined
      ? (input.priority as TaskPriority)
      : (base?.priority ?? TaskPriority.Normal);

  const tags = Array.isArray(input.tags)
    ? input.tags.map((t) => String(t)).filter(Boolean)
    : (base?.tags ?? []);

  const epicId =
    typeof input.epicId === "string" && input.epicId
      ? input.epicId
      : input.epicId === null || input.epicId === ""
        ? undefined
        : base?.epicId;

  const timeBlocks =
    input.timeBlocks !== undefined
      ? sanitizeBlocks(input.timeBlocks)
      : (base?.timeBlocks ?? []);

  const checklist =
    input.checklist !== undefined
      ? sanitizeChecklist(input.checklist)
      : (base?.checklist ?? []);

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
      typeof input.notes === "string"
        ? input.notes
        : input.notes === null
          ? undefined
          : (base?.notes ?? undefined),
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

async function taskIdExistsForAnyone(id: string): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<(RowDataPacket & { id: string })[]>(
    "SELECT id FROM tasks WHERE id = ? LIMIT 1",
    [id],
  );
  return rows.length > 0;
}

export async function saveTaskForUser(userId: string, body: TaskUpsertBody) {
  if (body.epicId) {
    const epic = await getEpicById(userId, body.epicId);
    if (!epic) {
      throw new DomainError(400, `Unknown epicId: ${body.epicId}`);
    }
  }

  let existing: Awaited<ReturnType<typeof getTaskById>> = null;
  if (body.id) {
    existing = await getTaskById(userId, body.id);
    if (!existing && (await taskIdExistsForAnyone(body.id))) {
      throw new DomainError(404, `Task not found: ${body.id}`);
    }
  }

  const created = !existing;
  const task = materializeTask(body, existing);
  await upsertTask(userId, task);
  return { task: toTaskView(task), created };
}
