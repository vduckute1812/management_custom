<script setup lang="ts">
import {
  PRIORITY_I18N_KEYS,
  STATUS_I18N_KEYS,
  TaskPriority,
  TaskStatus,
} from "~/types/task";

interface TaskModalBasicsModel {
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
}

interface TaskModalBasicsFieldIds {
  title: string;
  epic: string;
  priority: string;
  notes: string;
  status: string;
  dueDate: string;
  estimated: string;
  progress: string;
  tags: string;
}

defineProps<{
  epics: { id: string; title: string }[];
  fieldIds: TaskModalBasicsFieldIds;
  totalSpent: number;
}>();

const model = defineModel<TaskModalBasicsModel>({ required: true });
const titleInput = ref<HTMLInputElement | null>(null);

defineExpose({
  titleInputEl: () => titleInput.value,
});
</script>

<template>
  <div>
    <label
      class="block text-xs font-medium text-slate-600 mb-1"
      :for="fieldIds.title"
    >
      {{ $t("tasks.modal.title") }}
    </label>
    <input
      :id="fieldIds.title"
      ref="titleInput"
      v-model="model.title"
      type="text"
      required
      :placeholder="$t('tasks.modal.titlePlaceholder')"
      class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
    />
  </div>

  <div class="grid grid-cols-2 gap-4">
    <div>
      <label
        class="block text-xs font-medium text-slate-600 mb-1"
        :for="fieldIds.epic"
      >
        {{ $t("tasks.modal.epicOptional") }}
      </label>
      <select
        :id="fieldIds.epic"
        v-model="model.epicId"
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
      <label
        class="block text-xs font-medium text-slate-600 mb-1"
        :for="fieldIds.priority"
      >
        {{ $t("tasks.modal.priority") }}
      </label>
      <select
        :id="fieldIds.priority"
        v-model.number="model.priority"
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
    <label
      class="block text-xs font-medium text-slate-600 mb-1"
      :for="fieldIds.notes"
    >
      {{ $t("tasks.modal.notes") }}
    </label>
    <textarea
      :id="fieldIds.notes"
      v-model="model.notes"
      rows="3"
      :placeholder="$t('tasks.modal.notesPlaceholder')"
      class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none resize-y"
    />
  </div>

  <div class="grid grid-cols-2 gap-4">
    <div>
      <label
        class="block text-xs font-medium text-slate-600 mb-1"
        :for="fieldIds.status"
      >
        {{ $t("tasks.modal.status") }}
      </label>
      <select
        :id="fieldIds.status"
        v-model.number="model.status"
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
      <label
        class="block text-xs font-medium text-slate-600 mb-1"
        :for="fieldIds.dueDate"
      >
        {{ $t("tasks.modal.dueDate") }}
      </label>
      <input
        :id="fieldIds.dueDate"
        v-model="model.dueDate"
        type="date"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
      />
    </div>
  </div>

  <div class="grid grid-cols-2 gap-4">
    <div>
      <label
        class="block text-xs font-medium text-slate-600 mb-1"
        :for="fieldIds.estimated"
      >
        {{ $t("tasks.modal.estimatedHours") }}
      </label>
      <input
        :id="fieldIds.estimated"
        v-model="model.estimatedHours"
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
      :for="fieldIds.progress"
    >
      <span>{{ $t("tasks.modal.progress") }}</span>
      <span class="text-slate-500">{{ model.progress }}%</span>
    </label>
    <input
      :id="fieldIds.progress"
      v-model.number="model.progress"
      type="range"
      min="0"
      max="100"
      step="5"
      class="w-full accent-brand-600"
    />
  </div>

  <div>
    <label
      class="block text-xs font-medium text-slate-600 mb-1"
      :for="fieldIds.tags"
    >
      {{ $t("tasks.modal.tags") }}
    </label>
    <input
      :id="fieldIds.tags"
      v-model="model.tags"
      type="text"
      :placeholder="$t('tasks.modal.tagsPlaceholder')"
      class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
    />
  </div>
</template>
