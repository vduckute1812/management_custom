<script setup lang="ts">
import dayjs from "dayjs";
import type { Task, TimeBlock } from "~/types/task";

const props = defineProps<{
  open: boolean;
  task: Task | null;
  block: TimeBlock | null;
  /** Viewport coords for anchoring the popover near the clicked block. */
  anchor?: { x: number; y: number } | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "edit-details"): void;
  (e: "saved", task: Task): void;
}>();

const { saveTask } = useTasks();
const { pushToast } = useToasts();
const { formatTime } = useSettings();

const spent = ref("");
const saving = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);
const panelEl = ref<HTMLElement | null>(null);

watch(
  () => [props.open, props.block?.id] as const,
  async ([open]) => {
    if (!open || !props.block) return;
    spent.value =
      typeof props.block.spentHours === "number"
        ? String(props.block.spentHours)
        : "";
    await nextTick();
    inputEl.value?.focus();
    inputEl.value?.select();
  }
);

const rangeLabel = computed(() => {
  if (!props.block) return "";
  const start = dayjs(props.block.start);
  const end = dayjs(props.block.end);
  if (!start.isValid() || !end.isValid()) return "";
  return `${formatTime(start)} – ${formatTime(end)}`;
});

const durationHours = computed(() => {
  if (!props.block) return 0;
  const start = dayjs(props.block.start);
  const end = dayjs(props.block.end);
  if (!start.isValid() || !end.isValid() || !end.isAfter(start)) return 0;
  return Math.round((end.diff(start, "minute") / 60) * 100) / 100;
});

const panelStyle = computed(() => {
  const a = props.anchor;
  if (!a) {
    return {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    } as Record<string, string>;
  }
  // Keep the panel inside the viewport with a small gutter.
  const left = Math.min(Math.max(12, a.x), window.innerWidth - 280);
  const top = Math.min(Math.max(12, a.y), window.innerHeight - 220);
  return { top: `${top}px`, left: `${left}px` } as Record<string, string>;
});

function autoFill() {
  if (durationHours.value > 0) {
    spent.value = String(durationHours.value);
  }
}

async function onSave() {
  if (!props.task || !props.block) return;
  if (props.block.projected) {
    pushToast("Recurring projections can't log time — edit the series.", {
      tone: "info",
    });
    return;
  }
  const raw = spent.value.trim();
  const nextSpent =
    raw === "" || Number.isNaN(Number(raw))
      ? undefined
      : Math.max(0, Math.round(Number(raw) * 100) / 100);

  saving.value = true;
  try {
    const updatedBlocks = (props.task.timeBlocks ?? []).map((b) =>
      b.id === props.block!.id ? { ...b, spentHours: nextSpent } : b
    );
    const saved = await saveTask({ ...props.task, timeBlocks: updatedBlocks });
    emit("saved", saved);
    pushToast(
      nextSpent === undefined
        ? "Cleared spent hours"
        : `Logged ${nextSpent}h`,
      { tone: "success", duration: 2200 }
    );
    emit("close");
  } catch (err: unknown) {
    pushToast(
      err instanceof Error ? err.message : "Failed to save spent hours",
      { tone: "danger" }
    );
  } finally {
    saving.value = false;
  }
}

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) emit("close");
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    emit("close");
  } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    onSave();
  }
}

</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open && task && block"
        class="fixed inset-0 z-[60]"
        @mousedown="onBackdrop"
        @keydown="onKeydown"
      >
        <div
          ref="panelEl"
          class="absolute w-[260px] bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 overflow-hidden"
          :style="panelStyle"
          role="dialog"
          aria-modal="true"
          aria-labelledby="spent-popover-title"
          @mousedown.stop
        >
          <header class="px-3.5 pt-3 pb-2 border-b border-slate-100">
            <p
              id="spent-popover-title"
              class="text-sm font-semibold text-slate-900 truncate"
            >
              {{ task.title }}
            </p>
            <p class="text-[11px] text-slate-500 tabular-nums mt-0.5">
              {{ rangeLabel }}
              <span v-if="durationHours"> · {{ durationHours }}h block</span>
            </p>
          </header>

          <div class="px-3.5 py-3 space-y-2">
            <label
              for="spent-popover-input"
              class="block text-[10px] uppercase tracking-wide font-medium text-slate-500"
            >
              Spent (h)
            </label>
            <div class="flex items-center gap-1.5">
              <input
                id="spent-popover-input"
                ref="inputEl"
                v-model="spent"
                type="number"
                min="0"
                step="0.25"
                placeholder="0.0"
                class="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm tabular-nums focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
                @keydown.enter.prevent="onSave"
              />
              <button
                type="button"
                class="text-[11px] font-medium text-brand-700 hover:text-brand-800 px-2 py-1.5 rounded-lg hover:bg-brand-50"
                title="Fill from block duration"
                @click="autoFill"
              >
                auto
              </button>
            </div>
          </div>

          <footer
            class="px-3.5 pb-3 flex items-center justify-between gap-2"
          >
            <button
              type="button"
              class="text-[11px] font-medium text-slate-600 hover:text-slate-900 px-1 py-1"
              @click="emit('edit-details')"
            >
              Edit details
            </button>
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                class="text-[11px] font-medium text-slate-500 hover:text-slate-800 px-2 py-1.5 rounded-lg hover:bg-slate-100"
                @click="emit('close')"
              >
                Cancel
              </button>
              <button
                type="button"
                :disabled="saving"
                class="text-[11px] font-semibold bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg shadow-sm disabled:opacity-50"
                @click="onSave"
              >
                {{ saving ? "Saving…" : "Save" }}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
