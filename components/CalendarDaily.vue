<script setup lang="ts">
import dayjs, { type Dayjs } from "dayjs";
import { newClientId } from "~/utils/clientId";
import { type Task, type TimeBlock } from "~/types/task";

const props = defineProps<{
  tasks: Task[];
  date: Dayjs;
}>();

const emit = defineEmits<{
  (e: "select-task", task: Task): void;
  (e: "create-at", date: string): void;
  (e: "scheduled", task: Task): void;
}>();

const { t } = useI18n();
const { colorOfTask } = useEpics();
const { saveTask, findTask } = useTasks();
const { pushToast } = useToasts();
const { settings, formatTime, formatHourLabel } = useSettings();
const { now } = useNow();

function weekdayShort(d: Dayjs): string {
  const sunIndex = d.day(); // 0 = Sun
  if (settings.value.weekStart === "mon") {
    const monIndex = sunIndex === 0 ? 6 : sunIndex - 1;
    return t(`calendar.weekdayMon${monIndex}`);
  }
  return t(`calendar.weekdaySun${sunIndex}`);
}

const TASK_DND_MIME = "application/x-mgmt-task-id";

const spentOpen = ref(false);
const spentTask = ref<Task | null>(null);
const spentBlock = ref<TimeBlock | null>(null);
const spentAnchor = ref<{ x: number; y: number } | null>(null);
const dropHour = ref<number | null>(null);

const HOURS = Array.from({ length: 24 }, (_, i) => i);
// Calendar density: compact mode shrinks the row height so a full 24-hour
// day takes ~75% as much vertical space. Snap grid, min-height and overall
// day height all derive from this so the math stays consistent.
const HOUR_HEIGHT = computed(() =>
  settings.value.density === "compact" ? 44 : 56,
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

  const ranged: {
    task: Task;
    block: TimeBlock;
    startMin: number;
    endMin: number;
  }[] = [];
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
      ((r.endMin - r.startMin) / 60) * HOUR_HEIGHT.value - 4,
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
      dayjs(b.start).isSame(props.date, "day"),
    );
    return !hasBlockToday;
  }),
);

// Live "now" indicator — only meaningful when the column actually represents
// today. Position is pixels-from-day-start = (minutes / 60) * hourHeight.
const showNowLine = computed(() => now.value.isSame(props.date, "day"));
const nowTopPx = computed(() => {
  const minutes = now.value.hour() * 60 + now.value.minute();
  return (minutes / 60) * HOUR_HEIGHT.value;
});
const nowLabel = computed(() => formatTime(now.value));

function onSlotClick(hour: number) {
  if (suppressNextClick.value) {
    suppressNextClick.value = false;
    return;
  }
  const date = props.date.hour(hour).minute(0).second(0);
  emit("create-at", date.toISOString());
}

function onSlotKeydown(e: KeyboardEvent, hour: number) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    onSlotClick(hour);
  }
}

function hasTaskDrag(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  const types = Array.from(dt.types ?? []);
  return types.includes(TASK_DND_MIME) || types.includes("text/plain");
}

function onSlotDragOver(e: DragEvent, hour: number) {
  if (!hasTaskDrag(e.dataTransfer)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  dropHour.value = hour;
}

function onSlotDragLeave(hour: number) {
  if (dropHour.value === hour) dropHour.value = null;
}

async function onSlotDrop(e: DragEvent, hour: number) {
  dropHour.value = null;
  const taskId =
    e.dataTransfer?.getData(TASK_DND_MIME) ||
    e.dataTransfer?.getData("text/plain");
  if (!taskId) return;
  e.preventDefault();
  e.stopPropagation();
  await scheduleTaskAtHour(taskId, hour);
}

async function scheduleTaskAtHour(taskId: string, hour: number) {
  const task = findTask(taskId);
  if (!task) {
    pushToast(t("toasts.couldNotFindTask"), { tone: "danger" });
    return;
  }
  const start = props.date.hour(hour).minute(0).second(0).millisecond(0);
  const end = start.add(1, "hour");
  const blocks = [...(task.timeBlocks ?? [])].filter((b) => !b.projected);

  const todayIdx = blocks.findIndex((b) =>
    dayjs(b.start).isSame(props.date, "day"),
  );
  const todayBlock = todayIdx >= 0 ? blocks[todayIdx] : undefined;
  if (todayBlock) {
    blocks[todayIdx] = {
      ...todayBlock,
      start: start.toISOString(),
      end: end.toISOString(),
    };
  } else {
    blocks.push({
      id: newClientId("block"),
      start: start.toISOString(),
      end: end.toISOString(),
    });
  }

  try {
    const saved = await saveTask({ ...task, timeBlocks: blocks });
    pushToast(
      t("toasts.scheduledOn", {
        day: weekdayShort(start),
        time: formatTime(start),
      }),
      {
        tone: "success",
        duration: 2500,
      },
    );
    emit("scheduled", saved);
  } catch (err: unknown) {
    pushToast(
      err instanceof Error ? err.message : t("toasts.failedToSchedule"),
      { tone: "danger" },
    );
  }
}

function openSpentPopover(e: MouseEvent, entry: PositionedBlock) {
  if (entry.block.projected) {
    emit("select-task", entry.task);
    return;
  }
  spentTask.value = entry.task;
  spentBlock.value = entry.block;
  spentAnchor.value = { x: e.clientX + 8, y: e.clientY + 8 };
  spentOpen.value = true;
}

function closeSpentPopover() {
  spentOpen.value = false;
  spentTask.value = null;
  spentBlock.value = null;
  spentAnchor.value = null;
}

function editDetailsFromPopover() {
  const task = spentTask.value;
  closeSpentPopover();
  if (task) emit("select-task", task);
}

// --- Drag & resize ---------------------------------------------------------

function onPointerDown(
  e: PointerEvent,
  entry: PositionedBlock,
  mode: DragMode,
) {
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
      DAY_HEIGHT.value - d.startHeight,
    );
    d.currentHeight = d.startHeight;
  } else if (d.mode === "resize-top") {
    const proposedTop = clamp(
      snap(d.startTop + dy),
      0,
      d.startTop + d.startHeight - MIN_HEIGHT_PX.value,
    );
    d.currentTop = proposedTop;
    d.currentHeight = d.startTop + d.startHeight - proposedTop;
  } else {
    d.currentTop = d.startTop;
    d.currentHeight = clamp(
      snap(d.startHeight + dy),
      MIN_HEIGHT_PX.value,
      DAY_HEIGHT.value - d.startTop,
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
    "minute",
  );
  const newEnd = dayStart.add(
    ((d.currentTop + d.currentHeight) / HOUR_HEIGHT.value) * 60,
    "minute",
  );

  const task = d.entry.task;
  const updatedBlocks = (task.timeBlocks ?? []).map((b) =>
    b.id === d.entry.block.id
      ? { ...b, start: newStart.toISOString(), end: newEnd.toISOString() }
      : b,
  );

  d.saving = true;
  try {
    await saveTask({ ...task, timeBlocks: updatedBlocks });
  } catch (err: unknown) {
    pushToast(
      err instanceof Error ? err.message : t("toasts.failedToReschedule"),
      { tone: "danger" },
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
  e.stopPropagation();
  openSpentPopover(e, entry);
}

function onBlockDblClick(e: MouseEvent, entry: PositionedBlock) {
  e.stopPropagation();
  closeSpentPopover();
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
        {{ $t("calendar.dueToday") }}
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="t in undatedTasks"
          :key="t.id"
          class="px-2.5 py-1 rounded-full text-xs font-medium ring-1 bg-white hover:bg-slate-50 transition flex items-center gap-1.5"
          :class="colorOfTask(t).ring"
          @click="emit('select-task', t)"
        >
          <span
            class="w-1.5 h-1.5 rounded-full"
            :class="colorOfTask(t).solid"
          />
          {{ t.title }}
        </button>
      </div>
    </div>

    <CalendarDailyGrid
      :hours="HOURS"
      :hour-height="HOUR_HEIGHT"
      :drop-hour="dropHour"
      :day-blocks="dayBlocks"
      :drag="drag"
      :show-now-line="showNowLine"
      :now-top-px="nowTopPx"
      :now-label="nowLabel"
      :drag-label="dragLabel"
      @slot-click="onSlotClick"
      @slot-keydown="onSlotKeydown"
      @slot-dragover="onSlotDragOver"
      @slot-dragleave="onSlotDragLeave"
      @slot-drop="onSlotDrop"
      @block-pointerdown="onPointerDown"
      @block-click="onBlockClick"
      @block-dblclick="onBlockDblClick"
    />

    <BlockSpentPopover
      :open="spentOpen"
      :task="spentTask"
      :block="spentBlock"
      :anchor="spentAnchor"
      @close="closeSpentPopover"
      @edit-details="editDetailsFromPopover"
      @saved="closeSpentPopover"
    />
  </div>
</template>
