<script setup lang="ts">
const { paletteOpen, helpOpen } = useUiOverlays();
const { incomingCount: friendsIncomingCount } = useFriends();
const { navItems, isModuleNavActive } = useAppSection();
const { cycleTheme, themeLabel } = useThemeCycle();

const mobileMoreOpen = ref(false);
const mobileMoreRoot = ref<HTMLElement | null>(null);

function closeMobileMore() {
  mobileMoreOpen.value = false;
}

useModal(mobileMoreOpen, {
  container: mobileMoreRoot,
  onClose: closeMobileMore,
});
</script>

<template>
  <!-- Mobile utilities sheet -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="mobileMoreOpen"
        ref="mobileMoreRoot"
        class="md:hidden fixed inset-0 z-40 bg-slate-900/40"
        role="dialog"
        aria-modal="true"
        :aria-label="$t('nav.more')"
        @click="closeMobileMore"
      >
        <div
          class="absolute inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] mx-3 mb-2 rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 overflow-hidden"
          @click.stop
        >
          <button
            type="button"
            class="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 border-b border-slate-100"
            @click="
              paletteOpen = true;
              closeMobileMore();
            "
          >
            {{ $t("nav.quickJump") }}
            <kbd
              class="ml-auto text-[10px] px-1.5 py-0.5 bg-slate-100 rounded font-mono text-slate-500"
              >⌘K</kbd
            >
          </button>
          <button
            type="button"
            class="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 border-b border-slate-100"
            @click="
              helpOpen = true;
              closeMobileMore();
            "
          >
            {{ $t("nav.shortcuts") }}
            <kbd
              class="ml-auto text-[10px] px-1.5 py-0.5 bg-slate-100 rounded font-mono text-slate-500"
              >?</kbd
            >
          </button>
          <button
            type="button"
            class="w-full flex items-center justify-between gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50"
            @click="cycleTheme()"
          >
            <span>{{ $t("nav.theme") }}</span>
            <span class="text-[11px] text-slate-400">{{ themeLabel }}</span>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Mobile module nav (within-section only; module switch is via header) -->
  <div
    class="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)] no-print"
  >
    <nav
      class="grid grid-flow-col auto-cols-fr"
      :aria-label="$t('nav.moduleMobileAria')"
    >
      <NuxtLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium"
        :class="
          isModuleNavActive(item.to) ? 'text-brand-700' : 'text-slate-500'
        "
        @click="closeMobileMore"
      >
        <span class="relative">
          <AppIcon :name="item.icon" class="w-4 h-4" />
          <span
            v-if="item.to === '/friends' && friendsIncomingCount > 0"
            class="absolute -right-2.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold leading-none text-white"
            :aria-label="
              $t('friends.incomingBadge', { count: friendsIncomingCount })
            "
          >
            {{ friendsIncomingCount > 9 ? "9+" : friendsIncomingCount }}
          </span>
        </span>
        {{ $t(item.labelKey) }}
      </NuxtLink>
      <button
        type="button"
        class="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium"
        :class="mobileMoreOpen ? 'text-brand-700' : 'text-slate-500'"
        :aria-label="$t('nav.more')"
        :aria-expanded="mobileMoreOpen"
        @click="mobileMoreOpen = !mobileMoreOpen"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          class="w-5 h-5"
          aria-hidden="true"
        >
          <circle cx="5" cy="12" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="19" cy="12" r="1.75" />
        </svg>
        {{ $t("nav.more") }}
      </button>
    </nav>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
