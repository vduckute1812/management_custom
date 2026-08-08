<script setup lang="ts">
import type { CommandPaletteItem } from "~/composables/app/useCommandPaletteItems";

defineProps<{
  listId: string;
  items: CommandPaletteItem[];
  cursor: number;
}>();

const emit = defineEmits<{
  "update:cursor": [value: number];
  select: [];
}>();

function onMouseenter(idx: number) {
  emit("update:cursor", idx);
}

function onClick() {
  emit("select");
}
</script>

<template>
  <ul
    :id="listId"
    class="max-h-80 overflow-y-auto scrollbar-thin"
    role="listbox"
    :aria-label="$t('commandPalette.resultsAria')"
  >
    <li
      v-if="items.length === 0"
      class="px-4 py-6 text-sm text-slate-400 italic text-center"
    >
      {{ $t("commandPalette.noMatches") }}
    </li>
    <li
      v-for="(item, idx) in items"
      :id="`${listId}-opt-${item.id}`"
      :key="item.id"
      :class="[
        'px-4 py-2 flex items-center gap-3 cursor-pointer',
        idx === cursor ? 'bg-brand-50' : 'hover:bg-slate-50',
      ]"
      role="option"
      :aria-selected="idx === cursor"
      @mouseenter="onMouseenter(idx)"
      @click="onClick"
    >
      <span
        v-if="item.icon === 'dot'"
        class="w-2 h-2 rounded-full shrink-0"
        :class="item.accentClass ?? 'bg-slate-400'"
      />
      <svg
        v-else-if="item.icon === 'calendar'"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="w-4 h-4 text-slate-500 shrink-0"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
      <svg
        v-else-if="item.icon === 'layers'"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="w-4 h-4 text-slate-500 shrink-0"
        aria-hidden="true"
      >
        <polygon points="12 2 2 7 12 12 22 7 12 2" stroke-linejoin="round" />
        <polyline points="2 17 12 22 22 17" stroke-linejoin="round" />
        <polyline points="2 12 12 17 22 12" stroke-linejoin="round" />
      </svg>
      <svg
        v-else-if="item.icon === 'chart'"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="w-4 h-4 text-slate-500 shrink-0"
        aria-hidden="true"
      >
        <path d="M3 3v18h18" stroke-linecap="round" />
        <path
          d="M7 14l4-4 4 4 5-7"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <svg
        v-else-if="item.icon === 'bolt'"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        class="w-4 h-4 text-amber-500 shrink-0"
        aria-hidden="true"
      >
        <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
      </svg>

      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-slate-800 truncate">
          {{ item.title }}
        </p>
        <p v-if="item.subtitle" class="text-[11px] text-slate-500 truncate">
          {{ item.subtitle }}
        </p>
      </div>
      <kbd
        v-if="item.shortcut"
        class="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 font-mono"
      >
        {{ item.shortcut }}
      </kbd>
    </li>
  </ul>
</template>
