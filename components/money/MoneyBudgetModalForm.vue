<script setup lang="ts">
import { MoneyBudgetScope, type MoneyCategoryPick } from "~/types/money";

defineProps<{
  scope: typeof MoneyBudgetScope.Overall | typeof MoneyBudgetScope.Category;
  categoryPick: MoneyCategoryPick;
  amountText: string;
  amountInputId: string;
  categoryInputId: string;
  errorMsg: string | null;
}>();

const emit = defineEmits<{
  (
    e: "update:scope",
    value: typeof MoneyBudgetScope.Overall | typeof MoneyBudgetScope.Category,
  ): void;
  (e: "update:categoryPick", value: MoneyCategoryPick): void;
  (e: "update:amountText", value: string): void;
}>();

const amountInput = ref<HTMLInputElement | null>(null);

defineExpose({
  amountInputEl: () => amountInput.value,
});
</script>

<template>
  <div class="space-y-4 px-6 py-5">
    <div class="grid grid-cols-2 gap-2">
      <button
        type="button"
        class="rounded-lg px-3 py-2 text-sm font-semibold ring-1 transition"
        :class="
          scope === MoneyBudgetScope.Overall
            ? 'money-chip--active ring-1'
            : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
        "
        :aria-pressed="scope === MoneyBudgetScope.Overall"
        @click="emit('update:scope', MoneyBudgetScope.Overall)"
      >
        {{ $t("money.budgets.scope.overall") }}
      </button>
      <button
        type="button"
        class="rounded-lg px-3 py-2 text-sm font-semibold ring-1 transition"
        :class="
          scope === MoneyBudgetScope.Category
            ? 'money-chip--active ring-1'
            : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
        "
        :aria-pressed="scope === MoneyBudgetScope.Category"
        @click="emit('update:scope', MoneyBudgetScope.Category)"
      >
        {{ $t("money.budgets.scope.category") }}
      </button>
    </div>

    <div v-if="scope === MoneyBudgetScope.Category">
      <label
        class="mb-1 block text-xs font-medium text-slate-600"
        :for="categoryInputId"
      >
        {{ $t("money.budgets.modal.category") }}
      </label>
      <MoneyCategorySelect
        :id="categoryInputId"
        :model-value="categoryPick"
        mode="expense"
        allow-create
        @update:model-value="
          (v) => {
            if (v != null) emit('update:categoryPick', v);
          }
        "
      />
    </div>

    <div>
      <label
        class="mb-1 block text-xs font-medium text-slate-600"
        :for="amountInputId"
      >
        {{ $t("money.budgets.modal.amount") }}
      </label>
      <input
        :id="amountInputId"
        ref="amountInput"
        :value="amountText"
        type="text"
        inputmode="numeric"
        required
        :placeholder="$t('money.budgets.modal.amountPlaceholder')"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
        @input="
          emit('update:amountText', ($event.target as HTMLInputElement).value)
        "
      />
    </div>

    <p
      v-if="errorMsg"
      class="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700"
      role="alert"
    >
      {{ errorMsg }}
    </p>
  </div>
</template>
