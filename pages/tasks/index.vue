<script setup lang="ts">
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import {
  PRIORITY_RANK,
  TaskPriority,
  TaskStatus,
  type CalendarView,
  type Task,
} from "~/types/task";
import { isAppLocale } from "~/types/locale";
import { formatCalendarHeader } from "~/utils/formatCalendarHeader";

dayjs.extend(isoWeek);

const { t } = useI18n();
const {
  tasks,
  nextCursor,
  fetchAll,
  loadMore,
  isLoading,
  isLoadingMore,
  error,
  findTask,
} = useTasks();
const { epics, fetchAll: fetchEpics } = useEpics();
const { quickCaptureOpen, focusTaskId, clearFocusTask, pendingCreateTask } =
  useUiOverlays();
const { pushToast } = useToasts();
const { load: loadSamples } = useSampleData();
const { settings, startOfWeek } = useSettings();
const { withProjections } = useRecurrence();

const TASK_DND_MIME = "application/x-mgmt-task-id";

const view = ref<CalendarView>("daily");
const cursor = ref(dayjs());
const taskModalOpen = ref(false);
const editingTask = ref<Task | null>(null);
const defaultStart = ref<string>("");
const seeding = ref(false);
const isNarrow = ref(false);

function syncViewport() {
  if (!import.meta.client) return;
  isNarrow.value = window.matchMedia("(max-width: 767px)").matches;
}

onMounted(() => {
  syncViewport();
  window.addEventListener("resize", syncViewport);
});
onBeforeUnmount(() => {
  if (import.meta.client) {
    window.removeEventListener("resize", syncViewport);
  }
});

watch(isNarrow, (narrow) => {
  if (narrow && view.value !== "daily") {
    view.value = "daily";
  }
});

await useAsyncData("dashboard:initial", async () => {
  await Promise.all([
    fetchAll({ include: ["blocks", "checklists"] }),
    fetchEpics(),
  ]);
  return { ok: true };
});

useSeoMeta({
  title: () => t("seo.dashboard"),
  description: () => t("seo.dashboardDescription"),
});

// External "open this task" requests (notification toasts, command palette).
watch(
  [focusTaskId, tasks],
  ([id]) => {
    if (!id) return;
    const task = findTask(id);
    if (!task) return;
    const nextBlock = task.timeBlocks?.[0]?.start;
    if (nextBlock && dayjs(nextBlock).isValid()) {
      cursor.value = dayjs(nextBlock);
      view.value = "daily";
    }
    editingTask.value = task;
    taskModalOpen.value = true;
    clearFocusTask();
  },
  { immediate: true },
);

watch(
  pendingCreateTask,
  (pending) => {
    if (!pending) return;
    openCreate();
    pendingCreateTask.value = false;
  },
  { immediate: true },
);

const headerLabel = computed(() => {
  const locale = isAppLocale(settings.value.locale)
    ? settings.value.locale
    : "en";
  return formatCalendarHeader(cursor.value, view.value, locale, startOfWeek);
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
  withProjections(
    tasks.value,
    projectionWindow.value.start,
    projectionWindow.value.end,
  ),
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
    pushToast(t("toasts.sampleDataLoadedExplore"), { tone: "success" });
  } catch (err) {
    pushToast(
      err instanceof Error ? err.message : t("toasts.failedToLoadSamples"),
      { tone: "danger" },
    );
  } finally {
    seeding.value = false;
  }
}

function setView(next: CalendarView) {
  if (isNarrow.value && next !== "daily") {
    pushToast(t("toasts.weeklyMonthlyDesktopOnly"), {
      tone: "info",
      duration: 2800,
    });
    return;
  }
  view.value = next;
}

usePageShortcuts([
  { key: "1", handler: () => setView("daily") },
  { key: "2", handler: () => setView("weekly") },
  { key: "3", handler: () => setView("monthly") },
  { key: "t", handler: jumpToday },
  { key: "ArrowLeft", handler: () => step(-1) },
  { key: "ArrowRight", handler: () => step(1) },
]);

function onUpNextDragStart(e: DragEvent, task: Task) {
  if (!e.dataTransfer) return;
  e.dataTransfer.setData(TASK_DND_MIME, task.id);
  e.dataTransfer.setData("text/plain", task.id);
  e.dataTransfer.effectAllowed = "move";
}

const upcoming = computed<Task[]>(() => {
  return [...tasks.value]
    .filter((task) => task.status !== TaskStatus.Done)
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
  const done = tasks.value.filter(
    (task) => task.status === TaskStatus.Done,
  ).length;
  const inProgress = tasks.value.filter(
    (task) => task.status === TaskStatus.InProgress,
  ).length;
  return { total, done, inProgress };
});

const isEmpty = computed(
  () =>
    !isLoading.value && tasks.value.length === 0 && epics.value.length === 0,
);
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <TasksCalendarHeader
      :header-label="headerLabel"
      :view="view"
      :is-narrow="isNarrow"
      :stats="stats"
      :epic-count="epics.length"
      @set-view="setView"
      @step="step"
      @today="jumpToday"
      @quick-capture="quickCaptureOpen = true"
    />

    <div v-if="error" class="px-6 py-2 border-b border-rose-200">
      <InlineErrorAlert
        :message="error"
        :retry-label="$t('common.retry')"
        @retry="fetchAll()"
      />
    </div>

    <!-- Empty state takes over the whole canvas on first run. -->
    <div v-if="isEmpty" class="flex-1 flex items-center justify-center p-6">
      <EmptyState
        :title="$t('empty.planFirstDay')"
        :description="$t('empty.planFirstDayDesc')"
        illustration="calendar"
        :primary-label="$t('empty.quickCapture')"
        primary-shortcut="n"
        :secondary-label="$t('empty.loadSampleData')"
        :secondary-loading="seeding"
        @primary="quickCaptureOpen = true"
        @secondary="seedSamples"
      />
    </div>

    <div
      v-else
      class="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_300px]"
    >
      <section class="min-h-0 overflow-hidden min-h-[50vh] lg:min-h-0">
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

      <TasksUpNextAside
        :upcoming="upcoming"
        :is-loading="isLoading"
        :next-cursor="nextCursor"
        :is-loading-more="isLoadingMore"
        @select="openEdit"
        @load-more="loadMore"
        @drag-start="onUpNextDragStart"
      />
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
