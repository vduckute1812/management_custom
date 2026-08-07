import { TaskStatus, type Recurrence, type Task } from "~/types/task";

interface TasksApiResponse {
  tasks: Task[];
  nextCursor: string | null;
}

interface SaveResponse {
  task: Task;
  created: boolean;
}

/**
 * Save payload. We widen `recurrence` to allow an explicit `null` so the
 * client can ask the server to clear an existing rule (an absent key is
 * interpreted as "leave as-is"). Using `Omit` rather than an intersection
 * because intersecting an optional property with `null` still narrows away.
 */
export type TaskSavePayload = Omit<Partial<Task>, "recurrence"> & {
  recurrence?: Recurrence | null;
};

export interface FetchTasksOpts {
  /**
   * Child arrays to include in the response. Omit or pass an empty array for
   * the light path (no timeBlocks / checklist loaded, but spentHours is still
   * accurate via a SQL aggregate). Pass both to get the full payload needed
   * by the calendar and task-editing views.
   *
   * Maps directly to the server's `?include=blocks,checklists` query param.
   */
  include?: Array<"blocks" | "checklists">;
}

export const useTasks = () => {
  // Also pulled in from plugins/notifications.client.ts at app boot.
  const { t } = useSafeI18n();
  const tasks = useState<Task[]>("tasks", () => []);
  const nextCursor = useState<string | null>("tasks:nextCursor", () => null);
  const isLoading = useState<boolean>("tasks:loading", () => false);
  const isLoadingMore = useState<boolean>("tasks:loadingMore", () => false);
  const error = useState<string | null>("tasks:error", () => null);
  const activeInclude = useState<string>("tasks:activeInclude", () => "");
  const { apiFetch } = useApi();

  async function fetchAll(opts?: FetchTasksOpts) {
    isLoading.value = true;
    error.value = null;
    try {
      activeInclude.value = opts?.include?.join(",") ?? "";
      const data = await apiFetch<TasksApiResponse>("/api/tasks", {
        query: {
          limit: 100,
          ...(activeInclude.value ? { include: activeInclude.value } : {}),
        },
      });
      tasks.value = data.tasks ?? [];
      nextCursor.value = data.nextCursor ?? null;
    } catch (err: unknown) {
      error.value =
        err instanceof Error ? err.message : t("toasts.failedToLoadTasks");
    } finally {
      isLoading.value = false;
    }
  }

  async function loadMore() {
    const cursor = nextCursor.value;
    if (!cursor || isLoadingMore.value) return;
    isLoadingMore.value = true;
    error.value = null;
    try {
      const data = await apiFetch<TasksApiResponse>("/api/tasks", {
        query: {
          limit: 100,
          cursor,
          ...(activeInclude.value ? { include: activeInclude.value } : {}),
        },
      });
      const seen = new Set(tasks.value.map((task) => task.id));
      tasks.value = [
        ...tasks.value,
        ...data.tasks.filter((task) => !seen.has(task.id)),
      ];
      nextCursor.value = data.nextCursor ?? null;
    } catch (err: unknown) {
      error.value =
        err instanceof Error ? err.message : t("toasts.failedToLoadTasks");
    } finally {
      isLoadingMore.value = false;
    }
  }

  async function saveTask(task: TaskSavePayload) {
    const data = await apiFetch<SaveResponse>("/api/tasks", {
      method: "POST",
      body: task,
    });
    if (data.created) {
      tasks.value = [...tasks.value, data.task];
    } else {
      tasks.value = tasks.value.map((t) =>
        t.id === data.task.id ? data.task : t,
      );
    }
    return data.task;
  }

  async function deleteTask(id: string): Promise<Task | null> {
    const data = await apiFetch<{ ok: boolean; removed: Task }>(
      `/api/tasks/${id}`,
      { method: "DELETE" },
    );
    tasks.value = tasks.value.filter((t) => t.id !== id);
    return data.removed ?? null;
  }

  const tasksByStatus = computed(() => {
    const groups: Record<TaskStatus, Task[]> = {
      [TaskStatus.Todo]: [],
      [TaskStatus.InProgress]: [],
      [TaskStatus.Done]: [],
    };
    for (const t of tasks.value) {
      (groups[t.status] ??= []).push(t);
    }
    return groups;
  });

  function tasksForEpic(epicId: string): Task[] {
    return tasks.value.filter((t) => t.epicId === epicId);
  }

  function findTask(id?: string | null): Task | undefined {
    if (!id) return undefined;
    return tasks.value.find((t) => t.id === id);
  }

  return {
    tasks,
    nextCursor,
    isLoading,
    isLoadingMore,
    error,
    tasksByStatus,
    fetchAll,
    loadMore,
    saveTask,
    deleteTask,
    tasksForEpic,
    findTask,
  };
};
