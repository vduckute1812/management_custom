import dayjs, { type Dayjs } from "dayjs";

/**
 * Shared "current time" ref. Ticks every 30 seconds — fine-grained enough
 * for the calendar's now-line (which moves ~1.6 px per minute at default
 * density) and for any "starts in X min" labels, without burning a render
 * every second.
 *
 * The interval is started lazily on first access and torn down when the
 * last consumer unmounts. Multiple components share the same `now` ref via
 * `useState` so the timer is a singleton per Nuxt instance.
 */
export const useNow = () => {
  const now = useState<Dayjs>("now", () => dayjs());
  const refCount = useState<number>("now:refCount", () => 0);

  // Bare handle ref (not reactive) so the cleanup logic can null-check.
  const handle = useState<number | null>("now:handle", () => null);

  function tick() {
    now.value = dayjs();
  }

  function start() {
    if (!import.meta.client) return;
    if (handle.value !== null) return;
    tick();
    handle.value = window.setInterval(tick, 30_000) as unknown as number;
  }

  function stop() {
    if (!import.meta.client) return;
    if (handle.value === null) return;
    window.clearInterval(handle.value);
    handle.value = null;
  }

  if (import.meta.client) {
    onMounted(() => {
      refCount.value += 1;
      start();
      // Tab visibility: skip ticks while hidden and snap immediately on focus
      // so the line catches up after the user comes back from a long break.
      const onVisibility = () => {
        if (document.visibilityState === "visible") tick();
      };
      document.addEventListener("visibilitychange", onVisibility);
      onBeforeUnmount(() => {
        document.removeEventListener("visibilitychange", onVisibility);
        refCount.value -= 1;
        if (refCount.value <= 0) {
          refCount.value = 0;
          stop();
        }
      });
    });
  }

  return { now };
};
