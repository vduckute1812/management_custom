import { describe, expect, it } from "vitest";
import {
  computeTaskSpent,
  computeChecklistProgress,
  toTaskView,
} from "../server/db/compute";
import { TaskStatus } from "../types/task";
import type { Task } from "../server/db/types";

const baseTask: Task = {
  id: "task-1",
  title: "Test task",
  status: TaskStatus.Todo,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("computeTaskSpent", () => {
  it("returns 0 when no blocks and no pre-computed value", () => {
    expect(computeTaskSpent({ ...baseTask, timeBlocks: [] })).toBe(0);
    expect(computeTaskSpent({ ...baseTask })).toBe(0);
  });

  it("sums spentHours from blocks when blocks are present", () => {
    const task: Task = {
      ...baseTask,
      timeBlocks: [
        {
          id: "b1",
          start: "2026-01-01T09:00:00.000Z",
          end: "2026-01-01T10:00:00.000Z",
          spentHours: 1.5,
        },
        {
          id: "b2",
          start: "2026-01-02T09:00:00.000Z",
          end: "2026-01-02T10:00:00.000Z",
          spentHours: 0.75,
        },
      ],
    };
    expect(computeTaskSpent(task)).toBe(2.25);
  });

  it("preserves pre-computed spentHours when no blocks are loaded (light path)", () => {
    const task: Task = {
      ...baseTask,
      timeBlocks: [],
      spentHours: 3.5,
    };
    expect(computeTaskSpent(task)).toBe(3.5);
  });

  it("preserves pre-computed spentHours when timeBlocks is absent (light path)", () => {
    const task: Task = {
      ...baseTask,
      spentHours: 1.25,
    };
    expect(computeTaskSpent(task)).toBe(1.25);
  });

  it("ignores pre-computed spentHours if actual blocks are present (blocks win)", () => {
    const task: Task = {
      ...baseTask,
      spentHours: 99,
      timeBlocks: [
        {
          id: "b1",
          start: "2026-01-01T09:00:00.000Z",
          end: "2026-01-01T10:00:00.000Z",
          spentHours: 2.0,
        },
      ],
    };
    expect(computeTaskSpent(task)).toBe(2);
  });

  it("ignores non-finite pre-computed values", () => {
    expect(computeTaskSpent({ ...baseTask, spentHours: NaN })).toBe(0);
    expect(computeTaskSpent({ ...baseTask, spentHours: Infinity })).toBe(0);
  });
});

describe("computeChecklistProgress", () => {
  it("returns 0 when no checklist and no pre-computed value", () => {
    expect(computeChecklistProgress({ ...baseTask })).toBe(0);
    expect(computeChecklistProgress({ ...baseTask, checklist: [] })).toBe(0);
  });

  it("computes from checklist items when present", () => {
    const task: Task = {
      ...baseTask,
      checklist: [
        { id: "c1", text: "Step 1", done: true },
        { id: "c2", text: "Step 2", done: false },
        { id: "c3", text: "Step 3", done: false },
        { id: "c4", text: "Step 4", done: true },
      ],
    };
    expect(computeChecklistProgress(task)).toBe(50);
  });

  it("preserves pre-computed checklistProgress when no items are loaded", () => {
    const task: Task = {
      ...baseTask,
      checklist: [],
      checklistProgress: 75,
    };
    expect(computeChecklistProgress(task)).toBe(75);
  });
});

describe("toTaskView — light path", () => {
  it("keeps pre-computed spentHours from SQL aggregate on a light task", () => {
    const lightTask: Task = {
      ...baseTask,
      timeBlocks: [],
      checklist: [],
      spentHours: 4.2,
    };
    const view = toTaskView(lightTask);
    expect(view.spentHours).toBe(4.2);
  });

  it("keeps spentHours=0 on a light task that has no blocks in the DB", () => {
    const lightTask: Task = {
      ...baseTask,
      timeBlocks: [],
      checklist: [],
      spentHours: 0,
    };
    const view = toTaskView(lightTask);
    expect(view.spentHours).toBe(0);
  });

  it("computes spentHours from blocks when blocks are present (full path)", () => {
    const fullTask: Task = {
      ...baseTask,
      spentHours: 99,
      timeBlocks: [
        {
          id: "b1",
          start: "2026-01-01T09:00:00.000Z",
          end: "2026-01-01T10:30:00.000Z",
          spentHours: 1.5,
        },
      ],
    };
    const view = toTaskView(fullTask);
    expect(view.spentHours).toBe(1.5);
  });
});
