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
import { parseBody, mapDomainError, DomainError } from "~/server/utils/http";
import { epicUpsertBodySchema } from "~/server/schemas";
import type { RowDataPacket } from "mysql2/promise";
import type { z } from "zod";

type EpicUpsertBody = z.infer<typeof epicUpsertBodySchema>;

function materializeEpic(input: EpicUpsertBody, base?: Epic | null): Epic {
  const now = nowISO();
  if (
    input.status !== undefined &&
    !TASK_STATUSES.includes(input.status as TaskStatus)
  ) {
    throw new DomainError(400, "Invalid status");
  }

  const status: TaskStatus =
    input.status !== undefined
      ? (input.status as TaskStatus)
      : (base?.status ?? TaskStatus.Todo);

  const tags = Array.isArray(input.tags)
    ? input.tags.map((t) => String(t)).filter(Boolean)
    : (base?.tags ?? []);

  const color: EpicColor =
    typeof input.color === "string" &&
    EPIC_COLORS.includes(input.color as EpicColor)
      ? (input.color as EpicColor)
      : (base?.color ?? "brand");

  return {
    id: base?.id ?? input.id ?? generateId("epic"),
    title: String(input.title ?? base?.title ?? "Untitled epic").trim(),
    description:
      typeof input.description === "string"
        ? input.description
        : input.description === null
          ? undefined
          : (base?.description ?? undefined),
    status,
    color,
    dueDate: input.dueDate || base?.dueDate || undefined,
    tags,
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
  };
}

async function epicIdExistsForAnyone(id: string): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<(RowDataPacket & { id: string })[]>(
    "SELECT id FROM epics WHERE id = ? LIMIT 1",
    [id],
  );
  return rows.length > 0;
}

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  try {
    const body = await parseBody(event, epicUpsertBodySchema);

    let existing: Awaited<ReturnType<typeof getEpicById>> = null;
    if (body.id) {
      existing = await getEpicById(user.sub, body.id);
      if (!existing && (await epicIdExistsForAnyone(body.id))) {
        throw new DomainError(404, `Epic not found: ${body.id}`);
      }
    }
    const created = !existing;
    const epic = materializeEpic(body, existing);

    await upsertEpic(user.sub, epic);
    const tasks = await getAllTasks(user.sub);

    return { epic: toEpicView(epic, tasks), created };
  } catch (err) {
    mapDomainError(err);
  }
});
