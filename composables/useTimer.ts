import type { RunningTimer, Task } from "~/types/task";

interface TimerApiResponse {
  activeTimer: RunningTimer | null;
}

interface StartResponse {
  activeTimer: RunningTimer;
  task: Task;
  finalizedFor: string | null;
}

interface StopResponse {
  stopped: boolean;
  discarded?: boolean;
  activeTimer: null;
  task: Task | null;
  block: { id: string; start: string; end: string; spentHours: number } | null;
}

/**
 * Single-active-timer model. Persisted server-side in the `active_timer`
 * MySQL table so closing the tab doesn't lose tracked time.
 */
export const useTimer = () => {
  const activeTimer = useState<RunningTimer | null>("timer:active", () => null);
  const now = useState<number>("timer:now", () => Date.now());
  const hydrated = useState<boolean>("timer:hydrated", () => false);
  const _tickHandle = useState<number | null>("timer:tickHandle", () => null);
  const { apiFetch } = useApi();

  function setActive(timer: RunningTimer | null) {
    activeTimer.value = timer;
    if (import.meta.client) {
      if (timer) ensureTicking();
      else stopTicking();
    }
  }

  function ensureTicking() {
    if (!import.meta.client) return;
    if (_tickHandle.value !== null) return;
    _tickHandle.value = window.setInterval(() => {
      now.value = Date.now();
    }, 1000) as unknown as number;
  }

  function stopTicking() {
    if (!import.meta.client) return;
    if (_tickHandle.value !== null) {
      window.clearInterval(_tickHandle.value);
      _tickHandle.value = null;
    }
  }

  async function fetchActive(): Promise<RunningTimer | null> {
    try {
      const data = await apiFetch<TimerApiResponse>("/api/timer");
      setActive(data.activeTimer ?? null);
      return data.activeTimer ?? null;
    } catch {
      setActive(null);
      return null;
    }
  }

  async function hydrate() {
    if (hydrated.value) return;
    hydrated.value = true;
    await fetchActive();
  }

  async function start(taskId: string): Promise<StartResponse> {
    const data = await apiFetch<StartResponse>("/api/timer/start", {
      method: "POST",
      body: { taskId },
    });
    setActive(data.activeTimer);
    // The start endpoint may have finalized a prior task's timer into a
    // block; surface the up-to-date version through the tasks store.
    const { tasks } = useTasks();
    if (data.task) {
      tasks.value = tasks.value.map((t) =>
        t.id === data.task.id ? data.task : t
      );
    }
    return data;
  }

  async function stop(): Promise<StopResponse> {
    const data = await apiFetch<StopResponse>("/api/timer/stop", {
      method: "POST",
    });
    setActive(null);
    const { tasks } = useTasks();
    if (data.task) {
      tasks.value = tasks.value.map((t) =>
        t.id === data.task!.id ? data.task! : t
      );
    }
    return data;
  }

  function elapsedSecondsFor(taskId: string): number {
    if (!activeTimer.value || activeTimer.value.taskId !== taskId) return 0;
    const startedAt = new Date(activeTimer.value.startedAt).getTime();
    return Math.max(0, Math.floor((now.value - startedAt) / 1000));
  }

  const elapsedSeconds = computed(() => {
    if (!activeTimer.value) return 0;
    const startedAt = new Date(activeTimer.value.startedAt).getTime();
    return Math.max(0, Math.floor((now.value - startedAt) / 1000));
  });

  function isRunningFor(taskId: string): boolean {
    return activeTimer.value?.taskId === taskId;
  }

  function formatElapsed(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  return {
    activeTimer,
    elapsedSeconds,
    elapsedSecondsFor,
    isRunningFor,
    formatElapsed,
    hydrate,
    fetchActive,
    start,
    stop,
  };
};
