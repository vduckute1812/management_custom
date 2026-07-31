<script setup lang="ts">
const { helpOpen } = useUiOverlays();
const { t } = useI18n();

interface Row {
  keys: string[];
  label: string;
}
interface Section {
  title: string;
  rows: Row[];
}

const sections = computed<Section[]>(() => [
  {
    title: t("shortcuts.sections.global"),
    rows: [
      { keys: ["?"], label: t("shortcuts.showCheatsheet") },
      { keys: ["⌘", "K"], label: t("shortcuts.openPalette") },
      { keys: ["n"], label: t("shortcuts.quickCapture") },
      { keys: ["⇧", "N"], label: t("shortcuts.newTaskFull") },
      { keys: ["Esc"], label: t("shortcuts.closeOverlay") },
    ],
  },
  {
    title: t("shortcuts.sections.navigation"),
    rows: [
      { keys: ["g", "h"], label: t("shortcuts.goHome") },
      { keys: ["g", "d"], label: t("shortcuts.goDashboard") },
      { keys: ["g", "e"], label: t("shortcuts.goEpics") },
      { keys: ["g", "a"], label: t("shortcuts.goAnalytics") },
      { keys: ["g", "f"], label: t("shortcuts.goFeed") },
    ],
  },
  {
    title: t("shortcuts.sections.calendar"),
    rows: [
      { keys: ["1"], label: t("shortcuts.dailyView") },
      { keys: ["2"], label: t("shortcuts.weeklyView") },
      { keys: ["3"], label: t("shortcuts.monthlyView") },
      { keys: ["t"], label: t("shortcuts.jumpToday") },
      { keys: ["←"], label: t("shortcuts.previousPeriod") },
      { keys: ["→"], label: t("shortcuts.nextPeriod") },
    ],
  },
  {
    title: t("shortcuts.sections.modals"),
    rows: [
      { keys: ["⌘", "Enter"], label: t("shortcuts.save") },
      { keys: ["Esc"], label: t("shortcuts.closeAsksUnsaved") },
    ],
  },
  {
    title: t("shortcuts.sections.mouse"),
    rows: [
      { keys: ["click block"], label: t("shortcuts.clickBlockLog") },
      { keys: ["double-click"], label: t("shortcuts.doubleClickEdit") },
      { keys: ["drag"], label: t("shortcuts.dragMoveDaily") },
      { keys: ["drag edge"], label: t("shortcuts.dragEdgeResize") },
      { keys: ["drag Up next"], label: t("shortcuts.dragUpNext") },
      { keys: ["drag"], label: t("shortcuts.dragWeekly") },
    ],
  },
]);

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
        role="dialog"
        aria-modal="true"
        :aria-label="$t('shortcuts.aria')"
        @mousedown="onBackdrop"
      >
        <div
          class="w-full max-w-xl bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200"
          @mousedown.stop
        >
          <header
            class="flex items-center justify-between px-6 py-4 border-b border-slate-200"
          >
            <h2 class="text-lg font-semibold text-slate-900">
              {{ $t("shortcuts.title") }}
            </h2>
            <button
              type="button"
              class="text-slate-400 hover:text-slate-700"
              :aria-label="$t('shortcuts.close')"
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

          <div
            class="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[70vh] overflow-y-auto scrollbar-thin"
          >
            <section v-for="section in sections" :key="section.title">
              <h3
                class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2"
              >
                {{ section.title }}
              </h3>
              <ul class="space-y-1.5">
                <li
                  v-for="(row, rowIdx) in section.rows"
                  :key="`${section.title}-${rowIdx}`"
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
