import {
  appendBlock,
  generateId,
  getActiveTimer,
  getTaskById,
  nowISO,
  setActiveTimer,
  toTaskView,
} from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

/**
 * Stop the active timer for the authenticated user, append a finalized
 * time block to the owning task, and clear the timer. Returns the updated
 * task view and the new block.
 *
 * A block shorter than 30 seconds is treated as "no, I didn't mean to start
 * that" and discarded — but the active timer is still cleared.
 */
const MIN_BLOCK_SECONDS = 30;

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const active = await getActiveTimer(user.sub);
  if (!active) {
    return { stopped: false, activeTimer: null, task: null, block: null };
  }

  const task = await getTaskById(user.sub, active.taskId);
  if (!task) {
    await setActiveTimer(user.sub, null);
    return {
      stopped: false,
      reason: "task-missing",
      activeTimer: null,
      task: null,
      block: null,
    };
  }

  const startedAt = new Date(active.startedAt);
  const endedAt = new Date();
  const seconds = Math.max(0, (endedAt.getTime() - startedAt.getTime()) / 1000);

  if (seconds < MIN_BLOCK_SECONDS) {
    await setActiveTimer(user.sub, null);
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

  await appendBlock(user.sub, task.id, block, nowISO());
  await setActiveTimer(user.sub, null);

  const refreshed = await getTaskById(user.sub, task.id);
  return {
    stopped: true,
    activeTimer: null,
    task: refreshed ? toTaskView(refreshed) : toTaskView(task),
    block,
  };
});
