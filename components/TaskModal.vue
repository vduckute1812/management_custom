<script setup lang="ts">
import dayjs from "dayjs";
import { newClientId } from "~/utils/clientId";
import {
  RecurrenceRule,
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
const rootEl = ref<HTMLElement | null>(null);
const discardKeepBtn = ref<HTMLButtonElement | null>(null);
const basics = ref<{ titleInputEl: () => HTMLInputElement | null } | null>(
  null,
);
const fid = useId();
const fieldIds = {
  title: `${fid}-title`,
  epic: `${fid}-epic`,
  priority: `${fid}-priority`,
  notes: `${fid}-notes`,
  status: `${fid}-status`,
  dueDate: `${fid}-due`,
  estimated: `${fid}-est`,
  progress: `${fid}-progress`,
  tags: `${fid}-tags`,
  checklistAdd: `${fid}-check-add`,
  recurs: `${fid}-recurs`,
};

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
  }
}

function handleModalEscape() {
  if (deleteConfirmOpen.value) {
    deleteConfirmOpen.value = false;
  } else if (discardConfirmOpen.value) {
    discardConfirmOpen.value = false;
  } else {
    requestClose();
  }
}

const isOpen = computed(() => props.open);
useModal(isOpen, {
  container: rootEl,
  initialFocus: () =>
    discardConfirmOpen.value
      ? (discardKeepBtn.value ?? basics.value?.titleInputEl() ?? null)
      : (basics.value?.titleInputEl() ?? null),
  onClose: handleModalEscape,
});

watch(discardConfirmOpen, (open) => {
  if (open) nextTick(() => discardKeepBtn.value?.focus());
});
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        ref="rootEl"
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
          <div :inert="discardConfirmOpen">
            <TaskModalHeader
              :task="task"
              :task-id="form.id"
              @close="requestClose"
            />

            <form
              class="flex-1 overflow-y-auto scrollbar-thin px-6 py-5 space-y-5"
              @submit.prevent="onSubmit"
            >
              <TaskModalBasics
                ref="basics"
                v-model="form"
                :epics="epics"
                :field-ids="fieldIds"
                :total-spent="totalSpent"
              />

              <TaskModalChecklist
                v-model="form.checklist"
                :add-input-id="fieldIds.checklistAdd"
              />

              <TaskModalSchedule
                v-model="form"
                :recurs-input-id="fieldIds.recurs"
              />

              <p
                v-if="errorMsg"
                class="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"
              >
                {{ errorMsg }}
              </p>
            </form>

            <TaskModalFooter
              :task-id="form.id"
              :submitting="submitting"
              :just-saved="justSaved"
              @cancel="requestClose"
              @delete="requestDelete"
              @save="onSubmit"
            />
          </div>

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
                  ref="discardKeepBtn"
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
