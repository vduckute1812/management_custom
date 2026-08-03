<script setup lang="ts">
import {
  MONEY_CATEGORIES,
  MONEY_CATEGORY_COLORS,
  MONEY_CATEGORY_I18N_KEYS,
  MONEY_EXPENSE_CATEGORIES,
  MoneyCategory,
  MoneyDirection,
  type MoneyCategory as MoneyCategoryValue,
} from "~/types/money";

const props = withDefaults(
  defineProps<{
    modelValue: MoneyCategoryValue | null;
    id?: string;
    disabled?: boolean;
    /**
     * `all` — every category.
     * `expense` — excludes Income.
     * `direction` — options appropriate for In/Out (needs `direction`).
     */
    mode?: "all" | "expense" | "direction";
    direction?: MoneyDirection;
    /** Bind `null` via an empty first option (filters). */
    allowNull?: boolean;
    nullLabel?: string;
    size?: "sm" | "md";
  }>(),
  {
    mode: "all",
    allowNull: false,
    size: "md",
  },
);

defineOptions({ inheritAttrs: false });

const emit = defineEmits<{
  "update:modelValue": [value: MoneyCategoryValue | null];
}>();

const attrs = useAttrs();

const { t } = useI18n();

const options = computed((): readonly MoneyCategoryValue[] => {
  if (props.mode === "expense") return MONEY_EXPENSE_CATEGORIES;
  if (props.mode === "direction") {
    if (props.direction === MoneyDirection.In) {
      return [
        MoneyCategory.Income,
        MoneyCategory.Transfer,
        MoneyCategory.Other,
      ];
    }
    return MONEY_EXPENSE_CATEGORIES;
  }
  return MONEY_CATEGORIES;
});

const selectedColor = computed(() => {
  if (props.modelValue == null) return null;
  return MONEY_CATEGORY_COLORS[props.modelValue];
});

const selectClass = computed(() =>
  props.size === "sm"
    ? "min-h-9 py-1.5 pl-8 pr-8 text-xs"
    : "min-h-10 py-2 pl-9 pr-9 text-sm",
);

const swatchClass = computed(() =>
  props.size === "sm" ? "left-2.5 h-2 w-2" : "left-3 h-2.5 w-2.5",
);

function onChange(e: Event) {
  const raw = (e.target as HTMLSelectElement).value;
  if (raw === "") {
    emit("update:modelValue", null);
    return;
  }
  const n = Number(raw);
  emit(
    "update:modelValue",
    Number.isInteger(n) ? (n as MoneyCategoryValue) : null,
  );
}
</script>

<template>
  <div class="relative">
    <span
      v-if="selectedColor"
      class="pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 rounded-full ring-2 ring-white"
      :class="swatchClass"
      :style="{ backgroundColor: selectedColor }"
      aria-hidden="true"
    />
    <span
      v-else
      class="pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-slate-200 ring-2 ring-white"
      :class="swatchClass"
      aria-hidden="true"
    />
    <select
      :id="id"
      v-bind="attrs"
      class="w-full appearance-none rounded-lg border border-slate-300 bg-white font-medium text-slate-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60"
      :class="selectClass"
      :disabled="disabled"
      :value="modelValue == null ? '' : String(modelValue)"
      @change="onChange"
    >
      <option v-if="allowNull" value="">
        {{ nullLabel || t("money.filterAllCategories") }}
      </option>
      <option v-for="cat in options" :key="cat" :value="String(cat)">
        {{ t(MONEY_CATEGORY_I18N_KEYS[cat]) }}
      </option>
    </select>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      class="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </div>
</template>
