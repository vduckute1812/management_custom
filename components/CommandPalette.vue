<script setup lang="ts">
import {
  matchesPaletteItem,
  useCommandPaletteItems,
} from "~/composables/useCommandPaletteItems";

const { paletteOpen } = useUiOverlays();
const { allItems } = useCommandPaletteItems();

const query = ref("");
const cursor = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);
const rootEl = ref<HTMLElement | null>(null);
const listId = useId();

useModal(paletteOpen, {
  container: rootEl,
  initialFocus: inputEl,
  onClose: () => {
    paletteOpen.value = false;
  },
});

watch(paletteOpen, (open) => {
  if (open) {
    query.value = "";
    cursor.value = 0;
  }
});

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return allItems.value.slice(0, 30);
  return allItems.value.filter((it) => matchesPaletteItem(it, q)).slice(0, 30);
});

const activeOptionId = computed(() => {
  const item = filtered.value[cursor.value];
  return item ? `${listId}-opt-${item.id}` : undefined;
});

watch(filtered, () => {
  cursor.value = 0;
});

function runActive() {
  const item = filtered.value[cursor.value];
  if (item) {
    paletteOpen.value = false;
    item.run();
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    cursor.value = Math.min(cursor.value + 1, filtered.value.length - 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    cursor.value = Math.max(cursor.value - 1, 0);
  } else if (e.key === "Enter") {
    e.preventDefault();
    runActive();
  }
}

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) paletteOpen.value = false;
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="paletteOpen"
        ref="rootEl"
        class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 backdrop-blur-sm pt-24 px-4"
        role="dialog"
        aria-modal="true"
        :aria-label="$t('commandPalette.aria')"
        @mousedown="onBackdrop"
      >
        <div
          class="w-full max-w-xl bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden flex flex-col"
          @mousedown.stop
        >
          <div
            class="px-4 py-3 border-b border-slate-200 flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="w-4 h-4 text-slate-400"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35" stroke-linecap="round" />
            </svg>
            <input
              ref="inputEl"
              v-model="query"
              type="text"
              :placeholder="$t('commandPalette.placeholder')"
              class="flex-1 text-sm outline-none bg-transparent"
              role="combobox"
              aria-autocomplete="list"
              :aria-controls="listId"
              :aria-expanded="true"
              :aria-activedescendant="activeOptionId"
              :aria-label="$t('commandPalette.searchAria')"
              @keydown="onKey"
            />
            <kbd
              class="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 font-mono"
            >
              Esc
            </kbd>
          </div>

          <CommandPaletteList
            :list-id="listId"
            :items="filtered"
            :cursor="cursor"
            @update:cursor="cursor = $event"
            @select="runActive"
          />

          <CommandPaletteFooter
            :filtered-count="filtered.length"
            :total-count="allItems.length"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
