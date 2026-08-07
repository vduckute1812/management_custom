<script setup lang="ts">
import {
  MoneyDirection,
  coerceCategoryPickForDirection,
  type MoneyCategoryPick,
} from "~/types/money";

interface MoneyTransactionModalFormModel {
  id?: string;
  occurredOn: string;
  amountText: string;
  direction: typeof MoneyDirection.Out | typeof MoneyDirection.In;
  categoryPick: MoneyCategoryPick;
  note: string;
}

interface MoneyTransactionModalFieldIds {
  amount: string;
  occurredOn: string;
  direction: string;
  category: string;
  note: string;
}

defineProps<{
  fieldIds: MoneyTransactionModalFieldIds;
}>();

const model = defineModel<MoneyTransactionModalFormModel>({ required: true });
const amountInput = ref<HTMLInputElement | null>(null);

function setDirection(
  direction: typeof MoneyDirection.Out | typeof MoneyDirection.In,
) {
  model.value.direction = direction;
  model.value.categoryPick = coerceCategoryPickForDirection(
    model.value.categoryPick,
    direction,
  );
}

defineExpose({
  amountInputEl: () => amountInput.value,
});
</script>

<template>
  <div class="grid grid-cols-2 gap-3">
    <button
      type="button"
      class="rounded-lg px-3 py-2 text-sm font-semibold ring-1 transition"
      :class="
        model.direction === MoneyDirection.Out
          ? 'bg-rose-50 text-rose-700 ring-rose-200'
          : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
      "
      :aria-pressed="model.direction === MoneyDirection.Out"
      @click="setDirection(MoneyDirection.Out)"
    >
      {{ $t("money.direction.out") }}
    </button>
    <button
      type="button"
      class="rounded-lg px-3 py-2 text-sm font-semibold ring-1 transition"
      :class="
        model.direction === MoneyDirection.In
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
          : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
      "
      :aria-pressed="model.direction === MoneyDirection.In"
      @click="setDirection(MoneyDirection.In)"
    >
      {{ $t("money.direction.in") }}
    </button>
  </div>

  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <div>
      <label
        class="mb-1 block text-xs font-medium text-slate-600"
        :for="fieldIds.amount"
      >
        {{ $t("money.modal.amount") }}
      </label>
      <input
        :id="fieldIds.amount"
        ref="amountInput"
        v-model="model.amountText"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        required
        :placeholder="$t('money.modal.amountPlaceholder')"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
      />
    </div>

    <div>
      <label
        class="mb-1 block text-xs font-medium text-slate-600"
        :for="fieldIds.occurredOn"
      >
        {{ $t("money.modal.date") }}
      </label>
      <input
        :id="fieldIds.occurredOn"
        v-model="model.occurredOn"
        type="date"
        required
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
      />
    </div>
  </div>

  <div>
    <label
      class="mb-1 block text-xs font-medium text-slate-600"
      :for="fieldIds.category"
    >
      {{ $t("money.modal.category") }}
    </label>
    <MoneyCategorySelect
      :id="fieldIds.category"
      :model-value="model.categoryPick"
      mode="direction"
      :direction="model.direction"
      allow-create
      @update:model-value="
        (v) => {
          if (v != null) model.categoryPick = v;
        }
      "
    />
  </div>

  <div>
    <label
      class="mb-1 block text-xs font-medium text-slate-600"
      :for="fieldIds.note"
    >
      {{ $t("money.modal.note") }}
    </label>
    <input
      :id="fieldIds.note"
      v-model="model.note"
      type="text"
      maxlength="500"
      :placeholder="$t('money.modal.notePlaceholder')"
      class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
    />
  </div>
</template>
