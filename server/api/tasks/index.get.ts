import { getAllTasks, toTaskView } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const all = await getAllTasks(user.sub);
  const tasks = all.map(toTaskView).sort((a, b) => {
    const aFirstBlock = a.timeBlocks?.[0]?.start ?? "";
    const bFirstBlock = b.timeBlocks?.[0]?.start ?? "";
    const aKey = a.dueDate ?? aFirstBlock ?? a.createdAt ?? "";
    const bKey = b.dueDate ?? bFirstBlock ?? b.createdAt ?? "";
    return aKey.localeCompare(bKey);
  });
  return { tasks };
});
