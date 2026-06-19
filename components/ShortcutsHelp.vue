<script setup lang="ts">
const { helpOpen } = useUiOverlays();

interface Row {
  keys: string[];
  label: string;
}
interface Section {
  title: string;
  rows: Row[];
}

const sections: Section[] = [
  {
    title: "Global",
    rows: [
      { keys: ["?"], label: "Show this cheatsheet" },
      { keys: ["⌘", "K"], label: "Open command palette" },
      { keys: ["n"], label: "Quick capture task" },
      { keys: ["Esc"], label: "Close any overlay" },
    ],
  },
  {
    title: "Navigation",
    rows: [
      { keys: ["g", "d"], label: "Go to Dashboard" },
      { keys: ["g", "e"], label: "Go to Epics" },
      { keys: ["g", "a"], label: "Go to Analytics" },
    ],
  },
  {
    title: "Calendar (Dashboard)",
    rows: [
      { keys: ["1"], label: "Daily view" },
      { keys: ["2"], label: "Weekly view" },
      { keys: ["3"], label: "Monthly view" },
      { keys: ["t"], label: "Jump to today" },
      { keys: ["←"], label: "Previous period" },
      { keys: ["→"], label: "Next period" },
    ],
  },
  {
    title: "Modals & forms",
    rows: [
      { keys: ["⌘", "Enter"], label: "Save" },
      { keys: ["Esc"], label: "Close" },
    ],
  },
  {
    title: "Mouse & touch",
    rows: [
      { keys: ["drag"], label: "Move a block in Daily (snaps to 15 min)" },
      { keys: ["drag edge"], label: "Resize a block from top or bottom" },
      { keys: ["drag"], label: "Move a block across days in Weekly" },
    ],
  },
];

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) helpOpen.value = false;
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="helpOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
        @mousedown="onBackdrop"
      >
        <div
          class="w-full max-w-xl bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200"
        >
          <header
            class="flex items-center justify-between px-6 py-4 border-b border-slate-200"
          >
            <h2 class="text-lg font-semibold text-slate-900">
              Keyboard shortcuts
            </h2>
            <button
              type="button"
              class="text-slate-400 hover:text-slate-700"
              aria-label="Close"
              @click="helpOpen = false"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="w-5 h-5"
              >
                <path d="M6 6l12 12M6 18L18 6" stroke-linecap="round" />
              </svg>
            </button>
          </header>

          <div class="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[70vh] overflow-y-auto scrollbar-thin">
            <section v-for="section in sections" :key="section.title">
              <h3
                class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2"
              >
                {{ section.title }}
              </h3>
              <ul class="space-y-1.5">
                <li
                  v-for="row in section.rows"
                  :key="row.label"
                  class="flex items-center justify-between gap-3 text-sm"
                >
                  <span class="text-slate-700">{{ row.label }}</span>
                  <span class="flex items-center gap-1">
                    <kbd
                      v-for="(k, i) in row.keys"
                      :key="i"
                      class="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 text-[11px] font-mono"
                    >
                      {{ k }}
                    </kbd>
                  </span>
                </li>
              </ul>
            </section>
          </div>
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
