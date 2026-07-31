<script setup lang="ts">
import dayjs from "dayjs";
import { newClientId } from "~/utils/clientId";
import {
  PRIORITY_I18N_KEYS,
  RECURRENCE_I18N_KEYS,
  RecurrenceRule,
  STATUS_I18N_KEYS,
  TaskPriority,
  TaskStatus,
  type ChecklistItem,
  type Recurrence,
  type Task,
  type TimeBlock,
} from "~/types/task";

const props = defineProps<{
  open: boolean;
  task?: Task | null;
  defaultDate?: string;
  defaultEpicId?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "saved", task: Task): void;
  (e: "deleted", id: string): void;
}>();

const { t } = useI18n();
const { saveTask, deleteTask } = useTasks();
const { epics } = useEpics();
const { pushToast } = useToasts();

interface FormShape {
  id?: string;
  epicId: string;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  estimatedHours: string;
  progress: number;
  tags: string;
  timeBlocks: TimeBlock[];
  checklist: ChecklistItem[];
  recurs: boolean;
  recurrenceRule: RecurrenceRule;
  recurrenceInterval: number;
  recurrenceUntil: string;
}

const empty: FormShape = {
  epicId: "",
  title: "",
  notes: "",
  status: TaskStatus.Todo,
  priority: TaskPriority.Normal,
  dueDate: "",
  estimatedHours: "",
  progress: 0,
  tags: "",
  timeBlocks: [],
  checklist: [],
  recurs: false,
  recurrenceRule: RecurrenceRule.Weekly,
  recurrenceInterval: 1,
  recurrenceUntil: "",
};

const form = ref<FormShape>({ ...empty });
const submitting = ref(false);
const justSaved = ref(false);
const errorMsg = ref<string | null>(null);
const baseline = ref("");
const discardConfirmOpen = ref(false);
const deleteConfirmOpen = ref(false);

function describeRecurrenceLabel(r?: Recurrence | null): string {
  if (!r) return t("common.doesNotRepeat");
  const unit = t(RECURRENCE_I18N_KEYS[r.rule]);
  const head =
    r.interval <= 1
      ? t("common.everyUnit", { unit })
      : t("common.everyInterval", { count: r.interval, unit });
  return r.until ? `${head}${t("common.untilDate", { date: r.until })}` : head;
}

function snapshotForm() {
  baseline.value = JSON.stringify(form.value);
}

function isDirty() {
  return JSON.stringify(form.value) !== baseline.value;
}

function defaultBlockFromIso(iso?: string): TimeBlock | null {
  if (!iso) return null;
  const start = dayjs(iso);
  if (!start.isValid()) return null;
  const end = start.add(1, "hour");
  return {
    id: newClientId("block"),
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function loadFromTask(task?: Task | null) {
  if (!task) {
    const seedBlock = defaultBlockFromIso(props.defaultDate);
    form.value = {
      ...empty,
      epicId: props.defaultEpicId ?? "",
      timeBlocks: seedBlock ? [seedBlock] : [],
    };
    return;
  }
  const r = task.recurrence;
  form.value = {
    id: task.id,
    epicId: task.epicId ?? "",
    title: task.title,
    notes: task.notes ?? "",
    status: task.status,
    priority: task.priority ?? TaskPriority.Normal,
    dueDate: task.dueDate ?? "",
    estimatedHours:
      task.estimatedHours !== undefined ? String(task.estimatedHours) : "",
    progress: task.progress ?? 0,
    tags: (task.tags ?? []).join(", "),
    // Strip transient projection flag if a parent passed an expanded task in.
    timeBlocks: (task.timeBlocks ?? [])
      .filter((b) => !b.projected)
      .map((b) => ({ ...b })),
    checklist: (task.checklist ?? []).map((c) => ({ ...c })),
    recurs: !!r,
    recurrenceRule: r?.rule ?? RecurrenceRule.Weekly,
    recurrenceInterval: r?.interval ?? 1,
    recurrenceUntil: r?.until ?? "",
  };
}

const recurrenceSummary = computed(() => {
  if (!form.value.recurs) return null;
  const r: Recurrence = {
    rule: form.value.recurrenceRule,
    interval: Math.max(1, Math.round(form.value.recurrenceInterval)),
  };
  if (form.value.recurrenceUntil) r.until = form.value.recurrenceUntil;
  return describeRecurrenceLabel(r);
});

const hasSeedBlocks = computed(() => form.value.timeBlocks.length > 0);

// --- Checklist helpers -----------------------------------------------------
const newChecklistItem = ref("");

function addChecklistItem() {
  const text = newChecklistItem.value.trim();
  if (!text) return;
  form.value.checklist.push({
    id: newClientId("chk"),
    text,
    done: false,
  });
  newChecklistItem.value = "";
}

function toggleChecklistItem(index: number) {
  const item = form.value.checklist[index];
  if (item) item.done = !item.done;
}

function removeChecklistItem(index: number) {
  form.value.checklist.splice(index, 1);
}

const checklistSummary = computed(() => {
  const total = form.value.checklist.length;
  if (total === 0) return null;
  const done = form.value.checklist.filter((c) => c.done).length;
  return { done, total, percent: Math.round((done / total) * 100) };
});

watch(
  () => [props.open, props.task, props.defaultDate, props.defaultEpicId],
  () => {
    if (props.open) {
      loadFromTask(props.task);
      errorMsg.value = null;
      justSaved.value = false;
      discardConfirmOpen.value = false;
      deleteConfirmOpen.value = false;
      nextTick(() => snapshotForm());
    }
  },
  { immediate: true },
);

const totalSpent = computed(() => {
  const sum = form.value.timeBlocks.reduce(
    (acc, b) => acc + (typeof b.spentHours === "number" ? b.spentHours : 0),
    0,
  );
  return Math.round(sum * 100) / 100;
});

async function onSubmit() {
  if (!form.value.title.trim()) {
    errorMsg.value = t("tasks.modal.titleRequired");
    return;
  }
  submitting.value = true;
  errorMsg.value = null;
  try {
    let recurrence: Recurrence | null;
    if (form.value.recurs) {
      const interval = Math.max(
        1,
        Math.round(Number(form.value.recurrenceInterval) || 1),
      );
      recurrence = {
        rule: form.value.recurrenceRule,
        interval,
        ...(form.value.recurrenceUntil
          ? { until: form.value.recurrenceUntil }
          : {}),
      };
    } else {
      // Explicit null tells the server to clear an existing rule.
      recurrence = null;
    }

    const payload = {
      id: form.value.id,
      epicId: form.value.epicId || undefined,
      title: form.value.title.trim(),
      notes: form.value.notes,
      status: form.value.status,
      priority: form.value.priority,
      dueDate: form.value.dueDate || undefined,
      estimatedHours: form.value.estimatedHours
        ? Number(form.value.estimatedHours)
        : undefined,
      progress: Number(form.value.progress),
      tags: form.value.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      timeBlocks: form.value.timeBlocks,
      checklist: form.value.checklist,
      recurrence,
    };
    const saved = await saveTask(payload);
    justSaved.value = true;
    emit("saved", saved);
    setTimeout(() => {
      emit("close");
      justSaved.value = false;
    }, 320);
  } catch (err: unknown) {
    errorMsg.value =
      err instanceof Error ? err.message : t("tasks.modal.failedToSave");
  } finally {
    submitting.value = false;
  }
}

function requestDelete() {
  if (!form.value.id || submitting.value) return;
  deleteConfirmOpen.value = true;
}

async function onDelete() {
  if (!form.value.id) return;
  const id = form.value.id;
  const titleSnapshot = form.value.title || "task";
  submitting.value = true;
  try {
    const removed = await deleteTask(id);
    deleteConfirmOpen.value = false;
    emit("deleted", id);
    emit("close");
    if (removed) {
      pushToast(t("toasts.deletedTask", { title: titleSnapshot }), {
        tone: "info",
        duration: 6000,
        actionLabel: t("toasts.undo"),
        onAction: async () => {
          try {
            await saveTask(removed);
            pushToast(t("toasts.restored"), {
              tone: "success",
              duration: 2000,
            });
          } catch {
            pushToast(t("toasts.couldNotRestore"), { tone: "danger" });
          }
        },
      });
    } else {
      pushToast(t("toasts.deletedTask", { title: titleSnapshot }), {
        tone: "info",
        duration: 3000,
      });
    }
  } catch (err: unknown) {
    errorMsg.value =
      err instanceof Error ? err.message : t("tasks.modal.failedToDelete");
  } finally {
    submitting.value = false;
  }
}

function requestClose() {
  if (submitting.value) return;
  if (justSaved.value || !isDirty()) {
    emit("close");
    return;
  }
  discardConfirmOpen.value = true;
}

function confirmDiscard() {
  discardConfirmOpen.value = false;
  emit("close");
}

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) requestClose();
}

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    onSubmit();
  } else if (e.key === "Escape") {
    e.preventDefault();
    if (deleteConfirmOpen.value) {
      deleteConfirmOpen.value = false;
    } else if (discardConfirmOpen.value) {
      discardConfirmOpen.value = false;
    } else {
      requestClose();
    }
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
        @mousedown="onBackdrop"
        @keydown="onKeydown"
      >
        <div
          class="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl ring-1 ring-slate-200 max-h-[90vh] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-modal-title"
        >
          <header
            class="flex items-center justify-between px-6 py-4 border-b border-slate-200 gap-3"
          >
            <h2
              id="task-modal-title"
              class="text-lg font-semibold text-slate-900 min-w-0 truncate"
            >
              {{
                form.id ? $t("tasks.modal.editTask") : $t("tasks.modal.newTask")
              }}
            </h2>
            <div class="flex items-center gap-2 shrink-0">
              <TaskTimerButton v-if="task && form.id" :task="task" size="md" />
              <button
                type="button"
                class="text-slate-400 hover:text-slate-700 transition"
                :aria-label="$t('tasks.modal.close')"
                @click="requestClose"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  class="w-5 h-5"
                >
                  <path d="M6 6l12 12M6 18L18 6" stroke-linecap="round" />
                </svg>
              </button>
            </div>
          </header>

          <form
            class="flex-1 overflow-y-auto scrollbar-thin px-6 py-5 space-y-5"
            @submit.prevent="onSubmit"
          >
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">
                {{ $t("tasks.modal.title") }}
              </label>
              <input
                v-model="form.title"
                type="text"
                required
                :placeholder="$t('tasks.modal.titlePlaceholder')"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
              />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">
                  {{ $t("tasks.modal.epicOptional") }}
                </label>
                <select
                  v-model="form.epicId"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none bg-white"
                >
                  <option value="">
                    {{ $t("tasks.modal.standaloneTask") }}
                  </option>
                  <option v-for="epic in epics" :key="epic.id" :value="epic.id">
                    {{ epic.title }}
                  </option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">
                  {{ $t("tasks.modal.priority") }}
                </label>
                <select
                  v-model.number="form.priority"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none bg-white"
                >
                  <option :value="TaskPriority.High">
                    {{ $t(PRIORITY_I18N_KEYS[TaskPriority.High]) }}
                  </option>
                  <option :value="TaskPriority.Normal">
                    {{ $t(PRIORITY_I18N_KEYS[TaskPriority.Normal]) }}
                  </option>
                  <option :value="TaskPriority.Low">
                    {{ $t(PRIORITY_I18N_KEYS[TaskPriority.Low]) }}
                  </option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">
                {{ $t("tasks.modal.notes") }}
              </label>
              <textarea
                v-model="form.notes"
                rows="3"
                :placeholder="$t('tasks.modal.notesPlaceholder')"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none resize-y"
              />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">
                  {{ $t("tasks.modal.status") }}
                </label>
                <select
                  v-model.number="form.status"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none bg-white"
                >
                  <option :value="TaskStatus.Todo">
                    {{ $t(STATUS_I18N_KEYS[TaskStatus.Todo]) }}
                  </option>
                  <option :value="TaskStatus.InProgress">
                    {{ $t(STATUS_I18N_KEYS[TaskStatus.InProgress]) }}
                  </option>
                  <option :value="TaskStatus.Done">
                    {{ $t(STATUS_I18N_KEYS[TaskStatus.Done]) }}
                  </option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">
                  {{ $t("tasks.modal.dueDate") }}
                </label>
                <input
                  v-model="form.dueDate"
                  type="date"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">
                  {{ $t("tasks.modal.estimatedHours") }}
                </label>
                <input
                  v-model="form.estimatedHours"
                  type="number"
                  min="0"
                  step="0.25"
                  :placeholder="$t('tasks.modal.estimatedPlaceholder')"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">
                  {{ $t("tasks.modal.hoursSpentDerived") }}
                </label>
                <div
                  class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 tabular-nums flex items-center justify-between"
                >
                  <span>{{ totalSpent }}h</span>
                  <span class="text-[10px] text-slate-400 uppercase">
                    {{ $t("tasks.modal.sumOfBlocks") }}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label
                class="flex items-center justify-between text-xs font-medium text-slate-600 mb-1"
              >
                <span>{{ $t("tasks.modal.progress") }}</span>
                <span class="text-slate-500">{{ form.progress }}%</span>
              </label>
              <input
                v-model.number="form.progress"
                type="range"
                min="0"
                max="100"
                step="5"
                class="w-full accent-brand-600"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">
                {{ $t("tasks.modal.tags") }}
              </label>
              <input
                v-model="form.tags"
                type="text"
                :placeholder="$t('tasks.modal.tagsPlaceholder')"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
              />
            </div>

            <div>
              <div class="flex items-center justify-between mb-2">
                <label class="text-xs font-medium text-slate-600">
                  {{ $t("tasks.modal.checklist") }}
                </label>
                <p
                  v-if="checklistSummary"
                  class="text-[11px] text-slate-500 tabular-nums"
                >
                  {{
                    $t("tasks.modal.checklistSummary", {
                      done: checklistSummary.done,
                      total: checklistSummary.total,
                      percent: checklistSummary.percent,
                    })
                  }}
                </p>
                <p v-else class="text-[11px] text-slate-500">
                  {{ $t("tasks.modal.checklistHint") }}
                </p>
              </div>

              <ul
                v-if="form.checklist.length"
                class="rounded-lg border border-slate-200 divide-y divide-slate-100 mb-2 overflow-hidden"
              >
                <li
                  v-for="(item, idx) in form.checklist"
                  :key="item.id"
                  class="flex items-center gap-2 px-3 py-1.5 group hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    :checked="item.done"
                    class="accent-brand-600 w-4 h-4 shrink-0"
                    :aria-label="
                      $t('tasks.modal.toggleItem', { text: item.text })
                    "
                    @change="toggleChecklistItem(idx)"
                  />
                  <input
                    v-model="item.text"
                    type="text"
                    class="flex-1 bg-transparent text-sm outline-none border-none px-0 py-0"
                    :class="
                      item.done
                        ? 'line-through text-slate-400'
                        : 'text-slate-800'
                    "
                  />
                  <button
                    type="button"
                    class="text-slate-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    :aria-label="
                      $t('tasks.modal.removeItem', { text: item.text })
                    "
                    @click="removeChecklistItem(idx)"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      class="w-3.5 h-3.5"
                    >
                      <path d="M6 6l12 12M6 18L18 6" stroke-linecap="round" />
                    </svg>
                  </button>
                </li>
              </ul>

              <div class="flex items-center gap-2">
                <input
                  v-model="newChecklistItem"
                  type="text"
                  :placeholder="$t('tasks.modal.addSubStep')"
                  class="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
                  @keydown.enter.prevent="addChecklistItem"
                />
                <button
                  type="button"
                  class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition disabled:opacity-50"
                  :disabled="!newChecklistItem.trim()"
                  @click="addChecklistItem"
                >
                  {{ $t("tasks.modal.add") }}
                </button>
              </div>
            </div>

            <div>
              <div class="flex items-center justify-between mb-2">
                <label class="text-xs font-medium text-slate-600">
                  {{ $t("tasks.modal.timeBlocks") }}
                </label>
                <p class="text-[11px] text-slate-500">
                  {{ $t("tasks.modal.timeBlocksHint") }}
                </p>
              </div>
              <TimeBlockEditor v-model="form.timeBlocks" />
            </div>

            <div class="rounded-lg ring-1 ring-slate-200 bg-slate-50/60 p-3">
              <label class="flex items-start gap-2 cursor-pointer">
                <input
                  v-model="form.recurs"
                  type="checkbox"
                  class="mt-0.5 accent-brand-600 w-4 h-4 shrink-0"
                />
                <div class="min-w-0">
                  <div class="text-xs font-medium text-slate-700">
                    {{ $t("tasks.modal.repeat") }}
                  </div>
                  <p class="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    {{ $t("tasks.modal.repeatHint") }}
                  </p>
                </div>
              </label>

              <div v-if="form.recurs" class="mt-3 space-y-3 pl-6">
                <div
                  v-if="!hasSeedBlocks"
                  class="text-[11px] text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded-md px-2.5 py-1.5"
                >
                  {{ $t("tasks.modal.needSeedBlock") }}
                </div>

                <div class="flex items-center gap-2 flex-wrap text-xs">
                  <span class="text-slate-600">{{
                    $t("tasks.modal.every")
                  }}</span>
                  <input
                    v-model.number="form.recurrenceInterval"
                    type="number"
                    min="1"
                    max="365"
                    step="1"
                    class="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs tabular-nums focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
                  />
                  <select
                    v-model.number="form.recurrenceRule"
                    class="rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none bg-white"
                  >
                    <option :value="RecurrenceRule.Daily">
                      {{ $t(RECURRENCE_I18N_KEYS[RecurrenceRule.Daily]) }}
                    </option>
                    <option :value="RecurrenceRule.Weekly">
                      {{ $t(RECURRENCE_I18N_KEYS[RecurrenceRule.Weekly]) }}
                    </option>
                    <option :value="RecurrenceRule.Monthly">
                      {{ $t(RECURRENCE_I18N_KEYS[RecurrenceRule.Monthly]) }}
                    </option>
                  </select>
                  <span class="text-slate-500">{{
                    $t("tasks.modal.until")
                  }}</span>
                  <input
                    v-model="form.recurrenceUntil"
                    type="date"
                    class="rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
                  />
                  <button
                    v-if="form.recurrenceUntil"
                    type="button"
                    class="text-[11px] text-slate-500 hover:text-slate-700 underline"
                    @click="form.recurrenceUntil = ''"
                  >
                    {{ $t("tasks.modal.noEnd") }}
                  </button>
                </div>

                <p v-if="recurrenceSummary" class="text-[11px] text-slate-500">
                  {{ recurrenceSummary }}
                </p>
              </div>
            </div>

            <p
              v-if="errorMsg"
              class="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"
            >
              {{ errorMsg }}
            </p>
          </form>

          <footer
            class="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl"
          >
            <button
              v-if="form.id"
              type="button"
              :disabled="submitting"
              class="text-sm font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"
              @click="requestDelete"
            >
              {{ $t("tasks.modal.delete") }}
            </button>
            <span v-else class="text-[11px] text-slate-400">
              <kbd class="px-1.5 py-0.5 bg-slate-100 rounded font-mono">⌘</kbd>
              <kbd class="px-1.5 py-0.5 bg-slate-100 rounded font-mono ml-1"
                >↵</kbd
              >
              {{ $t("tasks.modal.toSave") }}
            </span>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition"
                @click="requestClose"
              >
                {{ $t("tasks.modal.cancel") }}
              </button>
              <button
                type="button"
                :disabled="submitting"
                class="px-4 py-2 text-sm font-medium bg-brand-600 hover:bg-brand-700 text-white rounded-lg shadow-sm disabled:opacity-50 inline-flex items-center gap-2"
                @click="onSubmit"
              >
                <svg
                  v-if="justSaved"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  class="w-4 h-4"
                >
                  <polyline
                    points="20 6 9 17 4 12"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                {{
                  justSaved
                    ? $t("tasks.modal.saved")
                    : submitting
                      ? $t("tasks.modal.saving")
                      : form.id
                        ? $t("tasks.modal.saveChanges")
                        : $t("tasks.modal.createTask")
                }}
              </button>
            </div>
          </footer>

          <div
            v-if="discardConfirmOpen"
            class="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/40 rounded-2xl p-4"
            role="alertdialog"
            aria-labelledby="task-discard-title"
            aria-describedby="task-discard-desc"
          >
            <div
              class="bg-white rounded-xl shadow-xl ring-1 ring-slate-200 p-5 max-w-sm w-full"
            >
              <h3
                id="task-discard-title"
                class="text-sm font-semibold text-slate-900"
              >
                {{ $t("tasks.modal.discardTitle") }}
              </h3>
              <p id="task-discard-desc" class="mt-1 text-xs text-slate-500">
                {{ $t("tasks.modal.discardBody") }}
              </p>
              <div class="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                  @click="discardConfirmOpen = false"
                >
                  {{ $t("tasks.modal.keepEditing") }}
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg"
                  @click="confirmDiscard"
                >
                  {{ $t("tasks.modal.discard") }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <ConfirmDialog
    :open="deleteConfirmOpen"
    :title="$t('tasks.modal.deleteConfirmTitle')"
    :description="$t('tasks.modal.deleteConfirm')"
    :busy="submitting"
    @cancel="deleteConfirmOpen = false"
    @confirm="onDelete"
  />
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
