import { getAllTasks, toTaskView } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { parseQuery } from "~/server/utils/http";
import { tasksListQuerySchema } from "~/server/schemas";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const query = parseQuery(event, tasksListQuerySchema);

  const includes = query.include
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const includeBlocks = includes.includes("blocks");
  const includeChecklists =
    includes.includes("checklists") || includes.includes("checklist");

  const all = await getAllTasks(user.sub, { includeBlocks, includeChecklists });
  const tasks = all.map(toTaskView).sort((a, b) => {
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
  return { tasks };
});
