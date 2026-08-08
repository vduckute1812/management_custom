<script setup lang="ts">
import { moneyCategoryKey, type MoneyCategoryPick } from "~/types/money";
import type { MoneyCategoryOptionRow } from "~/composables/money/useMoneyCategorySelect";

defineProps<{
  open: boolean;
  menuStyle: Record<string, string>;
  options: MoneyCategoryOptionRow[];
  activeIndex: number;
  modelValue: MoneyCategoryPick | null;
  allowCreate: boolean;
}>();

const emit = defineEmits<{
  keydown: [event: KeyboardEvent];
  "update:activeIndex": [value: number];
  select: [row: MoneyCategoryOptionRow];
  startCreate: [];
}>();

const menuEl = ref<HTMLElement | null>(null);

defineExpose({
  getMenuEl: () => menuEl.value,
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="menuEl"
      class="flex flex-col overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200"
      :style="menuStyle"
      role="listbox"
      tabindex="-1"
      :aria-activedescendant="
        options[activeIndex] ? `money-cat-opt-${activeIndex}` : undefined
      "
      @keydown="emit('keydown', $event)"
    >
      <div class="min-h-0 flex-1 overflow-y-auto py-1 scrollbar-thin">
        <button
          v-for="(row, idx) in options"
          :id="`money-cat-opt-${idx}`"
          :key="row.key || 'null'"
          type="button"
          role="option"
          class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition"
          :class="
            idx === activeIndex
              ? 'bg-brand-50 text-slate-900'
              : 'text-slate-700 hover:bg-slate-50'
          "
          :aria-selected="
            modelValue == null
              ? row.pick == null
              : row.key === moneyCategoryKey(modelValue)
          "
          @mouseenter="emit('update:activeIndex', idx)"
          @click="emit('select', row)"
        >
          <span class="text-base leading-none" aria-hidden="true">{{
            row.emoji
          }}</span>
          <span
            class="h-2 w-2 shrink-0 rounded-full"
            :style="{ backgroundColor: row.color }"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 truncate font-medium">{{
            row.label
          }}</span>
        </button>
      </div>

      <div
        v-if="allowCreate"
        class="shrink-0 border-t border-slate-100 bg-slate-50/80"
      >
        <div class="p-1.5">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-brand-700 transition hover:bg-white"
            @click="emit('startCreate')"
          >
            <span aria-hidden="true">＋</span>
            {{ $t("money.categoriesAdd.action") }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
