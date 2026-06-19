<script setup lang="ts">
import {
  STATUS_COLORS,
  STATUS_LABELS,
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

const { saveTask } = useTasks();
const updating = ref(false);

async function onChange(e: Event) {
  // <select> always yields strings; coerce back to the numeric enum.
  const raw = (e.target as HTMLSelectElement).value;
  const next = Number(raw) as TaskStatus;
  if (next === props.task.status) return;
  updating.value = true;
  try {
    const saved = await saveTask({ ...props.task, status: next });
    emit("updated", saved);
  } catch {
    // Reset on failure — re-bind from prop value happens automatically.
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
    aria-label="Change task status"
    title="Change status"
    @change="onChange"
    @click.stop
  >
    <option :value="TaskStatus.Todo">To do</option>
    <option :value="TaskStatus.InProgress">In progress</option>
    <option :value="TaskStatus.Done">Done</option>
  </select>
  <span
    v-else
    class="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
    :class="STATUS_COLORS[task.status]"
  >
    {{ STATUS_LABELS[task.status] }}
  </span>
</template>
