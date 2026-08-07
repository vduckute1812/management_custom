import {
  epicColorOf,
  type Epic,
  type EpicColorClasses,
  type Task,
} from "~/types/task";

interface EpicsApiResponse {
  epics: Epic[];
  nextCursor: string | null;
}

interface SaveResponse {
  epic: Epic;
  created: boolean;
}

export const useEpics = () => {
  const epics = useState<Epic[]>("epics", () => []);
  const nextCursor = useState<string | null>("epics:nextCursor", () => null);
  const isLoading = useState<boolean>("epics:loading", () => false);
  const isLoadingMore = useState<boolean>("epics:loadingMore", () => false);
  const error = useState<string | null>("epics:error", () => null);
  const { apiFetch } = useApi();
  const { t } = useI18n();

  async function fetchAll() {
    isLoading.value = true;
    error.value = null;
    try {
      const data = await apiFetch<EpicsApiResponse>("/api/epics", {
        query: { limit: 100 },
      });
      epics.value = data.epics ?? [];
      nextCursor.value = data.nextCursor ?? null;
    } catch (err: unknown) {
      error.value =
        err instanceof Error ? err.message : t("toasts.failedToLoadEpics");
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
      const data = await apiFetch<EpicsApiResponse>("/api/epics", {
        query: { limit: 100, cursor },
      });
      const seen = new Set(epics.value.map((epic) => epic.id));
      epics.value = [
        ...epics.value,
        ...data.epics.filter((epic) => !seen.has(epic.id)),
      ];
      nextCursor.value = data.nextCursor ?? null;
    } catch (err: unknown) {
      error.value =
        err instanceof Error ? err.message : t("toasts.failedToLoadEpics");
    } finally {
      isLoadingMore.value = false;
    }
  }

  async function saveEpic(epic: Partial<Epic>) {
    const data = await apiFetch<SaveResponse>("/api/epics", {
      method: "POST",
      body: epic,
    });
    if (data.created) {
      epics.value = [...epics.value, data.epic];
    } else {
      epics.value = epics.value.map((e) =>
        e.id === data.epic.id ? data.epic : e,
      );
    }
    return data.epic;
  }

  async function deleteEpic(id: string) {
    await apiFetch(`/api/epics/${id}`, { method: "DELETE" });
    epics.value = epics.value.filter((e) => e.id !== id);
  }

  function findEpic(id?: string | null): Epic | undefined {
    if (!id) return undefined;
    return epics.value.find((e) => e.id === id);
  }

  /** Returns the color identity for a task — inherited from its epic, or slate for standalones. */
  function colorOfTask(task?: Task | null): EpicColorClasses {
    if (!task?.epicId) return epicColorOf("slate");
    return epicColorOf(findEpic(task.epicId)?.color);
  }

  return {
    epics,
    nextCursor,
    isLoading,
    isLoadingMore,
    error,
    fetchAll,
    loadMore,
    saveEpic,
    deleteEpic,
    findEpic,
    colorOfTask,
  };
};
