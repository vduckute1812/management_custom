<script setup lang="ts">
const {
  activeTimer,
  elapsedSeconds,
  formatElapsed,
  stop,
  hydrate,
} = useTimer();
const { findTask } = useTasks();
const { pushToast } = useToasts();

onMounted(() => {
  hydrate();
});

const task = computed(() => findTask(activeTimer.value?.taskId ?? null));
const label = computed(() => formatElapsed(elapsedSeconds.value));

const busy = ref(false);

async function onStop() {
  if (busy.value) return;
  busy.value = true;
  try {
    const res = await stop();
    if (res.discarded) {
      pushToast("Timer stopped (too short to log)", { tone: "info" });
    } else if (res.block) {
      pushToast(`Logged ${res.block.spentHours}h`, { tone: "success" });
    }
  } catch (err: unknown) {
    pushToast(
      err instanceof Error ? err.message : "Couldn't stop timer",
      { tone: "danger" }
    );
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="slide">
      <div
        v-if="activeTimer"
        class="fixed bottom-4 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:bottom-4 md:right-4 z-40 no-print"
      >
        <div
          class="flex items-center gap-3 bg-slate-900 text-white rounded-full shadow-xl ring-1 ring-slate-700 pl-3 pr-1 py-1"
          role="status"
          aria-live="polite"
        >
          <span class="flex items-center gap-2">
            <span
              class="inline-block w-2 h-2 rounded-full bg-rose-400 timer-pulse"
              aria-hidden="true"
            />
            <span class="text-xs text-slate-300 hidden sm:inline">
              Tracking
            </span>
            <span class="text-sm font-medium max-w-[180px] truncate">
              {{ task?.title ?? "Unknown task" }}
            </span>
            <span class="text-xs text-slate-300 tabular-nums">
              {{ label }}
            </span>
          </span>
          <button
            type="button"
            class="ml-1 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-500 hover:bg-rose-400 text-white text-xs font-semibold transition disabled:opacity-60"
            :disabled="busy"
            @click="onStop"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              class="w-3 h-3"
              aria-hidden="true"
            >
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
            Stop
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: transform 200ms ease-out, opacity 200ms ease-out;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateY(12px) translateX(-50%);
  opacity: 0;
}
@media (min-width: 768px) {
  .slide-enter-from,
  .slide-leave-to {
    transform: translateY(12px) translateX(0);
    opacity: 0;
  }
}

@keyframes timer-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.timer-pulse {
  animation: timer-pulse 1.2s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .timer-pulse { animation: none; }
}
</style>
