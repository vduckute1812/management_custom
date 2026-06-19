<script setup lang="ts">
import type { Task } from "~/types/task";

const props = withDefaults(
  defineProps<{
    task: Task;
    size?: "sm" | "md";
  }>(),
  { size: "sm" }
);

const {
  activeTimer,
  isRunningFor,
  elapsedSecondsFor,
  formatElapsed,
  start,
  stop,
} = useTimer();
const { pushToast } = useToasts();
const { findTask } = useTasks();

const busy = ref(false);

const running = computed(() => isRunningFor(props.task.id));
const elapsedLabel = computed(() => formatElapsed(elapsedSecondsFor(props.task.id)));

const otherRunning = computed(() => {
  return !!activeTimer.value && activeTimer.value.taskId !== props.task.id;
});

async function onClick(e: MouseEvent) {
  e.stopPropagation();
  e.preventDefault();
  if (busy.value) return;
  busy.value = true;
  try {
    if (running.value) {
      const res = await stop();
      if (res.discarded) {
        pushToast("Timer stopped (too short to log)", {
          tone: "info",
          duration: 2200,
        });
      } else if (res.block) {
        pushToast(
          `Logged ${res.block.spentHours}h to "${props.task.title}"`,
          { tone: "success", duration: 2400 }
        );
      } else {
        pushToast("Timer stopped", { tone: "info", duration: 1800 });
      }
    } else {
      const res = await start(props.task.id);
      if (res.finalizedFor) {
        const prev = findTask(res.finalizedFor);
        pushToast(
          prev
            ? `Logged previous timer to "${prev.title}"`
            : "Previous timer logged",
          { tone: "info", duration: 2400 }
        );
      } else {
        pushToast(`Tracking "${props.task.title}"`, {
          tone: "success",
          duration: 1800,
        });
      }
    }
  } catch (err: unknown) {
    pushToast(
      err instanceof Error ? err.message : "Timer action failed",
      { tone: "danger" }
    );
  } finally {
    busy.value = false;
  }
}

const dimensions = computed(() =>
  props.size === "md"
    ? "h-8 px-3 text-xs gap-1.5"
    : "h-7 px-2 text-[11px] gap-1"
);
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center rounded-full font-semibold ring-1 transition tabular-nums select-none whitespace-nowrap disabled:opacity-60"
    :class="[
      dimensions,
      running
        ? 'bg-rose-50 text-rose-700 ring-rose-300 hover:bg-rose-100'
        : otherRunning
        ? 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50'
        : 'bg-emerald-50 text-emerald-700 ring-emerald-300 hover:bg-emerald-100',
    ]"
    :title="
      running
        ? `Stop tracking (${elapsedLabel})`
        : otherRunning
        ? 'Stop the other timer and start tracking this task'
        : 'Start tracking this task'
    "
    :aria-pressed="running"
    :disabled="busy"
    @click="onClick"
  >
    <span
      v-if="running"
      class="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 timer-pulse"
      aria-hidden="true"
    />
    <svg
      v-else
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      class="w-3 h-3"
      aria-hidden="true"
    >
      <path d="M8 5v14l11-7z" />
    </svg>
    <template v-if="running">{{ elapsedLabel }}</template>
    <template v-else-if="size === 'md'">Start timer</template>
    <template v-else>Start</template>
  </button>
</template>

<style scoped>
@keyframes timer-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
.timer-pulse {
  animation: timer-pulse 1.2s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .timer-pulse { animation: none; }
}
</style>
