import { getAllTasks, toTaskView } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { parseQuery } from "~/server/utils/http";
import { tasksListQuerySchema } from "~/server/schemas";
import { encodeTimestampCursor } from "~/server/db/core/timestampCursor";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const query = parseQuery(event, tasksListQuerySchema);

  const { includeBlocks, includeChecklists, limit, cursor } = query;

  const all = await getAllTasks(user.sub, {
    includeBlocks,
    includeChecklists,
    limit: limit + 1,
    cursor,
  });
  const hasMore = all.length > limit;
  const page = hasMore ? all.slice(0, limit) : all;
  const boundary = page[page.length - 1];
  const tasks = page.map(toTaskView).sort((a, b) => {
    const aKey =
      a.dueDate ??
      (includeBlocks
        ? (a.timeBlocks?.[0]?.start ?? a.createdAt ?? "")
        : (a.createdAt ?? ""));
    const bKey =
      b.dueDate ??
      (includeBlocks
        ? (b.timeBlocks?.[0]?.start ?? b.createdAt ?? "")
        : (b.createdAt ?? ""));
    return aKey.localeCompare(bKey);
  });
  return {
    tasks,
    nextCursor:
      hasMore && boundary
        ? encodeTimestampCursor(boundary.updatedAt, boundary.id)
        : null,
  };
});
