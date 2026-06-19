import {
  appendBlock,
  generateId,
  getActiveTimer,
  getTaskById,
  nowISO,
  setActiveTimer,
  toTaskView,
  type TimeBlock,
} from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

interface Body {
  taskId?: string;
}

const MIN_BLOCK_SECONDS = 30;

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const body = await readBody<Body>(event);
  const taskId = body?.taskId;
  if (!taskId || typeof taskId !== "string") {
    throw createError({
      statusCode: 400,
      statusMessage: "taskId is required",
    });
  }

  const task = await getTaskById(user.sub, taskId);
  if (!task) {
    throw createError({
      statusCode: 404,
      statusMessage: `Unknown task: ${taskId}`,
    });
  }

  // A single user can only be doing one focused thing at a time. If a
  // different timer is already running for THIS user, finalize it as a
  // block on its owning task before starting the new one — otherwise the
  // user silently loses time. Other users' timers are untouched.
  let finalizedFor: string | null = null;
  const prior = await getActiveTimer(user.sub);
  if (prior && prior.taskId !== taskId) {
    const prevTask = await getTaskById(user.sub, prior.taskId);
    if (prevTask) {
      const startedAt = new Date(prior.startedAt);
      const endedAt = new Date();
      const seconds = Math.max(
        0,
        (endedAt.getTime() - startedAt.getTime()) / 1000
      );
      if (seconds >= MIN_BLOCK_SECONDS) {
        const block: TimeBlock = {
          id: generateId("block"),
          start: startedAt.toISOString(),
          end: endedAt.toISOString(),
          spentHours: Math.round((seconds / 3600) * 100) / 100,
        };
        await appendBlock(user.sub, prevTask.id, block, nowISO());
        finalizedFor = prevTask.id;
      }
    }
  }

  const activeTimer = { taskId, startedAt: nowISO() };
  await setActiveTimer(user.sub, activeTimer);

  // Re-fetch so the response reflects the finalized block if any.
  const refreshed = await getTaskById(user.sub, taskId);
  return {
    activeTimer,
    task: refreshed ? toTaskView(refreshed) : toTaskView(task),
    finalizedFor,
  };
});
