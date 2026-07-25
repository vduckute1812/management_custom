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
const showCustom = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);
const panelEl = ref<HTMLElement | null>(null);

watch(
  () => [props.open, props.block?.id] as const,
  async ([open]) => {
    if (!open || !props.block) return;
    showCustom.value = false;
    spent.value =
      typeof props.block.spentHours === "number"
        ? String(props.block.spentHours)
        : "";
    await nextTick();
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

const alreadyLogged = computed(
  () => typeof props.block?.spentHours === "number"
);

const panelStyle = computed(() => {
  const a = props.anchor;
  if (!a) {
    return {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    } as Record<string, string>;
  }
  const left = Math.min(Math.max(12, a.x), window.innerWidth - 300);
  const top = Math.min(Math.max(12, a.y), window.innerHeight - 260);
  return { top: `${top}px`, left: `${left}px` } as Record<string, string>;
});

async function persistSpent(nextSpent: number | undefined) {
  if (!props.task || !props.block) return;
  if (props.block.projected) {
    pushToast("Recurring projections can't log time — edit the series.", {
      tone: "info",
    });
    return;
  }
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

async function logFullBlock() {
  if (durationHours.value <= 0) return;
  await persistSpent(durationHours.value);
}

async function onSaveCustom() {
  const raw = spent.value.trim();
  const nextSpent =
    raw === "" || Number.isNaN(Number(raw))
      ? undefined
      : Math.max(0, Math.round(Number(raw) * 100) / 100);
  await persistSpent(nextSpent);
}

async function openCustom() {
  showCustom.value = true;
  if (!spent.value && durationHours.value > 0) {
    spent.value = String(durationHours.value);
  }
  await nextTick();
  inputEl.value?.focus();
  inputEl.value?.select();
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
    if (showCustom.value) onSaveCustom();
    else logFullBlock();
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
          class="absolute w-[280px] bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 overflow-hidden"
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
              <span
                v-if="alreadyLogged"
                class="ml-1 text-emerald-600"
              >
                · logged {{ block.spentHours }}h
              </span>
            </p>
          </header>

          <div class="px-3.5 py-3 space-y-2">
            <button
              type="button"
              :disabled="saving || durationHours <= 0"
              class="w-full px-3 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-lg shadow-sm disabled:opacity-50"
              @click="logFullBlock"
            >
              {{
                saving
                  ? "Saving…"
                  : alreadyLogged
                  ? `Update to ${durationHours}h`
                  : `Log ${durationHours}h`
              }}
            </button>
            <p class="text-[11px] text-slate-500 text-center">
              Uses the full block duration
            </p>

            <button
              v-if="!showCustom"
              type="button"
              class="w-full text-[11px] font-medium text-slate-600 hover:text-slate-900 py-1"
              @click="openCustom"
            >
              Enter a custom amount…
            </button>

            <div v-else class="space-y-1.5 pt-1 border-t border-slate-100">
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
                  @keydown.enter.prevent="onSaveCustom"
                />
                <button
                  type="button"
                  :disabled="saving"
                  class="text-[11px] font-semibold text-brand-700 hover:text-brand-800 px-2 py-1.5 rounded-lg hover:bg-brand-50 disabled:opacity-50"
                  @click="onSaveCustom"
                >
                  Save
                </button>
              </div>
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
            <button
              type="button"
              class="text-[11px] font-medium text-slate-500 hover:text-slate-800 px-2 py-1.5 rounded-lg hover:bg-slate-100"
              @click="emit('close')"
            >
              Cancel
            </button>
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
