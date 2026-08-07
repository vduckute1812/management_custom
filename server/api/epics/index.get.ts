import { getAllEpics, getAllTasks, toEpicView } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { parseQuery } from "~/server/utils/http";
import { epicsListQuerySchema } from "~/server/schemas";
import { encodeTimestampCursor } from "~/server/db/timestampCursor";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const query = parseQuery(event, epicsListQuerySchema);
  const all = await getAllEpics(user.sub, {
    limit: query.limit + 1,
    cursor: query.cursor,
  });
  const hasMore = all.length > query.limit;
  const epicsRaw = hasMore ? all.slice(0, query.limit) : all;
  const boundary = epicsRaw[epicsRaw.length - 1];
  const tasks = await getAllTasks(user.sub, {
    epicIds: epicsRaw.map((epic) => epic.id),
    limit: 2000,
  });
  const epics = epicsRaw
    .map((e) => toEpicView(e, tasks))
    .sort((a, b) => {
      const aKey = a.dueDate ?? a.createdAt ?? "";
      const bKey = b.dueDate ?? b.createdAt ?? "";
      return aKey.localeCompare(bKey);
    });
  return {
    epics,
    nextCursor:
      hasMore && boundary
        ? encodeTimestampCursor(boundary.updatedAt, boundary.id)
        : null,
  };
});
