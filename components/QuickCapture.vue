<script setup lang="ts">
import dayjs from "dayjs";
import { TaskPriority, TaskStatus, type Task, type TimeBlock } from "~/types/task";

const { quickCaptureOpen } = useUiOverlays();
const { saveTask } = useTasks();
const { pushToast } = useToasts();
const { formatTime } = useSettings();

const title = ref("");
const submitting = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);

watch(quickCaptureOpen, async (open) => {
  if (open) {
    title.value = "";
    await nextTick();
    inputEl.value?.focus();
  }
});

/** Next clean hour slot so capture lands on today's calendar immediately. */
function defaultCaptureBlock(): TimeBlock {
  const now = dayjs();
  const start =
    now.minute() === 0 && now.second() < 5
      ? now.startOf("hour")
      : now.add(1, "hour").startOf("hour");
  const end = start.add(1, "hour");
  return {
    id: `block_${Math.random().toString(16).slice(2, 10)}`,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

async function onSubmit() {
  const text = title.value.trim();
  if (!text) return;
  submitting.value = true;
  try {
    const block = defaultCaptureBlock();
    const payload: Partial<Task> = {
      title: text,
      status: TaskStatus.Todo,
      priority: TaskPriority.Normal,
      dueDate: dayjs(block.start).format("YYYY-MM-DD"),
      timeBlocks: [block],
    };
    const saved = await saveTask(payload);
    const when = `${formatTime(dayjs(block.start))} – ${formatTime(dayjs(block.end))}`;
    pushToast(`Captured "${saved.title}" · ${when}`, {
      tone: "success",
      duration: 3500,
    });
    quickCaptureOpen.value = false;
  } catch (err: unknown) {
    pushToast(
      err instanceof Error ? err.message : "Failed to capture",
      { tone: "danger" }
    );
  } finally {
    submitting.value = false;
  }
}

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) quickCaptureOpen.value = false;
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="quickCaptureOpen"
        class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 backdrop-blur-sm pt-32 px-4"
        role="dialog"
        aria-modal="true"
        aria-label="Quick capture"
        @mousedown="onBackdrop"
      >
        <div
          class="w-full max-w-xl bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden"
          @mousedown.stop
        >
          <form @submit.prevent="onSubmit" class="flex items-center">
            <span class="pl-4 text-slate-400" aria-hidden="true">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="w-5 h-5"
              >
                <path d="M12 5v14M5 12h14" stroke-linecap="round" />
              </svg>
            </span>
            <input
              ref="inputEl"
              v-model="title"
              type="text"
              placeholder="What needs to be done today?"
              class="flex-1 px-3 py-4 text-base outline-none bg-transparent placeholder:text-slate-400"
              aria-label="Quick task title"
            />
            <button
              type="submit"
              :disabled="submitting || !title.trim()"
              class="m-2 px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-lg shadow-sm disabled:opacity-50"
            >
              {{ submitting ? "Saving…" : "Add" }}
            </button>
          </form>
          <p
            class="px-4 pb-3 text-[11px] text-slate-500 flex items-center gap-3 flex-wrap"
          >
            <kbd class="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-mono">Enter</kbd>
            to save
            <kbd class="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-mono">Esc</kbd>
            to cancel
            <span class="ml-auto italic">
              Schedules a 1-hour block at the next free hour. Open the full editor
              for epic, notes, or more blocks.
            </span>
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
