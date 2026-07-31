<script setup lang="ts">
const route = useRoute();
const { t } = useI18n();
const { paletteOpen, helpOpen } = useUiOverlays();
const { settings, update, effectiveTheme } = useSettings();
const auth = useAuth();

type AppSection = "tasks" | "feed" | "other";
type NavIcon =
  "calendar" | "layers" | "chart" | "cog" | "shield" | "feed" | "user";

interface NavItem {
  to: string;
  labelKey: string;
  icon: NavIcon;
}

/** Sticky across shared routes (Settings / Admin) so those don't bounce the tab. */
const activeSection = useState<AppSection>("app:section", () => "other");

watch(
  () => route.path,
  (path) => {
    if (path === "/feed" || path.startsWith("/feed/")) {
      activeSection.value = "feed";
      return;
    }
    if (
      path === "/tasks" ||
      path.startsWith("/tasks/") ||
      path.startsWith("/epics") ||
      path.startsWith("/analytics")
    ) {
      activeSection.value = "tasks";
      return;
    }
    // Home / profile: leave modules; Settings / Admin keep last sticky section.
    if (
      path === "/" ||
      path === "/profile" ||
      path.startsWith("/profile/") ||
      path.startsWith("/login") ||
      path.startsWith("/signup")
    ) {
      activeSection.value = "other";
    }
  },
  { immediate: true },
);

const isFeedSection = computed(() => activeSection.value === "feed");
const isTasksSection = computed(() => activeSection.value === "tasks");
const isHub = computed(() => route.path === "/");
const showTaskChrome = computed(
  () =>
    isTasksSection.value &&
    !isHub.value &&
    route.path !== "/profile" &&
    !route.path.startsWith("/profile/"),
);
const showModuleSidebar = computed(() => {
  if (
    isHub.value ||
    route.path === "/profile" ||
    route.path.startsWith("/profile/")
  ) {
    return false;
  }
  return isFeedSection.value || isTasksSection.value;
});

const navItems = computed<NavItem[]>(() => {
  if (isFeedSection.value) {
    const feedNav: NavItem[] = [
      { to: "/feed", labelKey: "nav.feed", icon: "feed" },
      { to: "/settings", labelKey: "nav.settings", icon: "cog" },
    ];
    if (auth.isAdminUi.value) {
      feedNav.splice(1, 0, {
        to: "/admin",
        labelKey: "nav.admin",
        icon: "shield",
      });
    }
    return feedNav;
  }

  if (isTasksSection.value) {
    const base: NavItem[] = [
      { to: "/tasks", labelKey: "nav.dashboard", icon: "calendar" },
      { to: "/epics", labelKey: "nav.epics", icon: "layers" },
      { to: "/analytics", labelKey: "nav.analytics", icon: "chart" },
      { to: "/settings", labelKey: "nav.settings", icon: "cog" },
    ];
    if (auth.isAdminUi.value) {
      base.splice(3, 0, {
        to: "/admin",
        labelKey: "nav.admin",
        icon: "shield",
      });
    }
    return base;
  }

  return [];
});

const sectionLabel = computed(() => {
  if (isFeedSection.value) return t("nav.sectionFeed");
  if (isTasksSection.value) return t("nav.sectionTime");
  return t("nav.sectionDefault");
});

function isActive(to: string) {
  if (to === "/tasks") {
    return route.path === "/tasks" || route.path.startsWith("/tasks/");
  }
  return route.path === to || route.path.startsWith(`${to}/`);
}

// Mount global keyboard shortcuts exactly once.
useShortcuts();

const themeCycle: Record<
  typeof settings.value.theme,
  typeof settings.value.theme
> = {
  system: "light",
  light: "dark",
  dark: "system",
};

function cycleTheme() {
  update("theme", themeCycle[settings.value.theme]);
}

const themeLabel = computed(() => {
  if (settings.value.theme === "system") return t("nav.themeAuto");
  return settings.value.theme === "dark"
    ? t("nav.themeDark")
    : t("nav.themeLight");
});

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
  <div class="min-h-screen flex flex-col bg-slate-50">
    <a href="#main-content" class="skip-link">{{ $t("nav.skipToContent") }}</a>

    <AppHeader />

    <div class="flex min-h-0 flex-1">
      <aside
        v-if="showModuleSidebar"
        class="hidden md:flex w-56 shrink-0 bg-white border-r border-slate-200 flex-col no-print"
      >
        <div class="px-4 py-4 border-b border-slate-200">
          <p
            class="text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {{ sectionLabel }}
          </p>
          <p class="mt-0.5 text-[11px] text-slate-400">
            {{
              isFeedSection
                ? $t("nav.sectionFeedHint")
                : $t("nav.sectionTasksHint")
            }}
          </p>
        </div>

        <nav class="flex-1 p-3 space-y-1" :aria-label="$t('nav.moduleAria')">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition"
            :class="
              isActive(item.to)
                ? 'bg-brand-50 text-brand-700'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            "
          >
            <svg
              v-if="item.icon === 'calendar'"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="w-4 h-4"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
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
              class="w-4 h-4"
            >
              <polygon
                points="12 2 2 7 12 12 22 7 12 2"
                stroke-linejoin="round"
              />
              <polyline points="2 17 12 22 22 17" stroke-linejoin="round" />
              <polyline points="2 12 12 17 22 12" stroke-linejoin="round" />
            </svg>
            <svg
              v-else-if="item.icon === 'cog'"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="w-4 h-4"
            >
              <circle cx="12" cy="12" r="3" />
              <path
                d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 005.6 15a1.65 1.65 0 00-1.51-1H4a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H10a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V10a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
              />
            </svg>
            <svg
              v-else-if="item.icon === 'shield'"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="w-4 h-4"
            >
              <path
                d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"
                stroke-linejoin="round"
              />
            </svg>
            <svg
              v-else-if="item.icon === 'feed'"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="w-4 h-4"
            >
              <path
                d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"
                stroke-linejoin="round"
              />
              <polyline points="16 6 12 2 8 6" stroke-linejoin="round" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            <svg
              v-else
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="w-4 h-4"
            >
              <path d="M3 3v18h18" stroke-linecap="round" />
              <path
                d="M7 14l4-4 4 4 5-7"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            {{ $t(item.labelKey) }}
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
              <kbd
                class="px-1 py-0.5 bg-slate-200 rounded text-[10px] font-mono"
                >⌘</kbd
              >
              <kbd
                class="px-1 py-0.5 bg-slate-200 rounded text-[10px] font-mono"
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
            <kbd
              class="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono"
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

      <main
        id="main-content"
        class="flex-1 min-w-0 flex flex-col"
        :class="showModuleSidebar ? 'pb-20 md:pb-0' : ''"
        tabindex="-1"
      >
        <slot />
      </main>
    </div>

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
            class="absolute inset-x-0 bottom-[5.5rem] mx-3 mb-2 rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 overflow-hidden"
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
      v-if="showModuleSidebar && navItems.length"
      class="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 no-print"
    >
      <nav
        class="grid grid-flow-col auto-cols-fr"
        :aria-label="$t('nav.moduleMobileAria')"
      >
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium"
          :class="isActive(item.to) ? 'text-brand-700' : 'text-slate-500'"
          @click="closeMobileMore"
        >
          <svg
            v-if="item.icon === 'calendar'"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-5 h-5"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
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
            class="w-5 h-5"
          >
            <polygon
              points="12 2 2 7 12 12 22 7 12 2"
              stroke-linejoin="round"
            />
            <polyline points="2 17 12 22 22 17" stroke-linejoin="round" />
            <polyline points="2 12 12 17 22 12" stroke-linejoin="round" />
          </svg>
          <svg
            v-else-if="item.icon === 'cog'"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-5 h-5"
          >
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 005.6 15a1.65 1.65 0 00-1.51-1H4a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H10a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V10a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
            />
          </svg>
          <svg
            v-else-if="item.icon === 'shield'"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-5 h-5"
          >
            <path
              d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"
              stroke-linejoin="round"
            />
          </svg>
          <svg
            v-else-if="item.icon === 'feed'"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-5 h-5"
          >
            <path
              d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"
              stroke-linejoin="round"
            />
            <polyline points="16 6 12 2 8 6" stroke-linejoin="round" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          <svg
            v-else
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-5 h-5"
          >
            <path d="M3 3v18h18" stroke-linecap="round" />
            <path
              d="M7 14l4-4 4 4 5-7"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
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

    <ToastStack />
    <CommandPalette />
    <QuickCapture v-if="showTaskChrome" />
    <ShortcutsHelp />
    <TimerPill v-if="showTaskChrome" />
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
