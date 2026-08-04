import { getAllTasks, toTaskView } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);

  // Parse ?include=blocks,checklists (also accepts singular "checklist").
  // Default is light mode: no child arrays, spentHours via SQL aggregate.
  const query = getQuery(event);
  const includeStr = typeof query.include === "string" ? query.include : "";
  const includes = includeStr
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const includeBlocks = includes.includes("blocks");
  const includeChecklists =
    includes.includes("checklists") || includes.includes("checklist");

  const all = await getAllTasks(user.sub, { includeBlocks, includeChecklists });
  const tasks = all.map(toTaskView).sort((a, b) => {
    // When blocks are present, prefer the first block start as the secondary
    // sort key (after dueDate) so calendar views order chronologically.
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
