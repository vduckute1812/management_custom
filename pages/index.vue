<script setup lang="ts">
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import {
  PRIORITY_BADGE,
  PRIORITY_LABELS,
  PRIORITY_RANK,
  TaskPriority,
  TaskStatus,
  type CalendarView,
  type Task,
} from "~/types/task";

dayjs.extend(isoWeek);

const { tasks, fetchAll, isLoading, error, findTask } = useTasks();
const { epics, fetchAll: fetchEpics, findEpic, colorOfTask } = useEpics();
const { quickCaptureOpen, focusTaskId, clearFocusTask } = useUiOverlays();
const { pushToast } = useToasts();
const { load: loadSamples } = useSampleData();
const { startOfWeek, formatTime } = useSettings();
const { withProjections } = useRecurrence();

const view = ref<CalendarView>("daily");
const cursor = ref(dayjs());
const taskModalOpen = ref(false);
const editingTask = ref<Task | null>(null);
const defaultStart = ref<string>("");
const seeding = ref(false);

await useAsyncData("dashboard:initial", async () => {
  await Promise.all([fetchAll(), fetchEpics()]);
  return { ok: true };
});

// External "open this task" requests (notification toasts, deep links, etc.)
// land in `useUiOverlays.focusTaskId`. Watch it once the task list is hydrated
// and pop the modal; clear the signal so the same id can fire again later.
watch(
  [focusTaskId, tasks],
  ([id, _list]) => {
    if (!id) return;
    const task = findTask(id);
    if (!task) return;
    editingTask.value = task;
    taskModalOpen.value = true;
    clearFocusTask();
  },
  { immediate: true }
);

const headerLabel = computed(() => {
  if (view.value === "daily") return cursor.value.format("dddd, MMMM D, YYYY");
  if (view.value === "weekly") {
    const start = startOfWeek(cursor.value);
    const end = start.add(6, "day");
    return `${start.format("MMM D")} – ${end.format("MMM D, YYYY")}`;
  }
  return cursor.value.format("MMMM YYYY");
});

function step(direction: 1 | -1) {
  const unit =
    view.value === "daily" ? "day" : view.value === "weekly" ? "week" : "month";
  cursor.value = cursor.value.add(direction, unit);
}

// Recurrence projection window for the current view. Recurring tasks show
// ghost blocks on the calendar within this window; logged time still belongs
// only to the canonical (non-projected) blocks.
const projectionWindow = computed(() => {
  if (view.value === "daily") {
    return {
      start: cursor.value.startOf("day"),
      end: cursor.value.endOf("day"),
    };
  }
  if (view.value === "weekly") {
    const start = startOfWeek(cursor.value);
    return { start, end: start.add(6, "day").endOf("day") };
  }
  // Monthly grid spans 6 weeks starting at the beginning of the week
  // containing the 1st — match the rendering range of CalendarMonthly.
  const monthStart = cursor.value.startOf("month");
  const gridStart = startOfWeek(monthStart);
  return { start: gridStart, end: gridStart.add(41, "day").endOf("day") };
});

const projectedTasks = computed(() =>
  withProjections(tasks.value, projectionWindow.value.start, projectionWindow.value.end)
);

function jumpToday() {
  cursor.value = dayjs();
}

function openCreate(iso?: string) {
  editingTask.value = null;
  defaultStart.value = iso ?? dayjs().toISOString();
  taskModalOpen.value = true;
}

function openEdit(task: Task) {
  editingTask.value = task;
  taskModalOpen.value = true;
}

async function seedSamples() {
  seeding.value = true;
  try {
    await loadSamples();
    pushToast("Sample data loaded — explore!", { tone: "success" });
  } catch (err) {
    pushToast(
      err instanceof Error ? err.message : "Failed to load samples",
      { tone: "danger" }
    );
  } finally {
    seeding.value = false;
  }
}

usePageShortcuts([
  { key: "1", handler: () => (view.value = "daily") },
  { key: "2", handler: () => (view.value = "weekly") },
  { key: "3", handler: () => (view.value = "monthly") },
  { key: "t", handler: jumpToday },
  { key: "ArrowLeft", handler: () => step(-1) },
  { key: "ArrowRight", handler: () => step(1) },
]);

const upcoming = computed<Task[]>(() => {
  return [...tasks.value]
    .filter((t) => t.status !== TaskStatus.Done)
    .sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority ?? TaskPriority.Normal];
      const pb = PRIORITY_RANK[b.priority ?? TaskPriority.Normal];
      if (pa !== pb) return pa - pb;
      const aFirst = a.timeBlocks?.[0]?.start ?? a.dueDate ?? "9999";
      const bFirst = b.timeBlocks?.[0]?.start ?? b.dueDate ?? "9999";
      return aFirst.localeCompare(bFirst);
    })
    .slice(0, 6);
});

const stats = computed(() => {
  const total = tasks.value.length;
  const done = tasks.value.filter((t) => t.status === TaskStatus.Done).length;
  const inProgress = tasks.value.filter(
    (t) => t.status === TaskStatus.InProgress
  ).length;
  return { total, done, inProgress };
});

const isEmpty = computed(
  () => !isLoading.value && tasks.value.length === 0 && epics.value.length === 0
);
</script>

<template>
  <div class="flex flex-col h-screen">
    <header
      class="px-4 md:px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between gap-3 flex-wrap"
    >
      <div>
        <h1 class="text-xl font-semibold text-slate-900">{{ headerLabel }}</h1>
        <p class="text-xs text-slate-500 mt-0.5">
          {{ stats.total }} total · {{ stats.inProgress }} in progress ·
          {{ stats.done }} done · {{ epics.length }} epics
        </p>
      </div>

      <div class="flex items-center gap-2">
        <div class="inline-flex rounded-lg ring-1 ring-slate-200 overflow-hidden">
          <button
            v-for="opt in (['daily', 'weekly', 'monthly'] as const)"
            :key="opt"
            class="px-3 py-1.5 text-xs font-medium capitalize transition"
            :class="
              view === opt
                ? 'bg-brand-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            "
            @click="view = opt"
          >
            {{ opt }}
          </button>
        </div>

        <div class="inline-flex items-center gap-1 ml-1">
          <button
            class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
            aria-label="Previous"
            @click="step(-1)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="w-4 h-4"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            class="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100"
            @click="jumpToday"
          >
            Today
          </button>
          <button
            class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
            aria-label="Next"
            @click="step(1)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="w-4 h-4"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        <button
          class="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white shadow-sm"
          @click="quickCaptureOpen = true"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            class="w-4 h-4"
          >
            <path d="M12 5v14M5 12h14" stroke-linecap="round" />
          </svg>
          Quick capture
          <kbd class="hidden sm:inline px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">n</kbd>
        </button>
      </div>
    </header>

    <div
      v-if="error"
      class="px-6 py-2 bg-rose-50 text-rose-700 text-sm border-b border-rose-200"
    >
      {{ error }}
    </div>

    <!-- Empty state takes over the whole canvas on first run. -->
    <div
      v-if="isEmpty"
      class="flex-1 flex items-center justify-center p-6"
    >
      <EmptyState
        title="Plan your first focused day"
        description="Capture a task or load a small sample so every view has something to render."
        illustration="calendar"
        primary-label="Quick capture"
        primary-shortcut="n"
        secondary-label="Load sample data"
        :secondary-loading="seeding"
        @primary="quickCaptureOpen = true"
        @secondary="seedSamples"
      />
    </div>

    <div
      v-else
      class="flex-1 min-h-0 grid"
      style="grid-template-columns: 1fr 300px"
    >
      <section class="min-h-0 overflow-hidden">
        <SkeletonList v-if="isLoading" variant="calendarDay" :rows="6" />
        <CalendarDaily
          v-else-if="view === 'daily'"
          :tasks="projectedTasks"
          :date="cursor"
          @select-task="openEdit"
          @create-at="openCreate"
        />
        <CalendarWeekly
          v-else-if="view === 'weekly'"
          :tasks="projectedTasks"
          :date="cursor"
          @select-task="openEdit"
          @create-at="openCreate"
        />
        <CalendarMonthly
          v-else
          :tasks="projectedTasks"
          :date="cursor"
          @select-task="openEdit"
          @create-at="openCreate"
        />
      </section>

      <aside
        class="border-l border-slate-200 bg-white overflow-y-auto scrollbar-thin"
      >
        <div class="p-4 border-b border-slate-100">
          <h2 class="text-sm font-semibold text-slate-800">Up next</h2>
          <p class="text-[11px] text-slate-500">
            Open tasks · priority then next block
          </p>
        </div>
        <SkeletonList v-if="isLoading" variant="row" :rows="3" />
        <ul v-else class="divide-y divide-slate-100">
          <li
            v-for="t in upcoming"
            :key="t.id"
            class="p-4 hover:bg-slate-50 cursor-pointer"
            @click="openEdit(t)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex items-center gap-2">
                <span
                  class="w-2 h-2 rounded-full shrink-0"
                  :class="colorOfTask(t).solid"
                  :title="findEpic(t.epicId)?.title ?? 'Standalone'"
                />
                <p class="text-sm font-medium text-slate-900 truncate">
                  {{ t.title }}
                </p>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <TaskTimerButton :task="t" />
                <StatusPill :task="t" />
              </div>
            </div>
            <p
              v-if="findEpic(t.epicId)"
              class="mt-0.5 text-[11px] text-slate-500 truncate ml-4"
            >
              {{ findEpic(t.epicId)?.title }}
            </p>
            <div class="mt-1 ml-4 flex items-center gap-2 text-[11px] text-slate-500 tabular-nums flex-wrap">
              <span
                v-if="t.priority !== undefined && t.priority !== TaskPriority.Normal"
                class="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide"
                :class="PRIORITY_BADGE[t.priority]"
              >
                {{ PRIORITY_LABELS[t.priority] }}
              </span>
              <span v-if="t.timeBlocks?.[0]">
                Next
                {{ dayjs(t.timeBlocks[0].start).format("MMM D") }}
                {{ formatTime(dayjs(t.timeBlocks[0].start)) }}
              </span>
              <span v-else-if="t.dueDate">
                Due {{ dayjs(t.dueDate).format("MMM D") }}
              </span>
              <span v-if="t.estimatedHours !== undefined">
                · {{ (t.spentHours ?? 0) }}h /
                {{ t.estimatedHours }}h
              </span>
              <span
                v-if="t.checklist && t.checklist.length"
                class="inline-flex items-center gap-0.5"
                :title="`${t.checklist.filter((c) => c.done).length} of ${t.checklist.length} checklist items done`"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  class="w-3 h-3"
                >
                  <polyline points="20 6 9 17 4 12" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                {{ t.checklist.filter((c) => c.done).length }}/{{ t.checklist.length }}
              </span>
            </div>
            <div
              v-if="t.progress !== undefined"
              class="mt-2 ml-4 h-1 rounded-full bg-slate-100 overflow-hidden"
            >
              <div
                class="h-full"
                :class="colorOfTask(t).solid"
                :style="{ width: t.progress + '%' }"
              />
            </div>
          </li>
          <li
            v-if="upcoming.length === 0"
            class="p-6 text-center text-xs text-slate-400 italic"
          >
            All clear — nothing scheduled.
          </li>
        </ul>
      </aside>
    </div>

    <TaskModal
      :open="taskModalOpen"
      :task="editingTask"
      :default-date="defaultStart"
      @close="taskModalOpen = false"
      @saved="taskModalOpen = false"
      @deleted="taskModalOpen = false"
    />
  </div>
</template>
