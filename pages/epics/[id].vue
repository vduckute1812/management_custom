<script setup lang="ts">
import dayjs from "dayjs";
import {
  epicColorOf,
  PRIORITY_BADGE,
  PRIORITY_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  TaskPriority,
  type Task,
} from "~/types/task";

const route = useRoute();
const router = useRouter();
const epicId = computed(() => String(route.params.id));

const { epics, fetchAll: fetchEpics, findEpic } = useEpics();
const { tasks, fetchAll: fetchTasks, tasksForEpic } = useTasks();

const editEpicOpen = ref(false);
const taskModalOpen = ref(false);
const editingTask = ref<Task | null>(null);

await useAsyncData(`epic:${epicId.value}`, async () => {
  await Promise.all([fetchEpics(), fetchTasks()]);
  return { ok: true };
});

const epic = computed(() => findEpic(epicId.value));
const accent = computed(() => epicColorOf(epic.value?.color));
const children = computed(() => tasksForEpic(epicId.value));

const totals = computed(() => {
  const e = epic.value;
  if (!e) return null;
  return {
    estimated: e.estimatedHours ?? 0,
    spent: e.spentHours ?? 0,
    variance: Math.round(((e.spentHours ?? 0) - (e.estimatedHours ?? 0)) * 10) / 10,
    progress: e.progress ?? 0,
    taskCount: e.taskCount ?? children.value.length,
  };
});

function openCreateTask() {
  editingTask.value = null;
  taskModalOpen.value = true;
}

function openEditTask(task: Task) {
  editingTask.value = task;
  taskModalOpen.value = true;
}

async function onTaskSaved() {
  taskModalOpen.value = false;
  await Promise.all([fetchTasks(), fetchEpics()]);
}

async function onTaskDeleted() {
  taskModalOpen.value = false;
  await Promise.all([fetchTasks(), fetchEpics()]);
}

async function onEpicSaved() {
  editEpicOpen.value = false;
  await fetchEpics();
}

async function onEpicDeleted() {
  editEpicOpen.value = false;
  await Promise.all([fetchEpics(), fetchTasks()]);
  router.push("/epics");
}
</script>

<template>
  <div class="flex flex-col h-screen">
    <header
      class="px-4 md:px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between gap-4 flex-wrap"
    >
      <div class="min-w-0">
        <NuxtLink
          to="/epics"
          class="text-[11px] text-slate-500 hover:text-brand-700"
        >
          ← All epics
        </NuxtLink>
        <h1
          v-if="epic"
          class="text-xl font-semibold text-slate-900 mt-0.5 flex items-center gap-2"
        >
          <span
            class="w-3 h-3 rounded-full"
            :class="accent.solid"
            aria-hidden="true"
          />
          {{ epic.title }}
          <span
            class="text-[10px] font-semibold px-1.5 py-0.5 rounded"
            :class="STATUS_COLORS[epic.status]"
          >
            {{ STATUS_LABELS[epic.status] }}
          </span>
        </h1>
        <h1 v-else class="text-xl font-semibold text-slate-900">
          Epic not found
        </h1>
        <p v-if="epic?.description" class="text-xs text-slate-500 mt-1 max-w-2xl">
          {{ epic.description }}
        </p>
      </div>

      <div v-if="epic" class="flex items-center gap-2">
        <button
          class="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg ring-1 ring-slate-200"
          @click="editEpicOpen = true"
        >
          Edit epic
        </button>
        <button
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white shadow-sm"
          @click="openCreateTask"
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
          Add task to epic
        </button>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto scrollbar-thin p-4 md:p-6 space-y-6">
      <div v-if="!epic" class="text-sm text-slate-500">
        We couldn't find that epic.
      </div>

      <template v-else-if="totals">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="bg-white ring-1 ring-slate-200 rounded-xl p-4">
            <p class="text-[11px] uppercase tracking-wide text-slate-500">
              Tasks
            </p>
            <p class="text-2xl font-semibold text-slate-900 tabular-nums mt-0.5">
              {{ totals.taskCount }}
            </p>
          </div>
          <div class="bg-white ring-1 ring-slate-200 rounded-xl p-4">
            <p class="text-[11px] uppercase tracking-wide text-slate-500">
              Progress
            </p>
            <p class="text-2xl font-semibold text-slate-900 tabular-nums mt-0.5">
              {{ totals.progress }}%
            </p>
            <div class="mt-1 h-1 rounded-full bg-slate-100 overflow-hidden">
              <div
                class="h-full"
                :class="accent.solid"
                :style="{ width: totals.progress + '%' }"
              />
            </div>
          </div>
          <div class="bg-white ring-1 ring-slate-200 rounded-xl p-4">
            <p class="text-[11px] uppercase tracking-wide text-slate-500">
              Hours
            </p>
            <p class="text-2xl font-semibold text-slate-900 tabular-nums mt-0.5">
              {{ totals.spent }}h /
              <span class="text-slate-400">{{ totals.estimated }}h</span>
            </p>
          </div>
          <div class="bg-white ring-1 ring-slate-200 rounded-xl p-4">
            <p class="text-[11px] uppercase tracking-wide text-slate-500">
              Variance
            </p>
            <p
              class="text-2xl font-semibold tabular-nums mt-0.5"
              :class="totals.variance > 0 ? 'text-rose-600' : 'text-emerald-600'"
            >
              {{ totals.variance > 0 ? "+" : "" }}{{ totals.variance }}h
            </p>
            <p
              v-if="epic.dueDate"
              class="text-[11px] text-slate-500 mt-0.5"
            >
              Due {{ dayjs(epic.dueDate).format("MMM D, YYYY") }}
            </p>
          </div>
        </div>

        <section class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm">
          <header class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 class="text-sm font-semibold text-slate-800">Child tasks</h2>
            <span class="text-[11px] text-slate-500 tabular-nums">
              {{ children.length }} total
            </span>
          </header>
          <div v-if="children.length === 0" class="px-4 py-10">
            <EmptyState
              title="No tasks in this epic yet"
              description="Add the first task to start tracking velocity for this project area."
              illustration="spark"
              primary-label="Add task"
              @primary="openCreateTask"
            />
          </div>
          <ul v-else class="divide-y divide-slate-100">
            <li
              v-for="t in children"
              :key="t.id"
              class="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer"
              @click="openEditTask(t)"
            >
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-slate-800 truncate">
                  {{ t.title }}
                </p>
                <p class="text-[11px] text-slate-500 mt-0.5 tabular-nums flex flex-wrap gap-2 items-center">
                  <StatusPill :task="t" @updated="fetchEpics" />
                  <span
                    v-if="t.priority !== undefined && t.priority !== TaskPriority.Normal"
                    class="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide"
                    :class="PRIORITY_BADGE[t.priority]"
                  >
                    {{ PRIORITY_LABELS[t.priority] }}
                  </span>
                  <span v-if="t.dueDate">Due {{ dayjs(t.dueDate).format("MMM D") }}</span>
                  <span>
                    {{ t.spentHours ?? 0 }}h /
                    {{ t.estimatedHours ?? 0 }}h
                  </span>
                  <span>{{ (t.timeBlocks?.length ?? 0) }} blocks</span>
                </p>
              </div>
              <div class="w-24 shrink-0">
                <div class="h-1 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    class="h-full"
                    :class="accent.solid"
                    :style="{ width: (t.progress ?? 0) + '%' }"
                  />
                </div>
                <p class="text-[10px] text-slate-500 text-right tabular-nums mt-0.5">
                  {{ t.progress ?? 0 }}%
                </p>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </div>

    <EpicModal
      :open="editEpicOpen"
      :epic="epic ?? null"
      @close="editEpicOpen = false"
      @saved="onEpicSaved"
      @deleted="onEpicDeleted"
    />

    <TaskModal
      :open="taskModalOpen"
      :task="editingTask"
      :default-epic-id="epicId"
      @close="taskModalOpen = false"
      @saved="onTaskSaved"
      @deleted="onTaskDeleted"
    />
  </div>
</template>
