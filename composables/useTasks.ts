import { TaskStatus, type Recurrence, type Task } from "~/types/task";

interface TasksApiResponse {
  tasks: Task[];
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

export const useTasks = () => {
  const tasks = useState<Task[]>("tasks", () => []);
  const isLoading = useState<boolean>("tasks:loading", () => false);
  const error = useState<string | null>("tasks:error", () => null);
  const { apiFetch } = useApi();

  async function fetchAll() {
    isLoading.value = true;
    error.value = null;
    try {
      const data = await apiFetch<TasksApiResponse>("/api/tasks");
      tasks.value = data.tasks ?? [];
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : "Failed to load tasks";
    } finally {
      isLoading.value = false;
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
        t.id === data.task.id ? data.task : t
      );
    }
    return data.task;
  }

  async function deleteTask(id: string): Promise<Task | null> {
    try {
      const data = await apiFetch<{ ok: boolean; removed: Task }>(
        `/api/tasks/${id}`,
        { method: "DELETE" }
      );
      tasks.value = tasks.value.filter((t) => t.id !== id);
      return data.removed;
    } catch {
      // Still drop locally; the server may have already removed it.
      tasks.value = tasks.value.filter((t) => t.id !== id);
      return null;
    }
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
    isLoading,
    error,
    tasksByStatus,
    fetchAll,
    saveTask,
    deleteTask,
    tasksForEpic,
    findTask,
  };
};
