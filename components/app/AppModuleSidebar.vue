<script setup lang="ts">
const { paletteOpen, helpOpen } = useUiOverlays();
const { incomingCount: friendsIncomingCount } = useFriends();
const {
  isFeedSection,
  isMoneySection,
  navItems,
  sectionLabel,
  isModuleNavActive,
} = useAppSection();
const { settings, effectiveTheme, cycleTheme, themeLabel } = useThemeCycle();
</script>

<template>
  <aside
    class="hidden md:flex w-56 shrink-0 bg-white border-r border-slate-200 flex-col no-print"
  >
    <div class="px-4 py-4 border-b border-slate-200">
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {{ sectionLabel }}
      </p>
      <p class="mt-0.5 text-[11px] text-slate-400">
        {{
          isFeedSection
            ? $t("nav.sectionFeedHint")
            : isMoneySection
              ? $t("nav.sectionMoneyHint")
              : $t("nav.sectionTasksHint")
        }}
      </p>
    </div>

    <nav class="flex-1 p-3 space-y-1" :aria-label="$t('nav.moduleAria')">
      <NuxtLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition"
        :class="
          isModuleNavActive(item.to)
            ? 'bg-brand-50 text-brand-700'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        "
      >
        <AppIcon :name="item.icon" class="w-4 h-4" />
        <span class="flex-1">{{ $t(item.labelKey) }}</span>
        <span
          v-if="item.to === '/friends' && friendsIncomingCount > 0"
          class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold leading-none text-white"
          :aria-label="
            $t('friends.incomingBadge', { count: friendsIncomingCount })
          "
        >
          {{ friendsIncomingCount > 99 ? "99+" : friendsIncomingCount }}
        </span>
      </NuxtLink>
    </nav>

    <div class="p-3 border-t border-slate-200 space-y-2">
      <button
        type="button"
        class="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs text-slate-600 hover:bg-slate-100 ring-1 ring-slate-200"
        @click="paletteOpen = true"
      >
        <span class="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-3.5 h-3.5"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" stroke-linecap="round" />
          </svg>
          {{ $t("nav.quickJump") }}
        </span>
        <span class="flex items-center gap-0.5">
          <kbd class="px-1 py-0.5 bg-slate-200 rounded text-[10px] font-mono"
            >⌘</kbd
          >
          <kbd class="px-1 py-0.5 bg-slate-200 rounded text-[10px] font-mono"
            >K</kbd
          >
        </span>
      </button>
      <button
        type="button"
        class="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-[11px] text-slate-500 hover:bg-slate-100"
        @click="helpOpen = true"
      >
        <span>{{ $t("nav.shortcuts") }}</span>
        <kbd class="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono"
          >?</kbd
        >
      </button>
      <button
        type="button"
        class="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-[11px] text-slate-500 hover:bg-slate-100"
        :aria-label="$t('nav.themeCycleAria', { label: themeLabel })"
        :title="
          settings.theme === 'system'
            ? $t('nav.themeTitleSystem', { effectiveTheme })
            : $t('nav.themeTitleFixed', { label: themeLabel })
        "
        @click="cycleTheme"
      >
        <span class="flex items-center gap-1.5">
          <svg
            v-if="settings.theme === 'system'"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-3.5 h-3.5"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" stroke-linecap="round" />
          </svg>
          <svg
            v-else-if="settings.theme === 'light'"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-3.5 h-3.5"
          >
            <circle cx="12" cy="12" r="4" />
            <path
              d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
              stroke-linecap="round"
            />
          </svg>
          <svg
            v-else
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-3.5 h-3.5"
          >
            <path
              d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"
              stroke-linejoin="round"
            />
          </svg>
          {{ $t("nav.theme") }}
        </span>
        <span class="text-[10px] tabular-nums text-slate-400">
          {{ themeLabel }}
        </span>
      </button>
    </div>
  </aside>
</template>
