import { getAllEpics, getAllTasks, toEpicView } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const [epicsRaw, tasks] = await Promise.all([
    getAllEpics(user.sub),
    getAllTasks(user.sub),
  ]);
  const epics = epicsRaw
    .map((e) => toEpicView(e, tasks))
    .sort((a, b) => {
      const aKey = a.dueDate ?? a.createdAt ?? "";
      const bKey = b.dueDate ?? b.createdAt ?? "";
      return aKey.localeCompare(bKey);
    });
  return { epics };
});
