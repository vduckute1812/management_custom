<script setup lang="ts">
import {
  MONEY_SAVINGS_GOAL_STATUSES,
  MONEY_SAVINGS_GOAL_STATUS_I18N_KEYS,
  MoneySavingsGoalStatus,
} from "~/types/money";

interface MoneySavingsGoalModalFormModel {
  id?: string;
  title: string;
  targetText: string;
  status: MoneySavingsGoalStatus;
  targetDate: string;
  note: string;
}

interface MoneySavingsGoalModalFieldIds {
  title: string;
  target: string;
  status: string;
  targetDate: string;
  note: string;
}

defineProps<{
  fieldIds: MoneySavingsGoalModalFieldIds;
}>();

const model = defineModel<MoneySavingsGoalModalFormModel>({ required: true });
const titleInput = ref<HTMLInputElement | null>(null);

defineExpose({
  titleInputEl: () => titleInput.value,
});
</script>

<template>
  <div>
    <label
      class="mb-1 block text-xs font-medium text-slate-600"
      :for="fieldIds.title"
    >
      {{ $t("money.savings.modal.title") }}
    </label>
    <input
      :id="fieldIds.title"
      ref="titleInput"
      v-model="model.title"
      type="text"
      required
      maxlength="120"
      :placeholder="$t('money.savings.modal.titlePlaceholder')"
      class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
    />
  </div>

  <div class="grid grid-cols-2 gap-4">
    <div>
      <label
        class="mb-1 block text-xs font-medium text-slate-600"
        :for="fieldIds.target"
      >
        {{ $t("money.savings.modal.target") }}
      </label>
      <input
        :id="fieldIds.target"
        v-model="model.targetText"
        type="text"
        inputmode="numeric"
        required
        :placeholder="$t('money.savings.modal.targetPlaceholder')"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
      />
    </div>
    <div>
      <label
        class="mb-1 block text-xs font-medium text-slate-600"
        :for="fieldIds.status"
      >
        {{ $t("money.savings.modal.status") }}
      </label>
      <select
        :id="fieldIds.status"
        v-model.number="model.status"
        class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
      >
        <option v-for="st in MONEY_SAVINGS_GOAL_STATUSES" :key="st" :value="st">
          {{ $t(MONEY_SAVINGS_GOAL_STATUS_I18N_KEYS[st]) }}
        </option>
      </select>
    </div>
  </div>

  <div>
    <label
      class="mb-1 block text-xs font-medium text-slate-600"
      :for="fieldIds.targetDate"
    >
      {{ $t("money.savings.modal.targetDate") }}
    </label>
    <input
      :id="fieldIds.targetDate"
      v-model="model.targetDate"
      type="date"
      class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
    />
  </div>

  <div>
    <label
      class="mb-1 block text-xs font-medium text-slate-600"
      :for="fieldIds.note"
    >
      {{ $t("money.savings.modal.note") }}
    </label>
    <input
      :id="fieldIds.note"
      v-model="model.note"
      type="text"
      maxlength="500"
      :placeholder="$t('money.savings.modal.notePlaceholder')"
      class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
    />
  </div>
</template>
