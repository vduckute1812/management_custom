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
const { saveTask, findTask } = useTasks();
const { pushToast } = useToasts();
const { startOfWeek, formatTime } = useSettings();
const { now } = useNow();
const nowLabel = computed(() => formatTime(now.value));

const days = computed(() => {
  const start = startOfWeek(props.date);
  return Array.from({ length: 7 }, (_, i) => start.add(i, "day"));
});

interface DayEntry {
  key: string;
  task: Task;
  block?: TimeBlock;
  sortKey: string;
}

function entriesForDay(day: Dayjs): DayEntry[] {
  const entries: DayEntry[] = [];
  const seenForDay = new Set<string>();

  for (const t of props.tasks) {
    const blocksToday = (t.timeBlocks ?? []).filter((b) =>
      dayjs(b.start).isSame(day, "day")
    );
    for (const b of blocksToday) {
      entries.push({
        key: `${t.id}:${b.id}`,
        task: t,
        block: b,
        sortKey: b.start,
      });
      seenForDay.add(t.id);
    }

    if (
      t.dueDate &&
      dayjs(t.dueDate).isSame(day, "day") &&
      !seenForDay.has(t.id)
    ) {
      entries.push({
        key: `${t.id}:due`,
        task: t,
        sortKey: day.endOf("day").toISOString(),
      });
    }
  }

  entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return entries;
}

function blockLabel(b: TimeBlock) {
  return `${formatTime(dayjs(b.start))} – ${formatTime(dayjs(b.end))}`;
}

// --- Drag-and-drop across day columns -------------------------------------

interface DragPayload {
  taskId: string;
  blockId: string;
}

const dragPayload = ref<DragPayload | null>(null);
const dragOverDay = ref<string | null>(null);

function onDragStart(e: DragEvent, entry: DayEntry) {
  if (!entry.block || entry.block.projected) {
    // Due-only items have no block; projections are read-only ghosts.
    e.preventDefault();
    return;
  }
  dragPayload.value = { taskId: entry.task.id, blockId: entry.block.id };
  e.dataTransfer?.setData(
    "application/x-mgmt-block",
    JSON.stringify(dragPayload.value)
  );
  e.dataTransfer && (e.dataTransfer.effectAllowed = "move");
}

function onDragEnd() {
  dragPayload.value = null;
  dragOverDay.value = null;
}

function onColumnDragOver(e: DragEvent, day: Dayjs) {
  if (!dragPayload.value) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  dragOverDay.value = day.format("YYYY-MM-DD");
}

function onColumnDragLeave(day: Dayjs) {
  if (dragOverDay.value === day.format("YYYY-MM-DD")) {
    dragOverDay.value = null;
  }
}

async function onColumnDrop(e: DragEvent, day: Dayjs) {
  e.preventDefault();
  let payload = dragPayload.value;
  if (!payload) {
    const raw = e.dataTransfer?.getData("application/x-mgmt-block");
    if (raw) {
      try {
        payload = JSON.parse(raw) as DragPayload;
      } catch {
        payload = null;
      }
    }
  }
  dragOverDay.value = null;
  dragPayload.value = null;
  if (!payload) return;

  const task = findTask(payload.taskId);
  if (!task) return;
  const block = (task.timeBlocks ?? []).find((b) => b.id === payload!.blockId);
  if (!block) return;

  // Preserve the time-of-day on the source block; only swap the date.
  const currentStart = dayjs(block.start);
  const currentEnd = dayjs(block.end);
  if (currentStart.isSame(day, "day")) return; // no-op
  const newStart = day
    .hour(currentStart.hour())
    .minute(currentStart.minute())
    .second(0)
    .millisecond(0);
  const durationMin = Math.max(15, currentEnd.diff(currentStart, "minute"));
  const newEnd = newStart.add(durationMin, "minute");

  const updatedBlocks = (task.timeBlocks ?? []).map((b) =>
    b.id === block.id
      ? { ...b, start: newStart.toISOString(), end: newEnd.toISOString() }
      : b
  );

  try {
    await saveTask({ ...task, timeBlocks: updatedBlocks });
    pushToast(`Moved to ${day.format("ddd D MMM")}`, {
      tone: "success",
      duration: 2200,
    });
  } catch (err: unknown) {
    pushToast(
      err instanceof Error ? err.message : "Failed to move block",
      { tone: "danger" }
    );
  }
}
</script>

<template>
  <div class="grid grid-cols-7 gap-2 p-4 h-full overflow-y-auto scrollbar-thin">
    <div
      v-for="day in days"
      :key="day.toString()"
      class="bg-white rounded-xl ring-1 flex flex-col min-h-[400px] transition"
      :class="
        dragOverDay === day.format('YYYY-MM-DD')
          ? 'ring-2 ring-brand-400 bg-brand-50/40'
          : 'ring-slate-200'
      "
      @dragover="onColumnDragOver($event, day)"
      @dragleave="onColumnDragLeave(day)"
      @drop="onColumnDrop($event, day)"
    >
      <header
        class="px-3 py-2 border-b border-slate-100 flex items-center justify-between"
        :class="{ 'bg-brand-50': day.isSame(now, 'day') }"
      >
        <div>
          <div class="text-[10px] font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <span>{{ day.format("ddd") }}</span>
            <span
              v-if="day.isSame(now, 'day')"
              class="inline-flex items-center px-1 py-px rounded text-[9px] font-semibold tabular-nums bg-rose-600 text-white tracking-normal"
              :title="`Current time · ${nowLabel}`"
            >
              {{ nowLabel }}
            </span>
          </div>
          <div
            class="text-lg font-semibold tabular-nums"
            :class="
              day.isSame(now, 'day')
                ? 'text-brand-700'
                : 'text-slate-900'
            "
          >
            {{ day.format("D") }}
          </div>
        </div>
        <button
          class="text-slate-400 hover:text-brand-600 transition"
          :aria-label="`Add task on ${day.format('ddd D')}`"
          @click="emit('create-at', day.hour(9).toISOString())"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-4 h-4"
          >
            <path d="M12 5v14M5 12h14" stroke-linecap="round" />
          </svg>
        </button>
      </header>
      <div class="flex-1 p-2 space-y-1.5 overflow-y-auto scrollbar-thin">
        <button
          v-for="entry in entriesForDay(day)"
          :key="entry.key"
          :class="[
            'w-full text-left rounded-lg px-2 py-1.5 ring-1 hover:shadow transition border-l-4',
            colorOfTask(entry.task).bg,
            colorOfTask(entry.task).text,
            colorOfTask(entry.task).ring,
            STATUS_BORDER[entry.task.status],
            entry.block?.projected ? 'opacity-60 border-dashed cursor-pointer' : '',
            entry.block && !entry.block.projected
              ? 'cursor-grab active:cursor-grabbing'
              : '',
            dragPayload &&
            entry.block &&
            dragPayload.blockId === entry.block.id
              ? 'opacity-50'
              : '',
          ]"
          :draggable="!!entry.block && !entry.block.projected"
          :title="
            entry.block?.projected
              ? `${entry.task.title} · recurring (projection)`
              : `${entry.task.title} · ${STATUS_LABELS[entry.task.status]}`
          "
          @dragstart="onDragStart($event, entry)"
          @dragend="onDragEnd"
          @click="emit('select-task', entry.task)"
        >
          <div class="flex items-center gap-1">
            <span
              class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
              :class="STATUS_DOTS[entry.task.status]"
            />
            <div class="text-xs font-semibold truncate">{{ entry.task.title }}</div>
            <svg
              v-if="entry.block?.projected"
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
            <template v-if="entry.block">
              {{ blockLabel(entry.block) }}
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
            <template v-else>Due today</template>
          </div>
        </button>
        <p
          v-if="entriesForDay(day).length === 0"
          class="text-[11px] text-slate-400 italic px-1 pt-2"
        >
          No tasks
        </p>
      </div>
    </div>
  </div>
</template>
