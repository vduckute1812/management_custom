<script setup lang="ts">
import { ROLE_I18N_KEYS } from "~/types/task";

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const { t } = useI18n();

const menuOpen = ref(false);
const menuRoot = ref<HTMLElement | null>(null);

const userInitial = computed(() => {
  const src = auth.user.value?.name || auth.user.value?.email || "";
  return src.charAt(0).toUpperCase() || "?";
});

const displayName = computed(
  () => auth.user.value?.name || auth.user.value?.email || t("nav.account"),
);

function isMainActive(to: string) {
  if (to === "/") return route.path === "/";
  if (to === "/tasks") {
    return (
      route.path === "/tasks" ||
      route.path.startsWith("/tasks/") ||
      route.path.startsWith("/epics") ||
      route.path.startsWith("/analytics")
    );
  }
  return route.path === to || route.path.startsWith(`${to}/`);
}

function closeMenu() {
  menuOpen.value = false;
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

async function onLogout() {
  closeMenu();
  await auth.logout();
  await router.replace("/");
}

function onDocClick(e: MouseEvent) {
  if (!menuOpen.value || !menuRoot.value) return;
  if (!menuRoot.value.contains(e.target as Node)) closeMenu();
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") closeMenu();
}

onMounted(() => {
  document.addEventListener("click", onDocClick);
  document.addEventListener("keydown", onKey);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocClick);
  document.removeEventListener("keydown", onKey);
});

watch(
  () => route.fullPath,
  () => closeMenu(),
);
</script>

<template>
  <header
    class="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 no-print"
  >
    <div
      class="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-3 sm:px-4 md:px-5"
    >
      <NuxtLink
        to="/"
        class="flex shrink-0 items-center gap-2 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <div
          class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-sm"
          aria-hidden="true"
        >
          M
        </div>
        <span class="hidden text-sm font-semibold text-slate-900 sm:inline">
          {{ $t("nav.brand") }}
        </span>
      </NuxtLink>

      <nav
        class="flex min-w-0 flex-1 items-center justify-end gap-0.5 sm:gap-1"
        :aria-label="$t('nav.primaryAria')"
      >
        <NuxtLink
          to="/"
          class="rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-sm"
          :class="
            isMainActive('/')
              ? 'bg-brand-50 text-brand-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          "
        >
          {{ $t("nav.home") }}
        </NuxtLink>
        <NuxtLink
          to="/feed"
          class="rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-sm"
          :class="
            isMainActive('/feed')
              ? 'bg-brand-50 text-brand-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          "
        >
          {{ $t("nav.feed") }}
        </NuxtLink>
        <NuxtLink
          to="/tasks"
          class="rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-sm"
          :class="
            isMainActive('/tasks')
              ? 'bg-brand-50 text-brand-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          "
        >
          <span class="sm:hidden">{{ $t("nav.timeShort") }}</span>
          <span class="hidden sm:inline">{{ $t("nav.timeManagement") }}</span>
        </NuxtLink>
      </nav>

      <div
        v-if="auth.isAuthenticated.value && auth.user.value"
        ref="menuRoot"
        class="relative shrink-0"
      >
        <button
          type="button"
          class="flex max-w-[12rem] items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:max-w-xs"
          :aria-expanded="menuOpen"
          aria-haspopup="menu"
          :aria-label="$t('nav.accountMenuAria')"
          @click="toggleMenu"
        >
          <span
            class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700"
            aria-hidden="true"
          >
            {{ userInitial }}
          </span>
          <span class="hidden min-w-0 text-left sm:block">
            <span class="block truncate text-xs font-medium text-slate-800">
              {{ displayName }}
            </span>
            <span
              class="block text-[10px] uppercase tracking-wider text-slate-400"
            >
              {{ t(ROLE_I18N_KEYS[auth.user.value.role] ?? "roles.normal") }}
            </span>
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="hidden h-4 w-4 text-slate-400 sm:block"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clip-rule="evenodd"
            />
          </svg>
        </button>

        <div
          v-if="menuOpen"
          role="menu"
          class="absolute right-0 mt-1.5 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          <NuxtLink
            to="/profile"
            role="menuitem"
            class="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            @click="closeMenu"
          >
            {{ $t("nav.profile") }}
          </NuxtLink>
          <NuxtLink
            to="/settings"
            role="menuitem"
            class="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            @click="closeMenu"
          >
            {{ $t("nav.settings") }}
          </NuxtLink>
          <div class="border-t border-slate-100 px-3 py-2" role="none">
            <LanguageSwitcher variant="select" id="header-language" />
          </div>
          <button
            type="button"
            role="menuitem"
            class="w-full px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
            @click="onLogout"
          >
            {{ $t("nav.logout") }}
          </button>
        </div>
      </div>

      <div v-else class="flex shrink-0 items-center gap-2">
        <NuxtLink
          to="/login"
          class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:text-sm"
        >
          {{ $t("nav.login") }}
        </NuxtLink>
        <NuxtLink
          to="/signup"
          class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:text-sm"
        >
          {{ $t("nav.register") }}
        </NuxtLink>
      </div>
    </div>
  </header>
</template>
