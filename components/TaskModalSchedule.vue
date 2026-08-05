<script setup lang="ts">
import {
  RECURRENCE_I18N_KEYS,
  RecurrenceRule,
  type Recurrence,
  type TimeBlock,
} from "~/types/task";

interface TaskModalScheduleModel {
  timeBlocks: TimeBlock[];
  recurs: boolean;
  recurrenceRule: RecurrenceRule;
  recurrenceInterval: number;
  recurrenceUntil: string;
}

defineProps<{
  recursInputId: string;
}>();

const { t } = useI18n();
const model = defineModel<TaskModalScheduleModel>({ required: true });

const hasSeedBlocks = computed(() => model.value.timeBlocks.length > 0);

function describeRecurrenceLabel(r?: Recurrence | null): string {
  if (!r) return t("common.doesNotRepeat");
  const unit = t(RECURRENCE_I18N_KEYS[r.rule]);
  const head =
    r.interval <= 1
      ? t("common.everyUnit", { unit })
      : t("common.everyInterval", { count: r.interval, unit });
  return r.until ? `${head}${t("common.untilDate", { date: r.until })}` : head;
}

const recurrenceSummary = computed(() => {
  if (!model.value.recurs) return null;
  const r: Recurrence = {
    rule: model.value.recurrenceRule,
    interval: Math.max(1, Math.round(model.value.recurrenceInterval)),
  };
  if (model.value.recurrenceUntil) r.until = model.value.recurrenceUntil;
  return describeRecurrenceLabel(r);
});
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-2">
      <label class="text-xs font-medium text-slate-600">
        {{ $t("tasks.modal.timeBlocks") }}
      </label>
      <p class="text-[11px] text-slate-500">
        {{ $t("tasks.modal.timeBlocksHint") }}
      </p>
    </div>
    <TimeBlockEditor v-model="model.timeBlocks" />
  </div>

  <div class="rounded-lg ring-1 ring-slate-200 bg-slate-50/60 p-3">
    <label class="flex items-start gap-2 cursor-pointer" :for="recursInputId">
      <input
        :id="recursInputId"
        v-model="model.recurs"
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

    <div v-if="model.recurs" class="mt-3 space-y-3 pl-6">
      <div
        v-if="!hasSeedBlocks"
        class="text-[11px] text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded-md px-2.5 py-1.5"
      >
        {{ $t("tasks.modal.needSeedBlock") }}
      </div>

      <div class="flex items-center gap-2 flex-wrap text-xs">
        <span class="text-slate-600">{{ $t("tasks.modal.every") }}</span>
        <input
          v-model.number="model.recurrenceInterval"
          type="number"
          min="1"
          max="365"
          step="1"
          class="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs tabular-nums focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
        />
        <select
          v-model.number="model.recurrenceRule"
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
        <span class="text-slate-500">{{ $t("tasks.modal.until") }}</span>
        <input
          v-model="model.recurrenceUntil"
          type="date"
          class="rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
        />
        <button
          v-if="model.recurrenceUntil"
          type="button"
          class="text-[11px] text-slate-500 hover:text-slate-700 underline"
          @click="model.recurrenceUntil = ''"
        >
          {{ $t("tasks.modal.noEnd") }}
        </button>
      </div>

      <p v-if="recurrenceSummary" class="text-[11px] text-slate-500">
        {{ recurrenceSummary }}
      </p>
    </div>
  </div>
</template>
