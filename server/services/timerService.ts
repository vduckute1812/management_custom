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
import { DomainError } from "~/server/utils/http";

const MIN_BLOCK_SECONDS = 30;

export async function startTimerForUser(userId: string, taskId: string) {
  const task = await getTaskById(userId, taskId);
  if (!task) {
    throw new DomainError(404, `Unknown task: ${taskId}`);
  }

  let finalizedFor: string | null = null;
  const prior = await getActiveTimer(userId);
  if (prior && prior.taskId !== taskId) {
    const prevTask = await getTaskById(userId, prior.taskId);
    if (prevTask) {
      const startedAt = new Date(prior.startedAt);
      const endedAt = new Date();
      const seconds = Math.max(
        0,
        (endedAt.getTime() - startedAt.getTime()) / 1000,
      );
      if (seconds >= MIN_BLOCK_SECONDS) {
        const block: TimeBlock = {
          id: generateId("block"),
          start: startedAt.toISOString(),
          end: endedAt.toISOString(),
          spentHours: Math.round((seconds / 3600) * 100) / 100,
        };
        await appendBlock(userId, prevTask.id, block, nowISO());
        finalizedFor = prevTask.id;
      }
    }
  }

  const activeTimer = { taskId, startedAt: nowISO() };
  await setActiveTimer(userId, activeTimer);

  const refreshed = await getTaskById(userId, taskId);
  return {
    activeTimer,
    task: refreshed ? toTaskView(refreshed) : toTaskView(task),
    finalizedFor,
  };
}

export async function stopTimerForUser(userId: string) {
  const active = await getActiveTimer(userId);
  if (!active) {
    return { stopped: false, activeTimer: null, task: null, block: null };
  }

  const task = await getTaskById(userId, active.taskId);
  if (!task) {
    await setActiveTimer(userId, null);
    return {
      stopped: false,
      reason: "task-missing" as const,
      activeTimer: null,
      task: null,
      block: null,
    };
  }

  const startedAt = new Date(active.startedAt);
  const endedAt = new Date();
  const seconds = Math.max(0, (endedAt.getTime() - startedAt.getTime()) / 1000);

  if (seconds < MIN_BLOCK_SECONDS) {
    await setActiveTimer(userId, null);
    return {
      stopped: true,
      discarded: true,
      activeTimer: null,
      task: toTaskView(task),
      block: null,
    };
  }

  const block = {
    id: generateId("block"),
    start: startedAt.toISOString(),
    end: endedAt.toISOString(),
    spentHours: Math.round((seconds / 3600) * 100) / 100,
  };

  await appendBlock(userId, task.id, block, nowISO());
  await setActiveTimer(userId, null);

  const refreshed = await getTaskById(userId, task.id);
  return {
    stopped: true,
    activeTimer: null,
    task: refreshed ? toTaskView(refreshed) : toTaskView(task),
    block,
  };
}
