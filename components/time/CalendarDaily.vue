<script setup lang="ts">
import dayjs, { type Dayjs } from "dayjs";
import { newClientId } from "~/utils/clientId";
import { type Task, type TimeBlock } from "~/types/task";
import {
  useCalendarDailyInteractions,
  type PositionedCalendarBlock,
} from "~/composables/time/calendarDailyInteractions";

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
const { settings, formatTime } = useSettings();
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
const { drag, dragLabel, suppressNextClick, onPointerDown } =
  useCalendarDailyInteractions({
    date: () => props.date,
    hourHeight: HOUR_HEIGHT,
  });

const dayBlocks = computed<PositionedCalendarBlock[]>(() => {
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

function openSpentPopover(e: MouseEvent, entry: PositionedCalendarBlock) {
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

function onBlockClick(e: MouseEvent, entry: PositionedCalendarBlock) {
  if (suppressNextClick.value) {
    e.stopPropagation();
    suppressNextClick.value = false;
    return;
  }
  e.stopPropagation();
  openSpentPopover(e, entry);
}

function onBlockDblClick(e: MouseEvent, entry: PositionedCalendarBlock) {
  e.stopPropagation();
  closeSpentPopover();
  emit("select-task", entry.task);
}
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
          v-for="task in undatedTasks"
          :key="task.id"
          class="px-2.5 py-1 rounded-full text-xs font-medium ring-1 bg-white hover:bg-slate-50 transition flex items-center gap-1.5"
          :class="colorOfTask(task).ring"
          @click="emit('select-task', task)"
        >
          <span
            class="w-1.5 h-1.5 rounded-full"
            :class="colorOfTask(task).solid"
          />
          {{ task.title }}
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
