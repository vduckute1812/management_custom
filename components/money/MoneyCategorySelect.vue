<script setup lang="ts">
import {
  useMoneyCategorySelect,
  type MoneyCategorySelectValue,
} from "~/composables/money/useMoneyCategorySelect";
import { MoneyDirection } from "~/types/money";

const props = withDefaults(
  defineProps<{
    modelValue: MoneyCategorySelectValue;
    id?: string;
    disabled?: boolean;
    mode?: "all" | "expense" | "direction";
    direction?: MoneyDirection;
    allowNull?: boolean;
    nullLabel?: string;
    size?: "sm" | "md";
    allowCreate?: boolean;
  }>(),
  {
    id: undefined,
    mode: "all",
    direction: undefined,
    allowNull: false,
    nullLabel: undefined,
    size: "md",
    allowCreate: true,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: MoneyCategorySelectValue];
}>();

const { t } = useI18n();

const menuComponent = ref<{ getMenuEl: () => HTMLElement | null } | null>(null);

const {
  userCategories,
  open,
  creating,
  rootEl,
  triggerEl,
  menuStyle,
  activeIndex,
  createDirection,
  options,
  selectedRow,
  triggerClass,
  openMenu,
  closeMenu,
  selectRow,
  onKeydown,
  startCreate,
  cancelCreate,
  onCategoryCreated,
} = useMoneyCategorySelect(props, (value) => emit("update:modelValue", value), {
  getMenuEl: () => menuComponent.value?.getMenuEl() ?? null,
});

function onMenuKeydown(e: KeyboardEvent) {
  onKeydown(e);
}

function toggleMenu() {
  if (open.value) closeMenu();
  else openMenu();
}
</script>

<template>
  <div ref="rootEl" class="relative">
    <button
      :id="id"
      ref="triggerEl"
      type="button"
      class="flex w-full items-center gap-2 rounded-lg border border-slate-300 bg-white text-left font-medium text-slate-800 outline-none transition hover:border-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60"
      :class="triggerClass"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggleMenu"
      @keydown="onKeydown"
    >
      <span class="text-base leading-none" aria-hidden="true">
        {{ selectedRow?.emoji || "🏷️" }}
      </span>
      <span
        class="h-2 w-2 shrink-0 rounded-full"
        :style="{ backgroundColor: selectedRow?.color || '#94a3b8' }"
        aria-hidden="true"
      />
      <span class="min-w-0 flex-1 truncate">
        {{ selectedRow?.label || t("money.modal.category") }}
      </span>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="h-4 w-4 shrink-0 text-slate-400 transition"
        :class="open ? 'rotate-180' : ''"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <MoneyCategorySelectMenu
      ref="menuComponent"
      :open="open"
      :menu-style="menuStyle"
      :options="options"
      :active-index="activeIndex"
      :model-value="modelValue"
      :allow-create="allowCreate"
      @keydown="onMenuKeydown"
      @update:active-index="activeIndex = $event"
      @select="selectRow"
      @start-create="startCreate"
    />

    <MoneyCategoryCreatorPanel
      :open="creating"
      :direction="createDirection"
      :color-index="userCategories.length"
      @close="cancelCreate"
      @created="onCategoryCreated"
    />
  </div>
</template>
