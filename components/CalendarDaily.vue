<script setup lang="ts">
import dayjs, { type Dayjs } from "dayjs";
import {
  STATUS_BORDER,
  STATUS_DOTS,
  STATUS_LABELS,
  type Task,
  type TimeBlock,
} from "~/types/task";

const props = defineProps<{
  tasks: Task[];
  date: Dayjs;
}>();

const emit = defineEmits<{
  (e: "select-task", task: Task): void;
  (e: "create-at", date: string): void;
}>();

const { colorOfTask } = useEpics();
const { saveTask } = useTasks();
const { pushToast } = useToasts();
const { settings, formatTime, formatHourLabel } = useSettings();

const HOURS = Array.from({ length: 24 }, (_, i) => i);
// Calendar density: compact mode shrinks the row height so a full 24-hour
// day takes ~75% as much vertical space. Snap grid, min-height and overall
// day height all derive from this so the math stays consistent.
const HOUR_HEIGHT = computed(() =>
  settings.value.density === "compact" ? 44 : 56
);
const SNAP_PX = computed(() => HOUR_HEIGHT.value / 4); // 15-minute grid
const MIN_HEIGHT_PX = computed(() => SNAP_PX.value * 2); // 30-minute minimum
const DAY_HEIGHT = computed(() => HOUR_HEIGHT.value * 24);
const DRAG_THRESHOLD_PX = 3;

interface PositionedBlock {
  task: Task;
  block: TimeBlock;
  top: number;
  height: number;
  column: number;
  columnCount: number;
}

type DragMode = "move" | "resize-top" | "resize-bottom";

interface DragSession {
  entry: PositionedBlock;
  mode: DragMode;
  startPointerY: number;
  startTop: number;
  startHeight: number;
  currentTop: number;
  currentHeight: number;
  moved: boolean;
  saving: boolean;
}

const drag = ref<DragSession | null>(null);
const suppressNextClick = ref(false);

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function snap(px: number) {
  return Math.round(px / SNAP_PX.value) * SNAP_PX.value;
}

function pxToHHMM(px: number) {
  const totalMin = (px / HOUR_HEIGHT.value) * 60;
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  return dayjs().hour(h).minute(m);
}

const dayBlocks = computed<PositionedBlock[]>(() => {
  const dayStart = props.date.startOf("day");
  const dayEnd = props.date.endOf("day");

  const ranged: { task: Task; block: TimeBlock; startMin: number; endMin: number }[] = [];
  for (const t of props.tasks) {
    for (const block of t.timeBlocks ?? []) {
      const start = dayjs(block.start);
      const end = dayjs(block.end);
      if (!start.isValid() || !end.isValid()) continue;
      if (end.isBefore(dayStart) || start.isAfter(dayEnd)) continue;

      const clipStart = start.isBefore(dayStart) ? dayStart : start;
      const clipEnd = end.isAfter(dayEnd) ? dayEnd : end;
      const startMin = clipStart.diff(dayStart, "minute");
      const endMin = Math.max(clipEnd.diff(dayStart, "minute"), startMin + 30);
      ranged.push({ task: t, block, startMin, endMin });
    }
  }
  ranged.sort((a, b) => a.startMin - b.startMin);

  const lanes: { endMin: number }[] = [];
  const withLanes = ranged.map((r) => {
    let lane = lanes.findIndex((l) => l.endMin <= r.startMin);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push({ endMin: r.endMin });
    } else {
      lanes[lane] = { endMin: r.endMin };
    }
    return { ...r, lane };
  });
  const totalLanes = Math.max(1, lanes.length);

  return withLanes.map((r) => ({
    task: r.task,
    block: r.block,
    top: (r.startMin / 60) * HOUR_HEIGHT.value,
    height: Math.max(
      28,
      ((r.endMin - r.startMin) / 60) * HOUR_HEIGHT.value - 4
    ),
    column: r.lane,
    columnCount: totalLanes,
  }));
});

const undatedTasks = computed(() =>
  props.tasks.filter((t) => {
    if (!t.dueDate) return false;
    if (!dayjs(t.dueDate).isSame(props.date, "day")) return false;
    const hasBlockToday = (t.timeBlocks ?? []).some((b) =>
      dayjs(b.start).isSame(props.date, "day")
    );
    return !hasBlockToday;
  })
);

function onSlotClick(hour: number) {
  if (suppressNextClick.value) {
    suppressNextClick.value = false;
    return;
  }
  const date = props.date.hour(hour).minute(0).second(0);
  emit("create-at", date.toISOString());
}

// --- Drag & resize ---------------------------------------------------------

function blockStyle(entry: PositionedBlock) {
  const active = drag.value && drag.value.entry.block.id === entry.block.id;
  const top = active ? drag.value!.currentTop : entry.top;
  const height = active ? drag.value!.currentHeight : entry.height;
  return {
    top: `${top}px`,
    height: `${height}px`,
    left: `calc(${(entry.column / entry.columnCount) * 100}% + 4px)`,
    width: `calc(${100 / entry.columnCount}% - 8px)`,
    zIndex: active ? 20 : "auto",
  };
}

function onPointerDown(e: PointerEvent, entry: PositionedBlock, mode: DragMode) {
  if (e.button !== 0) return;
  // Projected (recurring) ghosts aren't draggable; clicking still opens the
  // modal so the user can edit the recurrence rule itself.
  if (entry.block.projected) return;
  e.preventDefault();
  e.stopPropagation();
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

  drag.value = {
    entry,
    mode,
    startPointerY: e.clientY,
    startTop: entry.top,
    startHeight: entry.height,
    currentTop: entry.top,
    currentHeight: entry.height,
    moved: false,
    saving: false,
  };

  document.body.style.cursor = mode === "move" ? "grabbing" : "ns-resize";
  document.body.style.userSelect = "none";

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp, { once: true });
  window.addEventListener("pointercancel", onPointerCancel, { once: true });
}

function onPointerMove(e: PointerEvent) {
  const d = drag.value;
  if (!d) return;
  const dy = e.clientY - d.startPointerY;
  if (Math.abs(dy) > DRAG_THRESHOLD_PX) d.moved = true;

  if (d.mode === "move") {
    d.currentTop = clamp(
      snap(d.startTop + dy),
      0,
      DAY_HEIGHT.value - d.startHeight
    );
    d.currentHeight = d.startHeight;
  } else if (d.mode === "resize-top") {
    const proposedTop = clamp(
      snap(d.startTop + dy),
      0,
      d.startTop + d.startHeight - MIN_HEIGHT_PX.value
    );
    d.currentTop = proposedTop;
    d.currentHeight = d.startTop + d.startHeight - proposedTop;
  } else {
    d.currentTop = d.startTop;
    d.currentHeight = clamp(
      snap(d.startHeight + dy),
      MIN_HEIGHT_PX.value,
      DAY_HEIGHT.value - d.startTop
    );
  }
}

function teardownDrag() {
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  window.removeEventListener("pointermove", onPointerMove);
}

async function onPointerUp() {
  const d = drag.value;
  if (!d) {
    teardownDrag();
    return;
  }

  if (!d.moved) {
    // It was a tap — release without persisting and let the click event open the modal.
    drag.value = null;
    teardownDrag();
    return;
  }

  // Suppress the click that's about to fire as a synthetic event from the
  // same pointer interaction, so we don't immediately open the modal.
  suppressNextClick.value = true;

  const dayStart = props.date.startOf("day");
  const newStart = dayStart.add(
    (d.currentTop / HOUR_HEIGHT.value) * 60,
    "minute"
  );
  const newEnd = dayStart.add(
    ((d.currentTop + d.currentHeight) / HOUR_HEIGHT.value) * 60,
    "minute"
  );

  const task = d.entry.task;
  const updatedBlocks = (task.timeBlocks ?? []).map((b) =>
    b.id === d.entry.block.id
      ? { ...b, start: newStart.toISOString(), end: newEnd.toISOString() }
      : b
  );

  d.saving = true;
  try {
    await saveTask({ ...task, timeBlocks: updatedBlocks });
  } catch (err: unknown) {
    pushToast(
      err instanceof Error ? err.message : "Failed to reschedule",
      { tone: "danger" }
    );
  } finally {
    drag.value = null;
    teardownDrag();
    // Clear suppression on the next tick so future genuine clicks work.
    setTimeout(() => (suppressNextClick.value = false), 0);
  }
}

function onPointerCancel() {
  drag.value = null;
  teardownDrag();
}

function onBlockClick(e: MouseEvent, entry: PositionedBlock) {
  if (suppressNextClick.value) {
    e.stopPropagation();
    suppressNextClick.value = false;
    return;
  }
  emit("select-task", entry.task);
}

// Live label shown while dragging.
const dragLabel = computed(() => {
  const d = drag.value;
  if (!d) return null;
  const start = pxToHHMM(d.currentTop);
  const end = pxToHHMM(d.currentTop + d.currentHeight);
  return `${formatTime(start)} – ${formatTime(end)}`;
});

onBeforeUnmount(() => {
  if (drag.value) {
    teardownDrag();
    drag.value = null;
  }
});
</script>

<template>
  <div class="flex flex-col h-full">
    <div
      v-if="undatedTasks.length"
      class="px-4 py-3 border-b border-slate-200 bg-amber-50/40"
    >
      <p class="text-xs font-medium text-slate-600 mb-2">
        Due today (no scheduled block)
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="t in undatedTasks"
          :key="t.id"
          class="px-2.5 py-1 rounded-full text-xs font-medium ring-1 bg-white hover:bg-slate-50 transition flex items-center gap-1.5"
          :class="colorOfTask(t).ring"
          @click="emit('select-task', t)"
        >
          <span class="w-1.5 h-1.5 rounded-full" :class="colorOfTask(t).solid" />
          {{ t.title }}
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto scrollbar-thin">
      <div class="relative grid" style="grid-template-columns: 64px 1fr">
        <div class="border-r border-slate-200 bg-slate-50">
          <div
            v-for="h in HOURS"
            :key="h"
            class="text-[10px] font-medium text-slate-500 px-2 pt-1 tabular-nums"
            :style="{ height: HOUR_HEIGHT + 'px' }"
          >
            {{ formatHourLabel(h) }}
          </div>
        </div>

        <div class="relative">
          <div
            v-for="h in HOURS"
            :key="`slot-${h}`"
            class="border-b border-slate-100 hover:bg-brand-50/30 cursor-pointer transition"
            :style="{ height: HOUR_HEIGHT + 'px' }"
            @click="onSlotClick(h)"
          />

          <button
            v-for="entry in dayBlocks"
            :key="entry.block.id"
            :class="[
              'absolute rounded-lg px-2 py-1 text-left text-xs font-medium ring-1 shadow-sm hover:shadow-md transition-shadow overflow-hidden border-l-4 select-none group',
              colorOfTask(entry.task).bg,
              colorOfTask(entry.task).text,
              colorOfTask(entry.task).ring,
              STATUS_BORDER[entry.task.status],
              entry.block.projected
                ? 'opacity-60 border-dashed cursor-pointer'
                : drag && drag.entry.block.id === entry.block.id
                ? 'cursor-grabbing shadow-lg'
                : 'cursor-grab',
            ]"
            :style="blockStyle(entry)"
            :title="
              entry.block.projected
                ? `${entry.task.title} · recurring (projection)`
                : `${entry.task.title} · ${STATUS_LABELS[entry.task.status]}`
            "
            @pointerdown="onPointerDown($event, entry, 'move')"
            @click="onBlockClick($event, entry)"
          >
            <!-- Resize handle (top) — hidden for projections. -->
            <span
              v-if="!entry.block.projected"
              class="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity"
              @pointerdown="onPointerDown($event, entry, 'resize-top')"
              @click.stop
              aria-hidden="true"
            />

            <div class="flex items-center gap-1">
              <span
                class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                :class="STATUS_DOTS[entry.task.status]"
              />
              <div class="truncate font-semibold">{{ entry.task.title }}</div>
              <svg
                v-if="entry.block.projected"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="w-3 h-3 shrink-0 opacity-70"
                aria-hidden="true"
              >
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M3 3v5h5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
            <div class="text-[10px] opacity-80 tabular-nums">
              <template v-if="drag && drag.entry.block.id === entry.block.id">
                {{ dragLabel }}
              </template>
              <template v-else>
                {{ formatTime(dayjs(entry.block.start)) }} –
                {{ formatTime(dayjs(entry.block.end)) }}
                <span
                  v-if="entry.block.projected"
                  class="ml-1 italic opacity-80"
                >
                  · recurring
                </span>
                <span
                  v-else-if="typeof entry.block.spentHours === 'number'"
                  class="ml-1"
                >
                  · {{ entry.block.spentHours }}h
                </span>
              </template>
            </div>

            <!-- Resize handle (bottom) — hidden for projections. -->
            <span
              v-if="!entry.block.projected"
              class="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity"
              @pointerdown="onPointerDown($event, entry, 'resize-bottom')"
              @click.stop
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
