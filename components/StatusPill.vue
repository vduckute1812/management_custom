<script setup lang="ts">
import {
  STATUS_COLORS,
  STATUS_I18N_KEYS,
  TaskStatus,
  type Task,
} from "~/types/task";

const props = withDefaults(
  defineProps<{
    task: Task;
    /** When false, render a non-interactive label. */
    editable?: boolean;
  }>(),
  { editable: true }
);

const emit = defineEmits<{
  (e: "updated", task: Task): void;
}>();

const { t } = useI18n();
const { saveTask } = useTasks();
const { pushToast } = useToasts();
const updating = ref(false);

async function onChange(e: Event) {
  // <select> always yields strings; coerce back to the numeric enum.
  const select = e.target as HTMLSelectElement;
  const raw = select.value;
  const next = Number(raw) as TaskStatus;
  if (next === props.task.status) return;
  updating.value = true;
  try {
    const saved = await saveTask({ ...props.task, status: next });
    emit("updated", saved);
  } catch (err: unknown) {
    // Re-bind from prop value; surface the failure so it isn't silent.
    select.value = String(props.task.status);
    pushToast(
      err instanceof Error ? err.message : t("toasts.couldNotUpdateStatus"),
      { tone: "danger" }
    );
  } finally {
    updating.value = false;
  }
}
</script>

<template>
  <select
    v-if="editable"
    :value="task.status"
    :disabled="updating"
    :class="[
      'text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 cursor-pointer border-0 outline-none focus-visible:ring-2 focus-visible:ring-brand-300 appearance-none',
      STATUS_COLORS[task.status],
    ]"
    :aria-label="$t('tasks.statusPill.changeAria')"
    :title="$t('tasks.statusPill.changeTitle')"
    @change="onChange"
    @click.stop
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
  <span
    v-else
    class="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
    :class="STATUS_COLORS[task.status]"
  >
    {{ $t(STATUS_I18N_KEYS[task.status]) }}
  </span>
</template>
