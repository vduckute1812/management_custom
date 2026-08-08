import type { z } from "zod";
import {
  EPIC_COLORS,
  TASK_STATUSES,
  TaskStatus,
  type Epic,
  type EpicColor,
} from "~/types/task";
import {
  generateId,
  getEpicById,
  getPool,
  listEpicTaskRollups,
  nowISO,
  toEpicViewFromRollup,
  upsertEpic,
} from "~/server/utils/db";
import { DomainError } from "~/server/utils/http";
import type { epicUpsertBodySchema } from "~/server/schemas";
import type { RowDataPacket } from "mysql2/promise";

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

export async function upsertEpicForUser(userId: string, body: EpicUpsertBody) {
  let existing: Awaited<ReturnType<typeof getEpicById>> = null;
  if (body.id) {
    existing = await getEpicById(userId, body.id);
    if (!existing && (await epicIdExistsForAnyone(body.id))) {
      throw new DomainError(404, `Epic not found: ${body.id}`);
    }
  }

  const created = !existing;
  const epic = materializeEpic(body, existing);

  await upsertEpic(userId, epic);
  const rollups = await listEpicTaskRollups(userId, [epic.id]);

  return { epic: toEpicViewFromRollup(epic, rollups.get(epic.id)), created };
}
