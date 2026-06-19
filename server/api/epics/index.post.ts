import {
  EPIC_COLORS,
  TASK_STATUSES,
  TaskStatus,
  generateId,
  getAllTasks,
  getEpicById,
  getPool,
  nowISO,
  toEpicView,
  upsertEpic,
  type Epic,
  type EpicColor,
} from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

function sanitize(input: Partial<Epic>, base?: Epic | null): Epic {
  const now = nowISO();
  const status: TaskStatus =
    typeof input.status === "number" &&
    TASK_STATUSES.includes(input.status as TaskStatus)
      ? (input.status as TaskStatus)
      : base?.status ?? TaskStatus.Todo;

  const tags = Array.isArray(input.tags)
    ? input.tags.map((t) => String(t)).filter(Boolean)
    : base?.tags ?? [];

  const color: EpicColor =
    typeof input.color === "string" && EPIC_COLORS.includes(input.color as EpicColor)
      ? (input.color as EpicColor)
      : base?.color ?? "brand";

  return {
    id: base?.id ?? input.id ?? generateId("epic"),
    title: String(input.title ?? base?.title ?? "Untitled epic").trim(),
    description:
      typeof input.description === "string"
        ? input.description
        : base?.description ?? undefined,
    status,
    color,
    dueDate: input.dueDate || base?.dueDate || undefined,
    tags,
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
  };
}

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const body = await readBody<Partial<Epic>>(event);
  if (!body || typeof body !== "object") {
    throw createError({ statusCode: 400, statusMessage: "Invalid epic body" });
  }
  if (!body.title || !String(body.title).trim()) {
    throw createError({ statusCode: 400, statusMessage: "Title is required" });
  }

  // Mirror the safety check from tasks/index.post.ts: refuse to upsert an
  // id that exists but belongs to another user.
  let existing: Awaited<ReturnType<typeof getEpicById>> = null;
  if (body.id) {
    existing = await getEpicById(user.sub, body.id);
    if (!existing && (await epicIdExistsForAnyone(body.id))) {
      throw createError({
        statusCode: 404,
        statusMessage: `Epic not found: ${body.id}`,
      });
    }
  }
  const created = !existing;
  const epic = sanitize(body, existing);

  await upsertEpic(user.sub, epic);
  const tasks = await getAllTasks(user.sub);

  return { epic: toEpicView(epic, tasks), created };
});

async function epicIdExistsForAnyone(id: string): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<{ id: string }[] & { length: number }>(
    "SELECT id FROM epics WHERE id = ? LIMIT 1",
    [id]
  );
  return rows.length > 0;
}
