<script setup lang="ts">
import { ROLE_LABELS } from "~/types/task";

const route = useRoute();
const router = useRouter();
const { paletteOpen, helpOpen } = useUiOverlays();
const { settings, update, effectiveTheme } = useSettings();
const auth = useAuth();

interface NavItem {
  to: string;
  label: string;
  icon: "calendar" | "layers" | "chart" | "cog" | "shield";
}

const navItems = computed<NavItem[]>(() => {
  const base: NavItem[] = [
    { to: "/", label: "Dashboard", icon: "calendar" },
    { to: "/epics", label: "Epics", icon: "layers" },
    { to: "/analytics", label: "Analytics", icon: "chart" },
    { to: "/settings", label: "Settings", icon: "cog" },
  ];
  if (auth.isAdmin.value) {
    base.splice(3, 0, { to: "/admin", label: "Admin", icon: "shield" });
  }
  return base;
});

function isActive(to: string) {
  return to === "/" ? route.path === "/" : route.path.startsWith(to);
}

async function onLogout() {
  await auth.logout();
  await router.replace("/login");
}

const userInitial = computed(() => {
  const src = auth.user.value?.name || auth.user.value?.email || "";
  return src.charAt(0).toUpperCase() || "?";
});

// Mount global keyboard shortcuts exactly once.
useShortcuts();

const themeCycle: Record<typeof settings.value.theme, typeof settings.value.theme> = {
  system: "light",
  light: "dark",
  dark: "system",
};

function cycleTheme() {
  update("theme", themeCycle[settings.value.theme]);
}

const themeLabel = computed(() => {
  if (settings.value.theme === "system") return "Auto";
  return settings.value.theme === "dark" ? "Dark" : "Light";
});
</script>

<template>
  <div class="min-h-screen flex bg-slate-50">
    <a href="#main-content" class="skip-link">Skip to main content</a>

    <aside
      class="hidden md:flex w-60 shrink-0 bg-white border-r border-slate-200 flex-col no-print"
    >
      <div class="px-5 py-5 border-b border-slate-200">
        <div class="flex items-center gap-2">
          <div
            class="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold shadow-sm"
          >
            M
          </div>
          <div>
            <p class="text-sm font-semibold text-slate-900 leading-tight">
              Management
            </p>
            <p class="text-[11px] text-slate-500">Local task analytics</p>
          </div>
        </div>
      </div>

      <nav class="flex-1 p-3 space-y-1" aria-label="Main">
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
            <polygon points="12 2 2 7 12 12 22 7 12 2" stroke-linejoin="round" />
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
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 005.6 15a1.65 1.65 0 00-1.51-1H4a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H10a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V10a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
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
            v-else
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-4 h-4"
          >
            <path d="M3 3v18h18" stroke-linecap="round" />
            <path d="M7 14l4-4 4 4 5-7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          {{ item.label }}
        </NuxtLink>
      </nav>

      <div
        v-if="auth.user.value"
        class="px-3 py-3 border-t border-slate-200 flex items-center gap-2.5"
      >
        <div
          class="w-8 h-8 rounded-full bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center"
        >
          {{ userInitial }}
        </div>
        <div class="flex-1 min-w-0">
          <p
            class="text-xs font-medium text-slate-700 truncate"
            :title="auth.user.value.email"
          >
            {{ auth.user.value.name || auth.user.value.email }}
          </p>
          <p class="text-[10px] uppercase tracking-wider text-slate-400">
            {{ ROLE_LABELS[auth.user.value.role] ?? "Member" }}
          </p>
        </div>
        <button
          type="button"
          class="text-[11px] text-slate-500 hover:text-rose-600 px-1.5 py-1 rounded"
          title="Sign out"
          @click="onLogout"
        >
          Sign out
        </button>
      </div>

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
            Quick jump
          </span>
          <span class="flex items-center gap-0.5">
            <kbd class="px-1 py-0.5 bg-slate-200 rounded text-[10px] font-mono">⌘</kbd>
            <kbd class="px-1 py-0.5 bg-slate-200 rounded text-[10px] font-mono">K</kbd>
          </span>
        </button>
        <button
          type="button"
          class="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-[11px] text-slate-500 hover:bg-slate-100"
          @click="helpOpen = true"
        >
          <span>Shortcuts</span>
          <kbd class="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono">?</kbd>
        </button>
        <button
          type="button"
          class="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-[11px] text-slate-500 hover:bg-slate-100"
          :aria-label="`Theme: ${themeLabel} (click to cycle)`"
          :title="
            settings.theme === 'system'
              ? `Theme: Auto · currently ${effectiveTheme}`
              : `Theme: ${themeLabel}`
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
            Theme
          </span>
          <span class="text-[10px] tabular-nums text-slate-400">
            {{ themeLabel }}
          </span>
        </button>
      </div>
    </aside>

    <main
      id="main-content"
      class="flex-1 min-w-0 flex flex-col pb-14 md:pb-0"
      tabindex="-1"
    >
      <slot />
    </main>

    <!-- Mobile bottom nav -->
    <nav
      class="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 grid grid-flow-col auto-cols-fr no-print"
      aria-label="Main (mobile)"
    >
      <NuxtLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium"
        :class="isActive(item.to) ? 'text-brand-700' : 'text-slate-500'"
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
          <polygon points="12 2 2 7 12 12 22 7 12 2" stroke-linejoin="round" />
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
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 005.6 15a1.65 1.65 0 00-1.51-1H4a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H10a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V10a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
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
          v-else
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="w-5 h-5"
        >
          <path d="M3 3v18h18" stroke-linecap="round" />
          <path d="M7 14l4-4 4 4 5-7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        {{ item.label }}
      </NuxtLink>
    </nav>

    <ToastStack />
    <CommandPalette />
    <QuickCapture />
    <ShortcutsHelp />
    <TimerPill />
  </div>
</template>
