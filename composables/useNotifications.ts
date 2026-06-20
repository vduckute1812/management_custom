import dayjs from "dayjs";
import type { Task, TimeBlock } from "~/types/task";

export type NotificationPermissionState =
  | "granted"
  | "denied"
  | "default"
  | "unsupported";

/**
 * Pre-task alerts — fires N minutes before a scheduled time block starts,
 * where N is `settings.notificationLeadMinutes` (default 5).
 *
 * Two channels run side-by-side, deduped by a single `${taskId}:${blockId}`
 * key so a block never alerts twice:
 *
 *   1. **In-app toast** — always fires when alerts are enabled. No browser
 *      permission required, works in every context (incognito, no-perm,
 *      backgrounded tab), and is the primary surface.
 *   2. **Desktop notification** (Web Notification API) — additionally fires
 *      *if* the user has granted permission. This is the upgrade channel,
 *      useful when the tab isn't focused. Permission gating happens entirely
 *      inside `firePush` so the alert flow above doesn't need to branch.
 *
 * Scheduling details:
 *
 * - We project recurrence into a 24-hour window so daily standups etc.
 *   also alert.
 * - We only schedule blocks whose alert moment (`block.start - leadMin`)
 *   falls inside that horizon. setTimeout is unreliable across long sleeps,
 *   so a 15-minute rolling re-evaluation in `plugins/notifications.client.ts`
 *   picks up later blocks as they enter the horizon.
 * - **Late join**: if the user opens the app and a block starts in less
 *   time than the lead window (say, 3 min away with a 5-min lead), we fire
 *   immediately instead of skipping. Otherwise the user would never get an
 *   alert for tasks they just-now-loaded.
 * - **Per-tab dedupe**: `fired` is a `Set<string>` keyed by block id. A
 *   fresh tab gets a fresh set (matches "coming back to my computer"), and
 *   `resetFired()` clears it when the tab returns from a long invisibility.
 */
export const useNotifications = () => {
  const { settings } = useSettings();
  const { withProjections } = useRecurrence();
  const { pushToast } = useToasts();
  const { requestFocusTask } = useUiOverlays();
  const router = useRouter();

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

  /** Master switch — when off, neither channel fires. */
  function alertsEnabled(): boolean {
    if (!import.meta.client) return false;
    return settings.value.notificationsEnabled === true;
  }

  /** Can fire a desktop push? (subset of alertsEnabled) */
  function canPush(): boolean {
    if (!alertsEnabled()) return false;
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }
    return window.Notification.permission === "granted";
  }

  /**
   * Public alias preserved so the settings page's "test notification" button
   * keeps working — it specifically tests the desktop channel.
   */
  function canFire(): boolean {
    return canPush();
  }

  function firePush(title: string, body?: string, tag?: string) {
    if (!canPush()) return;
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
   * In-app toast for an upcoming block. "Open" routes to the dashboard
   * and asks it to surface the task modal via `useUiOverlays.focusTaskId`.
   */
  function fireToast(task: Task, block: TimeBlock, leadMinutes: number) {
    const start = dayjs(block.start);
    const minutesAway = Math.max(0, start.diff(dayjs(), "minute"));
    const when = `${start.format("HH:mm")} – ${dayjs(block.end).format("HH:mm")}`;
    const leadHint =
      minutesAway === 0
        ? "Starting now"
        : minutesAway === 1
        ? "Starts in 1 min"
        : `Starts in ${minutesAway} min`;
    pushToast(`${leadHint}: ${task.title} · ${when}`, {
      tone: "info",
      duration: Math.max(6000, leadMinutes * 1000),
      actionLabel: "Open",
      onAction: async () => {
        requestFocusTask(task.id);
        if (router.currentRoute.value.path !== "/") {
          await router.push("/");
        }
      },
    });
  }

  /**
   * Fires both channels for a single (task, block) pair. Records the dedupe
   * key so subsequent calls in this tab are no-ops.
   */
  function fireForBlock(task: Task, block: TimeBlock, leadMinutes: number) {
    const key = `${task.id}:${block.id}`;
    if (fired.value.has(key)) return;
    fired.value.add(key);

    fireToast(task, block, leadMinutes);

    const start = dayjs(block.start);
    const when = `${start.format("HH:mm")} – ${dayjs(block.end).format("HH:mm")}`;
    const bodyParts: string[] = [];
    if (leadMinutes <= 0) bodyParts.push(`Starting now · ${when}`);
    else bodyParts.push(`Starts in ${leadMinutes} min · ${when}`);
    firePush(`Up next: ${task.title}`, bodyParts.join("\n"), key);
  }

  /**
   * Schedules an alert for every upcoming, not-yet-fired block across the
   * supplied tasks within the next 24h horizon. Returns the number of
   * newly-scheduled timeouts (immediate-fires are counted too). Idempotent:
   * calling again replaces all pending timeouts but preserves the
   * already-fired set.
   */
  function scheduleAll(tasks: Task[]): number {
    clearAll();
    if (!alertsEnabled()) return 0;

    const now = dayjs();
    const horizonEnd = now.add(24, "hour");
    const lead = Math.max(
      0,
      Math.round(settings.value.notificationLeadMinutes)
    );

    // Project recurrence into the horizon so daily recurring blocks alert too.
    const expanded = withProjections(tasks, now, horizonEnd);

    let scheduled = 0;

    for (const task of expanded) {
      for (const block of task.timeBlocks ?? []) {
        const start = dayjs(block.start);
        if (!start.isValid()) continue;
        if (start.isBefore(now)) continue; // already underway

        const fireAt = start.subtract(lead, "minute");

        if (fireAt.isAfter(horizonEnd)) continue;

        const key = `${task.id}:${block.id}`;
        if (fired.value.has(key)) continue;

        if (!fireAt.isAfter(now)) {
          // Lead window already passed but block hasn't started yet.
          // Fire immediately rather than missing the heads-up entirely.
          fireForBlock(task, block, lead);
          scheduled++;
          continue;
        }

        const delay = Math.max(0, fireAt.diff(now, "millisecond"));
        const handle = window.setTimeout(() => {
          // Re-check inside the timeout: the task could've been deleted or
          // the block rescheduled while we were waiting.
          fireForBlock(task, block, lead);
        }, delay);
        handles.value.push(handle as unknown as number);
        scheduled++;
      }
    }
    return scheduled;
  }

  function sendTest() {
    if (!canPush()) {
      // Still emit an in-app toast so the user gets *some* feedback.
      pushToast("Test alert — in-app toasts are on", {
        tone: "info",
        duration: 2500,
      });
      return false;
    }
    firePush(
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
    canPush,
    alertsEnabled,
    resetFired,
  };
};
