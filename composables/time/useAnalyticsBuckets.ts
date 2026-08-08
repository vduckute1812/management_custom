import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { TaskStatus, type Epic, type Task } from "~/types/task";

dayjs.extend(isoWeek);

export const ANALYTICS_GRANULARITY_KEYS = {
  day: "analytics.granularityDay",
  week: "analytics.granularityWeek",
  month: "analytics.granularityMonth",
} as const;

export type AnalyticsGranularity = "day" | "week" | "month";

export interface AnalyticsBucket {
  key: string;
  label: string;
  estimated: number;
  spent: number;
  completed: number;
  rolledOver: number;
}

export interface AnalyticsTotals {
  completed: number;
  inProgress: number;
  todo: number;
  totalEstimated: number;
  totalSpent: number;
  overdue: number;
  completionRate: number;
  avgVariance: number;
}

export interface AnalyticsEpicRow {
  epic: Epic;
  variance: number;
}

function estimatedShareForBucket(
  task: Task,
  bucketStart: dayjs.Dayjs,
  unit: AnalyticsGranularity,
): number {
  const blocks = task.timeBlocks ?? [];
  if (!task.estimatedHours || blocks.length === 0) return 0;
  const blocksInBucket = blocks.filter((b) =>
    dayjs(b.start).isSame(bucketStart, unit),
  );
  if (blocksInBucket.length === 0) return 0;
  return (task.estimatedHours * blocksInBucket.length) / blocks.length;
}

export function useAnalyticsBuckets(
  tasks: MaybeRefOrGetter<Task[]>,
  granularity: MaybeRefOrGetter<AnalyticsGranularity>,
) {
  return computed<AnalyticsBucket[]>(() => {
    const taskList = toValue(tasks);
    const unit = toValue(granularity);
    const periods = unit === "day" ? 14 : unit === "week" ? 8 : 6;
    const today = dayjs().startOf(unit);
    const result: AnalyticsBucket[] = [];

    for (let i = periods - 1; i >= 0; i--) {
      const start = today.subtract(i, unit);
      const end = start.endOf(unit);

      let estimated = 0;
      let spent = 0;

      for (const task of taskList) {
        estimated += estimatedShareForBucket(task, start, unit);
        for (const b of task.timeBlocks ?? []) {
          const bs = dayjs(b.start);
          if (bs.isSame(start, unit)) {
            spent += b.spentHours ?? 0;
          }
        }
      }

      const dueInBucket = taskList.filter(
        (task) => task.dueDate && dayjs(task.dueDate).isSame(start, unit),
      );
      const completed = dueInBucket.filter(
        (task) => task.status === TaskStatus.Done,
      ).length;
      const rolledOver = dueInBucket.filter(
        (task) =>
          task.status !== TaskStatus.Done &&
          dayjs(task.dueDate).isBefore(end, unit),
      ).length;

      result.push({
        key: start.format("YYYY-MM-DD"),
        label:
          unit === "day"
            ? start.format("MMM D")
            : unit === "week"
              ? `W${start.isoWeek()} ${start.format("MMM D")}`
              : start.format("MMM YYYY"),
        estimated: Math.round(estimated * 10) / 10,
        spent: Math.round(spent * 10) / 10,
        completed,
        rolledOver,
      });
    }
    return result;
  });
}

export function useAnalyticsTotals(tasks: MaybeRefOrGetter<Task[]>) {
  return computed<AnalyticsTotals>(() => {
    const taskList = toValue(tasks);
    const completed = taskList.filter(
      (task) => task.status === TaskStatus.Done,
    ).length;
    const inProgress = taskList.filter(
      (task) => task.status === TaskStatus.InProgress,
    ).length;
    const todo = taskList.filter(
      (task) => task.status === TaskStatus.Todo,
    ).length;
    const totalEstimated = taskList.reduce(
      (s, task) => s + (task.estimatedHours ?? 0),
      0,
    );
    const totalSpent = taskList.reduce(
      (s, task) => s + (task.spentHours ?? 0),
      0,
    );
    const overdue = taskList.filter(
      (task) =>
        task.status !== TaskStatus.Done &&
        task.dueDate &&
        dayjs(task.dueDate).isBefore(dayjs(), "day"),
    ).length;

    const completionRate =
      taskList.length === 0
        ? 0
        : Math.round((completed / taskList.length) * 100);

    const accuracyTasks = taskList.filter(
      (task) => (task.estimatedHours ?? 0) > 0 && (task.spentHours ?? 0) > 0,
    );
    const avgVariance =
      accuracyTasks.length === 0
        ? 0
        : accuracyTasks.reduce(
            (sum, task) =>
              sum + ((task.spentHours ?? 0) - (task.estimatedHours ?? 0)),
            0,
          ) / accuracyTasks.length;

    return {
      completed,
      inProgress,
      todo,
      totalEstimated: Math.round(totalEstimated * 10) / 10,
      totalSpent: Math.round(totalSpent * 10) / 10,
      overdue,
      completionRate,
      avgVariance: Math.round(avgVariance * 10) / 10,
    };
  });
}

export function useAnalyticsEpicBreakdown(epics: MaybeRefOrGetter<Epic[]>) {
  return computed<AnalyticsEpicRow[]>(() =>
    toValue(epics)
      .map((e) => ({
        epic: e,
        variance:
          Math.round(((e.spentHours ?? 0) - (e.estimatedHours ?? 0)) * 10) / 10,
      }))
      .sort((a, b) => (b.epic.spentHours ?? 0) - (a.epic.spentHours ?? 0)),
  );
}

export interface AnalyticsTaggedRow {
  tag: string;
  count: number;
  estimated: number;
  spent: number;
}

/** Per-tag rollup of task count / estimate / spend (untagged bucket included). */
export function useAnalyticsTaggedBreakdown(tasks: MaybeRefOrGetter<Task[]>) {
  return computed<AnalyticsTaggedRow[]>(() => {
    const map = new Map<
      string,
      { count: number; estimated: number; spent: number }
    >();
    for (const task of toValue(tasks)) {
      const tags = task.tags?.length ? task.tags : ["untagged"];
      for (const tag of tags) {
        const entry = map.get(tag) ?? { count: 0, estimated: 0, spent: 0 };
        entry.count += 1;
        entry.estimated += task.estimatedHours ?? 0;
        entry.spent += task.spentHours ?? 0;
        map.set(tag, entry);
      }
    }
    return Array.from(map.entries())
      .map(([tag, v]) => ({
        tag,
        count: v.count,
        estimated: Math.round(v.estimated * 10) / 10,
        spent: Math.round(v.spent * 10) / 10,
      }))
      .sort((a, b) => b.spent - a.spent);
  });
}
