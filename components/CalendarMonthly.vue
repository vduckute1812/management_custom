<script setup lang="ts">
import dayjs, { type Dayjs } from "dayjs";
import type { Task } from "~/types/task";

const props = defineProps<{
  tasks: Task[];
  date: Dayjs;
}>();

const emit = defineEmits<{
  (e: "select-task", task: Task): void;
  (e: "create-at", date: string): void;
}>();

const { colorOfTask } = useEpics();
const { startOfWeek, settings } = useSettings();

const cells = computed(() => {
  const monthStart = props.date.startOf("month");
  const gridStart = startOfWeek(monthStart);
  return Array.from({ length: 42 }, (_, i) => gridStart.add(i, "day"));
});

const weekdayLabels = computed(() =>
  settings.value.weekStart === "mon"
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
);

interface DayBreakdown {
  blocks: { task: Task; start: string; projected: boolean }[];
  deadlines: Task[];
}

function breakdownFor(day: Dayjs): DayBreakdown {
  const blocks: DayBreakdown["blocks"] = [];
  const deadlines: Task[] = [];
  for (const t of props.tasks) {
    for (const b of t.timeBlocks ?? []) {
      if (dayjs(b.start).isSame(day, "day")) {
        blocks.push({ task: t, start: b.start, projected: !!b.projected });
      }
    }
    if (t.dueDate && dayjs(t.dueDate).isSame(day, "day")) {
      deadlines.push(t);
    }
  }
  blocks.sort((a, b) => a.start.localeCompare(b.start));
  return { blocks, deadlines };
}

function densityBucket(count: number): number {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  return 4;
}

const DENSITY_OPACITY = [
  "opacity-0",
  "opacity-40",
  "opacity-60",
  "opacity-80",
  "opacity-100",
];
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="grid grid-cols-7 px-4 pt-4">
      <div
        v-for="label in weekdayLabels"
        :key="label"
        class="text-[10px] font-medium text-slate-500 uppercase tracking-wider py-2 text-center"
      >
        {{ label }}
      </div>
    </div>

    <div
      class="grid grid-cols-7 grid-rows-6 gap-1 px-4 pb-4 flex-1 overflow-y-auto scrollbar-thin"
    >
      <button
        v-for="day in cells"
        :key="day.toString()"
        class="text-left rounded-lg ring-1 ring-slate-200 bg-white p-1.5 hover:bg-brand-50/40 transition flex flex-col min-h-[88px]"
        :class="{
          'opacity-50': !day.isSame(date, 'month'),
          'ring-brand-400 bg-brand-50/60': day.isSame(dayjs(), 'day'),
        }"
        @click="emit('create-at', day.hour(9).toISOString())"
      >
        <div class="flex items-center justify-between">
          <span
            class="text-xs font-semibold tabular-nums"
            :class="
              day.isSame(dayjs(), 'day') ? 'text-brand-700' : 'text-slate-700'
            "
          >
            {{ day.format("D") }}
          </span>
          <span
            v-if="breakdownFor(day).blocks.length > 0"
            class="inline-flex items-center gap-0.5"
            :title="`${breakdownFor(day).blocks.length} scheduled blocks`"
          >
            <span
              class="block w-1.5 h-1.5 rounded-full bg-brand-500"
              :class="DENSITY_OPACITY[densityBucket(breakdownFor(day).blocks.length)]"
            />
            <span class="text-[10px] text-slate-500 tabular-nums">
              {{ breakdownFor(day).blocks.length }}
            </span>
          </span>
        </div>

        <div class="mt-1 space-y-0.5 overflow-hidden">
          <div
            v-for="entry in breakdownFor(day).blocks.slice(0, 3)"
            :key="entry.task.id + entry.start"
            class="flex items-center gap-1.5 truncate"
            :class="entry.projected ? 'opacity-60' : ''"
            :title="
              entry.projected
                ? `${entry.task.title} · recurring (projection)`
                : entry.task.title
            "
            @click.stop="emit('select-task', entry.task)"
          >
            <span
              class="w-1.5 h-1.5 shrink-0"
              :class="[
                colorOfTask(entry.task).solid,
                entry.projected ? 'rounded-sm ring-1 ring-white/40' : 'rounded-full',
              ]"
            />
            <span
              class="text-[11px] text-slate-700 truncate"
              :class="entry.projected ? 'italic' : ''"
            >
              {{ entry.task.title }}
            </span>
          </div>
          <div
            v-if="breakdownFor(day).blocks.length > 3"
            class="text-[10px] text-slate-400 pl-3"
          >
            +{{ breakdownFor(day).blocks.length - 3 }} more
          </div>
        </div>

        <div
          v-if="breakdownFor(day).deadlines.length > 0"
          class="mt-auto pt-1 flex items-center gap-1"
          :title="
            breakdownFor(day)
              .deadlines.map((t) => t.title)
              .join(', ')
          "
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-3 h-3 text-rose-500"
          >
            <path d="M4 4v17M4 4h13l-2 4 2 4H4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="text-[10px] font-medium text-rose-600 tabular-nums">
            {{ breakdownFor(day).deadlines.length }} due
          </span>
        </div>
      </button>
    </div>
  </div>
</template>
