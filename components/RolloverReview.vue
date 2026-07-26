<script setup lang="ts">
import dayjs from "dayjs";
import {
  PRIORITY_BADGE,
  PRIORITY_I18N_KEYS,
  PRIORITY_RANK,
  TaskPriority,
  TaskStatus,
  type Task,
} from "~/types/task";

const props = defineProps<{
  tasks: Task[];
}>();

const { t } = useI18n();
const { findEpic, colorOfTask } = useEpics();
const { rescheduleToDay } = useSchedule();
const { pushToast } = useToasts();
const { formatTime, settings } = useSettings();
const { requestFocusTask } = useUiOverlays();
const router = useRouter();

const busyId = ref<string | null>(null);
const bulkBusy = ref(false);

/** Open incomplete work that slipped: overdue due date or past scheduled blocks. */
const rolledOver = computed(() => {
  const startOfToday = dayjs().startOf("day");
  return props.tasks
    .filter((task) => {
      if (task.status === TaskStatus.Done) return false;
      if (task.dueDate && dayjs(task.dueDate).isBefore(startOfToday, "day")) {
        return true;
      }
      return (task.timeBlocks ?? []).some(
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

function weekdayShort(d: dayjs.Dayjs): string {
  const sunIndex = d.day();
  if (settings.value.weekStart === "mon") {
    const monIndex = sunIndex === 0 ? 6 : sunIndex - 1;
    return t(`calendar.weekdayMon${monIndex}`);
  }
  return t(`calendar.weekdaySun${sunIndex}`);
}

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
    return t("analytics.rollover.dueAndLastBlock", {
      due: dayjs(task.dueDate).format("MMM D"),
      block: dayjs(pastBlock.start).format("MMM D"),
    });
  }
  if (overdue) {
    return t("analytics.rollover.dueDate", {
      date: dayjs(task.dueDate).format("MMM D"),
    });
  }
  if (pastBlock) {
    return t("analytics.rollover.scheduled", {
      date: dayjs(pastBlock.start).format("MMM D"),
      time: formatTime(dayjs(pastBlock.start)),
    });
  }
  return t("analytics.rollover.needsNewSlot");
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
        ? t("toasts.movedTaskTo", {
            title: saved.title,
            day: weekdayShort(dayjs(start)),
            time: formatTime(dayjs(start)),
          })
        : t("toasts.movedTask", { title: saved.title }),
      { tone: "success", duration: 2800 }
    );
  } catch (err: unknown) {
    pushToast(
      err instanceof Error ? err.message : t("toasts.couldNotReschedule"),
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
    for (const task of [...rolledOver.value]) {
      try {
        await rescheduleToDay(task, dayjs());
        ok += 1;
      } catch {
        // continue remaining
      }
    }
    pushToast(
      ok
        ? t("toasts.rescheduledCount", ok, { count: ok })
        : t("toasts.couldNotRescheduleAny"),
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
          {{ $t("analytics.rollover.title") }}
          <span
            class="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700"
          >
            {{ rolledOver.length }}
          </span>
        </h3>
        <p class="text-[11px] text-slate-500 mt-0.5">
          {{ $t("analytics.rollover.subtitle") }}
        </p>
      </div>
      <button
        type="button"
        :disabled="bulkBusy"
        class="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white shadow-sm disabled:opacity-50"
        @click="moveAllToday"
      >
        {{
          bulkBusy
            ? $t("analytics.rollover.moving")
            : $t("analytics.rollover.moveAllToday")
        }}
      </button>
    </header>

    <ul class="divide-y divide-slate-100">
      <li
        v-for="task in rolledOver"
        :key="task.id"
        class="px-4 py-3 flex items-center gap-3 flex-wrap"
      >
        <button
          type="button"
          class="flex-1 min-w-[12rem] text-left"
          @click="openOnDashboard(task)"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span
              class="w-2 h-2 rounded-full shrink-0"
              :class="colorOfTask(task).solid"
            />
            <p class="text-sm font-medium text-slate-800 truncate">
              {{ task.title }}
            </p>
            <span
              v-if="task.priority !== undefined && task.priority !== TaskPriority.Normal"
              class="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0"
              :class="PRIORITY_BADGE[task.priority]"
            >
              {{ $t(PRIORITY_I18N_KEYS[task.priority]) }}
            </span>
          </div>
          <p class="mt-0.5 text-[11px] text-slate-500 truncate ml-4">
            <span v-if="findEpic(task.epicId)">
              {{ findEpic(task.epicId)?.title }} ·
            </span>
            {{ reasonFor(task) }}
          </p>
        </button>
        <div class="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            :disabled="busyId === task.id || bulkBusy"
            class="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-50"
            @click="moveOne(task, 'today')"
          >
            {{ $t("analytics.rollover.today") }}
          </button>
          <button
            type="button"
            :disabled="busyId === task.id || bulkBusy"
            class="text-[11px] font-medium px-2.5 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            @click="moveOne(task, 'tomorrow')"
          >
            {{ $t("analytics.rollover.tomorrow") }}
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
