/**
 * Wires the notifications composable into the app lifecycle:
 *
 * - Hydrate the current browser permission on mount.
 * - Reschedule whenever tasks change, the lead-time setting changes, or the
 *   enable/disable toggle flips.
 * - Rerun scheduling every 15 minutes so blocks that started outside the
 *   24-hour `setTimeout` horizon eventually get picked up (the horizon
 *   prevents us from holding multi-day timeouts that won't survive sleep).
 * - On `visibilitychange`, drop the "already fired this tab" memo when the
 *   user has been away for a while — coming back to the laptop after lunch
 *   should still surface the 14:00 standup notice if it hasn't fired yet.
 */
export default defineNuxtPlugin(() => {
  const {
    hydratePermission,
    scheduleAll,
    clearAll,
    resetFired,
  } = useNotifications();
  const { settings } = useSettings();
  const { tasks } = useTasks();

  hydratePermission();

  let rolling: number | null = null;
  let lastVisibilityHide: number | null = null;

  function reschedule() {
    if (!settings.value.notificationsEnabled) {
      clearAll();
      return;
    }
    scheduleAll(tasks.value);
  }

  // React to relevant inputs. Watching `tasks.value` deeply with `[]` syntax
  // would trigger on internal-only timer ticks; we narrow to the shape that
  // actually changes the schedule (length, ids, recurrence flags, blocks).
  watch(
    [
      () => settings.value.notificationsEnabled,
      () => settings.value.notificationLeadMinutes,
      () =>
        tasks.value.map(
          (t) =>
            `${t.id}:${(t.timeBlocks ?? [])
              .map((b) => `${b.id}@${b.start}`)
              .join(",")}:${t.recurrence?.rule ?? ""}:${
              t.recurrence?.interval ?? ""
            }:${t.recurrence?.until ?? ""}`
        ).join("|"),
    ],
    reschedule,
    { immediate: true }
  );

  // Re-run scheduling every 15 minutes to catch blocks that crossed into the
  // 24-hour horizon since the last evaluation.
  rolling = window.setInterval(() => reschedule(), 15 * 60 * 1000) as unknown as number;

  // When the tab comes back from hidden, decide whether to clear the
  // "already fired" memo: gone for > 5 min → user expects fresh notifications.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      lastVisibilityHide = Date.now();
      return;
    }
    if (
      lastVisibilityHide !== null &&
      Date.now() - lastVisibilityHide > 5 * 60 * 1000
    ) {
      resetFired();
    }
    reschedule();
  });

  // Clean up on full app teardown (e.g. HMR full reload).
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      if (rolling !== null) window.clearInterval(rolling);
      clearAll();
    });
  }
});
