import dayjs from "dayjs";
import type { Ref } from "vue";
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

export interface TaskModalFormShape {
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

const emptyForm: TaskModalFormShape = {
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

export function useTaskModalForm(options: {
  open: Ref<boolean>;
  task: Ref<Task | null | undefined>;
  defaultDate: Ref<string | undefined>;
  defaultEpicId: Ref<string | undefined>;
  onSaved: (task: Task) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { saveTask, deleteTask } = useTasks();
  const { pushToast } = useToasts();

  const form = ref<TaskModalFormShape>({ ...emptyForm });
  const submitting = ref(false);
  const justSaved = ref(false);
  const errorMsg = ref<string | null>(null);
  const baseline = ref("");
  const deleteConfirmOpen = ref(false);

  function snapshotForm() {
    baseline.value = JSON.stringify(form.value);
  }

  function isDirty() {
    return JSON.stringify(form.value) !== baseline.value;
  }

  function loadFromTask(task?: Task | null) {
    if (!task) {
      const seedBlock = defaultBlockFromIso(options.defaultDate.value);
      form.value = {
        ...emptyForm,
        epicId: options.defaultEpicId.value ?? "",
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
    () => [
      options.open.value,
      options.task.value,
      options.defaultDate.value,
      options.defaultEpicId.value,
    ],
    () => {
      if (options.open.value) {
        loadFromTask(options.task.value);
        errorMsg.value = null;
        justSaved.value = false;
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
      options.onSaved(saved);
      setTimeout(() => {
        options.onClose();
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
      options.onDeleted(id);
      options.onClose();
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

  return {
    form,
    submitting,
    justSaved,
    errorMsg,
    deleteConfirmOpen,
    totalSpent,
    isDirty,
    onSubmit,
    requestDelete,
    onDelete,
  };
}
