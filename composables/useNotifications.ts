import dayjs from "dayjs";
import type { Task, TimeBlock } from "~/types/task";

export type NotificationPermissionState =
  | "granted"
  | "denied"
  | "default"
  | "unsupported";

/**
 * Local notifications for upcoming time blocks.
 *
 * Design choices:
 * - Opt-in, off by default. The dev-server can fire dozens of toasts during
 *   onboarding; we never want that on the first run.
 * - Only schedule blocks starting within the next 24h to stay inside
 *   setTimeout's safe range. The plugin re-runs scheduling on a rolling
 *   timer so longer-horizon blocks are picked up later.
 * - Per-tab deduplication: a `Set<string>` of "fired keys" ensures the same
 *   block doesn't notify twice in the same tab (e.g. after a tasks refetch).
 *   The state is in-memory only — a fresh tab is allowed to fire again,
 *   which matches the "you came back to your computer" mental model.
 * - Recurrence-aware: future ghosts within the visible 24h window are also
 *   scheduled, so a daily recurring stand-up notifies every day.
 */
export const useNotifications = () => {
  const { settings } = useSettings();
  const { withProjections } = useRecurrence();

  const permission = useState<NotificationPermissionState>(
    "notif:permission",
    () => "default"
  );
  const handles = useState<number[]>("notif:handles", () => []);
  const fired = useState<Set<string>>("notif:fired", () => new Set<string>());

  function readPermission(): NotificationPermissionState {
    if (!import.meta.client) return "default";
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported";
    }
    return window.Notification.permission as NotificationPermissionState;
  }

  function hydratePermission() {
    permission.value = readPermission();
  }

  async function requestPermission(): Promise<NotificationPermissionState> {
    if (!import.meta.client) return "default";
    if (typeof window === "undefined" || !("Notification" in window)) {
      permission.value = "unsupported";
      return "unsupported";
    }
    if (window.Notification.permission === "granted") {
      permission.value = "granted";
      return "granted";
    }
    try {
      const result = await window.Notification.requestPermission();
      permission.value = result as NotificationPermissionState;
      return permission.value;
    } catch {
      permission.value = readPermission();
      return permission.value;
    }
  }

  function clearAll() {
    if (!import.meta.client) return;
    for (const h of handles.value) {
      window.clearTimeout(h);
    }
    handles.value = [];
  }

  function canFire(): boolean {
    if (!import.meta.client) return false;
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }
    if (window.Notification.permission !== "granted") return false;
    return settings.value.notificationsEnabled === true;
  }

  function show(title: string, body?: string, tag?: string) {
    if (!canFire()) return;
    try {
      new window.Notification(title, {
        body,
        tag, // browsers coalesce notifications sharing a tag
        silent: false,
        icon: "/favicon.ico",
      });
    } catch {
      // Some browsers throw if called from a non-secure context; fail silently.
    }
  }

  /**
   * Schedules a notification for every upcoming (non-past, non-fired) block
   * across the supplied tasks within the next 24h horizon. Returns the count
   * of newly-scheduled timeouts. Idempotent: calling it again replaces all
   * currently-pending timeouts but preserves the already-fired set.
   */
  function scheduleAll(tasks: Task[]): number {
    clearAll();
    if (!canFire()) return 0;

    const now = dayjs();
    const horizonEnd = now.add(24, "hour");
    const lead = Math.max(
      0,
      Math.round(settings.value.notificationLeadMinutes)
    );

    // Project recurrence into the horizon so daily recurring blocks notify too.
    const expanded = withProjections(tasks, now, horizonEnd);

    let scheduled = 0;

    for (const task of expanded) {
      for (const block of task.timeBlocks ?? []) {
        const fireAt = computeFireAt(block, lead);
        if (!fireAt) continue;
        if (fireAt.isBefore(now)) continue;
        if (fireAt.isAfter(horizonEnd)) continue;

        const key = `${task.id}:${block.id}`;
        if (fired.value.has(key)) continue;

        const delay = Math.max(0, fireAt.diff(now, "millisecond"));
        const handle = window.setTimeout(() => {
          fired.value.add(key);
          show(
            `Up next: ${task.title}`,
            buildBody(block, lead),
            key
          );
        }, delay);
        handles.value.push(handle as unknown as number);
        scheduled++;
      }
    }
    return scheduled;
  }

  function computeFireAt(block: TimeBlock, leadMinutes: number) {
    const start = dayjs(block.start);
    if (!start.isValid()) return null;
    return start.subtract(leadMinutes, "minute");
  }

  function buildBody(block: TimeBlock, leadMinutes: number): string {
    const start = dayjs(block.start);
    const end = dayjs(block.end);
    if (!start.isValid()) return "";
    const when = `${start.format("HH:mm")} – ${end.format("HH:mm")}`;
    if (leadMinutes <= 0) return `Starting now · ${when}`;
    return `Starts in ${leadMinutes} min · ${when}`;
  }

  function sendTest() {
    if (!canFire()) return false;
    show(
      "Notifications enabled",
      "You'll get a heads-up before each scheduled block.",
      "mgmt:test"
    );
    return true;
  }

  function resetFired() {
    fired.value = new Set<string>();
  }

  return {
    permission,
    hydratePermission,
    requestPermission,
    scheduleAll,
    clearAll,
    sendTest,
    canFire,
    resetFired,
  };
};
