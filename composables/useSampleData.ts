import dayjs from "dayjs";
import { TaskPriority, TaskStatus, type Epic, type Task } from "~/types/task";

/**
 * Seeds a freshly-empty install with a small, week-spanning example so every
 * surface (calendar, analytics, epic rollup) renders something meaningful on
 * first launch.
 */
export const useSampleData = () => {
  const { saveEpic, fetchAll: fetchEpics } = useEpics();
  const { saveTask, fetchAll: fetchTasks } = useTasks();

  async function load() {
    const monday = dayjs().startOf("week").add(1, "day");

    const cv = await saveEpic({
      title: "Sample · Computer Vision",
      description: "A small example project so every view has something to show.",
      status: TaskStatus.InProgress,
      color: "violet",
      dueDate: monday.add(14, "day").format("YYYY-MM-DD"),
      tags: ["sample", "ml"],
    } as Partial<Epic>);

    const ops = await saveEpic({
      title: "Sample · Operations",
      description: "Recurring upkeep tasks.",
      status: TaskStatus.InProgress,
      color: "amber",
      tags: ["sample"],
    } as Partial<Epic>);

    const todoTasks: Partial<Task>[] = [
      {
        epicId: cv.id,
        title: "Read MLE paper draft",
        status: TaskStatus.InProgress,
        priority: TaskPriority.High,
        estimatedHours: 1.5,
        progress: 40,
        dueDate: monday.add(1, "day").format("YYYY-MM-DD"),
        tags: ["reading"],
        timeBlocks: [
          {
            id: `block_${Math.random().toString(16).slice(2, 10)}`,
            start: monday.hour(9).minute(0).toISOString(),
            end: monday.hour(10).minute(30).toISOString(),
            spentHours: 1.0,
          },
        ],
      },
      {
        epicId: cv.id,
        title: "Image augmentation pipeline",
        status: TaskStatus.InProgress,
        priority: TaskPriority.Normal,
        estimatedHours: 6,
        progress: 35,
        dueDate: monday.add(4, "day").format("YYYY-MM-DD"),
        tags: ["backend"],
        timeBlocks: [
          {
            id: `block_${Math.random().toString(16).slice(2, 10)}`,
            start: monday.add(1, "day").hour(14).toISOString(),
            end: monday.add(1, "day").hour(16).minute(30).toISOString(),
            spentHours: 2.5,
          },
          {
            id: `block_${Math.random().toString(16).slice(2, 10)}`,
            start: monday.add(3, "day").hour(10).toISOString(),
            end: monday.add(3, "day").hour(12).toISOString(),
            spentHours: 2.0,
          },
        ],
      },
      {
        epicId: ops.id,
        title: "Inbox zero",
        status: TaskStatus.Todo,
        priority: TaskPriority.Low,
        estimatedHours: 0.5,
        progress: 0,
        dueDate: monday.add(2, "day").format("YYYY-MM-DD"),
        tags: ["recurring"],
        timeBlocks: [
          {
            id: `block_${Math.random().toString(16).slice(2, 10)}`,
            start: monday.add(2, "day").hour(8).minute(30).toISOString(),
            end: monday.add(2, "day").hour(9).toISOString(),
          },
        ],
      },
      {
        title: "Plan next sprint",
        status: TaskStatus.Todo,
        priority: TaskPriority.High,
        estimatedHours: 1,
        progress: 0,
        dueDate: monday.add(4, "day").format("YYYY-MM-DD"),
        tags: ["planning"],
        timeBlocks: [
          {
            id: `block_${Math.random().toString(16).slice(2, 10)}`,
            start: monday.add(4, "day").hour(15).toISOString(),
            end: monday.add(4, "day").hour(16).toISOString(),
          },
        ],
      },
    ];

    for (const t of todoTasks) {
      await saveTask(t);
    }

    await Promise.all([fetchEpics(), fetchTasks()]);
  }

  return { load };
};
