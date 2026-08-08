<script setup lang="ts">
import {
  EPIC_COLORS,
  EPIC_COLOR_CLASSES,
  STATUS_I18N_KEYS,
  TaskStatus,
  type EpicColor,
} from "~/types/task";

interface EpicModalBasicsModel {
  id?: string;
  title: string;
  description: string;
  status: TaskStatus;
  color: EpicColor;
  dueDate: string;
  tags: string;
}

interface EpicModalBasicsFieldIds {
  title: string;
  description: string;
  status: string;
  dueDate: string;
  tags: string;
}

defineProps<{
  fieldIds: EpicModalBasicsFieldIds;
}>();

const model = defineModel<EpicModalBasicsModel>({ required: true });
const { t } = useI18n();
const titleInput = ref<HTMLInputElement | null>(null);

function colorLabel(c: EpicColor): string {
  return t(`epics.colors.${c}`);
}

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
      {{ $t("epics.modal.title") }}
    </label>
    <input
      :id="fieldIds.title"
      ref="titleInput"
      v-model="model.title"
      type="text"
      required
      :placeholder="$t('epics.modal.titlePlaceholder')"
      class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
    />
  </div>

  <div>
    <label
      class="block text-xs font-medium text-slate-600 mb-1"
      :for="fieldIds.description"
    >
      {{ $t("epics.modal.description") }}
    </label>
    <textarea
      :id="fieldIds.description"
      v-model="model.description"
      rows="3"
      :placeholder="$t('epics.modal.descriptionPlaceholder')"
      class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none resize-y"
    />
  </div>

  <div>
    <label class="block text-xs font-medium text-slate-600 mb-2">
      {{ $t("epics.modal.colorIdentity") }}
      <span class="text-slate-400 font-normal">
        {{ $t("epics.modal.colorHint") }}
      </span>
    </label>
    <div class="flex flex-wrap gap-2" role="group">
      <button
        v-for="c in EPIC_COLORS"
        :key="c"
        type="button"
        class="w-8 h-8 rounded-lg ring-1 ring-slate-200 hover:scale-105 transition flex items-center justify-center"
        :class="EPIC_COLOR_CLASSES[c].solid"
        :title="colorLabel(c)"
        :aria-label="$t('epics.modal.useColor', { color: colorLabel(c) })"
        :aria-pressed="model.color === c"
        @click="model.color = c"
      >
        <svg
          v-if="model.color === c"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          stroke-width="3"
          class="w-4 h-4"
        >
          <polyline
            points="20 6 9 17 4 12"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
  </div>

  <div class="grid grid-cols-2 gap-4">
    <div>
      <label
        class="block text-xs font-medium text-slate-600 mb-1"
        :for="fieldIds.status"
      >
        {{ $t("epics.modal.status") }}
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
        {{ $t("epics.modal.targetCompletion") }}
      </label>
      <input
        :id="fieldIds.dueDate"
        v-model="model.dueDate"
        type="date"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
      />
    </div>
  </div>

  <div>
    <label
      class="block text-xs font-medium text-slate-600 mb-1"
      :for="fieldIds.tags"
    >
      {{ $t("epics.modal.tags") }}
    </label>
    <input
      :id="fieldIds.tags"
      v-model="model.tags"
      type="text"
      :placeholder="$t('epics.modal.tagsPlaceholder')"
      class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
    />
  </div>
</template>
