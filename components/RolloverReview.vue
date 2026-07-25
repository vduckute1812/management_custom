<script setup lang="ts">
import dayjs from "dayjs";
import {
  PRIORITY_BADGE,
  PRIORITY_LABELS,
  PRIORITY_RANK,
  TaskPriority,
  TaskStatus,
  type Task,
} from "~/types/task";

const props = defineProps<{
  tasks: Task[];
}>();

const { findEpic, colorOfTask } = useEpics();
const { rescheduleToDay } = useSchedule();
const { pushToast } = useToasts();
const { formatTime } = useSettings();
const { requestFocusTask } = useUiOverlays();
const router = useRouter();

const busyId = ref<string | null>(null);
const bulkBusy = ref(false);

/** Open incomplete work that slipped: overdue due date or past scheduled blocks. */
const rolledOver = computed(() => {
  const startOfToday = dayjs().startOf("day");
  return props.tasks
    .filter((t) => {
      if (t.status === TaskStatus.Done) return false;
      if (t.dueDate && dayjs(t.dueDate).isBefore(startOfToday, "day")) {
        return true;
      }
      return (t.timeBlocks ?? []).some(
        (b) =>
          !b.projected &&
          dayjs(b.end).isValid() &&
          dayjs(b.end).isBefore(startOfToday)
      );
    })
    .sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority ?? TaskPriority.Normal];
      const pb = PRIORITY_RANK[b.priority ?? TaskPriority.Normal];
      if (pa !== pb) return pa - pb;
      const aDue = a.dueDate ?? "9999";
      const bDue = b.dueDate ?? "9999";
      return aDue.localeCompare(bDue);
    });
});

function reasonFor(task: Task): string {
  const startOfToday = dayjs().startOf("day");
  const overdue =
    task.dueDate && dayjs(task.dueDate).isBefore(startOfToday, "day");
  const pastBlock = (task.timeBlocks ?? []).find(
    (b) =>
      !b.projected &&
      dayjs(b.end).isValid() &&
      dayjs(b.end).isBefore(startOfToday)
  );
  if (overdue && pastBlock) {
    return `Due ${dayjs(task.dueDate).format("MMM D")} · last block ${dayjs(pastBlock.start).format("MMM D")}`;
  }
  if (overdue) return `Due ${dayjs(task.dueDate).format("MMM D")}`;
  if (pastBlock) {
    return `Scheduled ${dayjs(pastBlock.start).format("MMM D")} ${formatTime(dayjs(pastBlock.start))}`;
  }
  return "Needs a new slot";
}

async function moveOne(task: Task, when: "today" | "tomorrow") {
  busyId.value = task.id;
  try {
    const day =
      when === "today" ? dayjs() : dayjs().add(1, "day").startOf("day");
    const saved = await rescheduleToDay(task, day);
    const start = saved.timeBlocks?.find((b) =>
      dayjs(b.start).isSame(day, "day")
    )?.start;
    pushToast(
      start
        ? `Moved "${saved.title}" to ${dayjs(start).format("ddd")} ${formatTime(dayjs(start))}`
        : `Moved "${saved.title}"`,
      { tone: "success", duration: 2800 }
    );
  } catch (err: unknown) {
    pushToast(
      err instanceof Error ? err.message : "Couldn't reschedule",
      { tone: "danger" }
    );
  } finally {
    busyId.value = null;
  }
}

async function moveAllToday() {
  if (!rolledOver.value.length) return;
  bulkBusy.value = true;
  let ok = 0;
  try {
    for (const t of [...rolledOver.value]) {
      try {
        await rescheduleToDay(t, dayjs());
        ok += 1;
      } catch {
        // continue remaining
      }
    }
    pushToast(
      ok
        ? `Rescheduled ${ok} task${ok === 1 ? "" : "s"} to today`
        : "Couldn't reschedule any tasks",
      { tone: ok ? "success" : "danger", duration: 3200 }
    );
  } finally {
    bulkBusy.value = false;
  }
}

function openOnDashboard(task: Task) {
  requestFocusTask(task.id);
  router.push("/tasks");
}
</script>

<template>
  <section
    v-if="rolledOver.length > 0"
    class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm"
  >
    <header
      class="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap"
    >
      <div>
        <h3 class="text-sm font-semibold text-slate-800">
          Rolled over
          <span
            class="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700"
          >
            {{ rolledOver.length }}
          </span>
        </h3>
        <p class="text-[11px] text-slate-500 mt-0.5">
          Past due or past scheduled blocks — pick a new slot
        </p>
      </div>
      <button
        type="button"
        :disabled="bulkBusy"
        class="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white shadow-sm disabled:opacity-50"
        @click="moveAllToday"
      >
        {{ bulkBusy ? "Moving…" : "Move all to today" }}
      </button>
    </header>

    <ul class="divide-y divide-slate-100">
      <li
        v-for="t in rolledOver"
        :key="t.id"
        class="px-4 py-3 flex items-center gap-3 flex-wrap"
      >
        <button
          type="button"
          class="flex-1 min-w-[12rem] text-left"
          @click="openOnDashboard(t)"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span
              class="w-2 h-2 rounded-full shrink-0"
              :class="colorOfTask(t).solid"
            />
            <p class="text-sm font-medium text-slate-800 truncate">
              {{ t.title }}
            </p>
            <span
              v-if="t.priority !== undefined && t.priority !== TaskPriority.Normal"
              class="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0"
              :class="PRIORITY_BADGE[t.priority]"
            >
              {{ PRIORITY_LABELS[t.priority] }}
            </span>
          </div>
          <p class="mt-0.5 text-[11px] text-slate-500 truncate ml-4">
            <span v-if="findEpic(t.epicId)">
              {{ findEpic(t.epicId)?.title }} ·
            </span>
            {{ reasonFor(t) }}
          </p>
        </button>
        <div class="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            :disabled="busyId === t.id || bulkBusy"
            class="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-50"
            @click="moveOne(t, 'today')"
          >
            Today
          </button>
          <button
            type="button"
            :disabled="busyId === t.id || bulkBusy"
            class="text-[11px] font-medium px-2.5 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            @click="moveOne(t, 'tomorrow')"
          >
            Tomorrow
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
