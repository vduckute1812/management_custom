import type { Epic, EpicView, Task, TaskView } from "./types";

/**
 * Pure aggregation helpers — no DB access, safe to use anywhere on the
 * server. Centralised so the API layer never has to recompute spent /
 * progress arithmetic ad-hoc.
 */

export function roundHours(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeTaskSpent(task: Task): number {
  if (!task.timeBlocks?.length) {
    // Light path: no block rows were loaded. If spentHours was already
    // attached from a SQL aggregate (getAllTasks without includeBlocks),
    // preserve it rather than returning 0.
    return Number.isFinite(task.spentHours) ? (task.spentHours as number) : 0;
  }
  const sum = task.timeBlocks.reduce(
    (acc, b) => acc + (typeof b.spentHours === "number" ? b.spentHours : 0),
    0,
  );
  return roundHours(sum);
}

export function computeChecklistProgress(task: Task): number {
  const items = task.checklist ?? [];
  if (items.length === 0) {
    // Preserve a pre-computed value if present (e.g. from a future aggregate).
    return Number.isFinite(task.checklistProgress)
      ? (task.checklistProgress as number)
      : 0;
  }
  const done = items.filter((i) => i.done).length;
  return Math.round((done / items.length) * 100);
}

export function toTaskView(task: Task): TaskView {
  return {
    ...task,
    spentHours: computeTaskSpent(task),
    checklistProgress: computeChecklistProgress(task),
  };
}

export function computeEpicHours(
  epic: Epic,
  tasks: Task[],
): {
  estimatedHours: number;
  spentHours: number;
  progress: number;
  taskCount: number;
} {
  const children = tasks.filter((t) => t.epicId === epic.id);
  if (children.length === 0) {
    return { estimatedHours: 0, spentHours: 0, progress: 0, taskCount: 0 };
  }
  const estimatedHours = roundHours(
    children.reduce((acc, t) => acc + (t.estimatedHours ?? 0), 0),
  );
  const spentHours = roundHours(
    children.reduce((acc, t) => acc + computeTaskSpent(t), 0),
  );
  const totalEst = children.reduce(
    (acc, t) => acc + (t.estimatedHours ?? 0),
    0,
  );
  let progress: number;
  if (totalEst > 0) {
    // Weighted by estimated hours so a 40h task counts more than a 1h task.
    progress = Math.round(
      children.reduce(
        (acc, t) =>
          acc + ((t.progress ?? 0) * (t.estimatedHours ?? 0)) / totalEst,
        0,
      ),
    );
  } else {
    // No estimates → fall back to a flat average.
    progress = Math.round(
      children.reduce((acc, t) => acc + (t.progress ?? 0), 0) / children.length,
    );
  }
  return { estimatedHours, spentHours, progress, taskCount: children.length };
}

export function toEpicView(epic: Epic, tasks: Task[]): EpicView {
  return { ...epic, ...computeEpicHours(epic, tasks) };
}

/** List/detail path when hours come from `listEpicTaskRollups` (no task rows). */
export function toEpicViewFromRollup(
  epic: Epic,
  rollup:
    | {
        taskCount: number;
        estimatedHours: number;
        spentHours: number;
        progress: number;
      }
    | undefined,
): EpicView {
  if (!rollup || rollup.taskCount === 0) {
    return {
      ...epic,
      estimatedHours: 0,
      spentHours: 0,
      progress: 0,
      taskCount: 0,
    };
  }
  return {
    ...epic,
    estimatedHours: rollup.estimatedHours,
    spentHours: rollup.spentHours,
    progress: rollup.progress,
    taskCount: rollup.taskCount,
  };
}
