<script setup lang="ts">
import { ROLE_I18N_KEYS } from "~/types/task";

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const { t } = useI18n();
const { unreadTotal } = useChat();
const { incoming, friends, outgoing, refresh: refreshFriends } = useFriends();
const friendRequestCount = computed(() => incoming.value.length);

watch(
  () => auth.isAuthenticatedUi.value,
  async (ok) => {
    if (!ok) {
      friends.value = [];
      incoming.value = [];
      outgoing.value = [];
      return;
    }
    try {
      await refreshFriends();
    } catch {
      /* badge is best-effort */
    }
  },
  { immediate: true },
);

const menuOpen = ref(false);
const menuRoot = ref<HTMLElement | null>(null);
const menuTrigger = ref<HTMLButtonElement | null>(null);
const menuPanel = ref<HTMLElement | null>(null);
const menuStyle = ref<Record<string, string>>({});

const displayName = computed(
  () => auth.userUi.value?.name || auth.userUi.value?.email || t("nav.account"),
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

function updateMenuPosition() {
  const el = menuTrigger.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const menuWidth = 208; // w-52
  const left = Math.min(
    Math.max(8, rect.right - menuWidth),
    window.innerWidth - menuWidth - 8,
  );
  menuStyle.value = {
    top: `${rect.bottom + 6}px`,
    left: `${left}px`,
    width: `${menuWidth}px`,
  };
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
  if (menuOpen.value) {
    nextTick(() => updateMenuPosition());
  }
}

async function onLogout() {
  closeMenu();
  await auth.logout();
  await router.replace("/");
}

function onDocClick(e: MouseEvent) {
  if (!menuOpen.value) return;
  const target = e.target as Node;
  if (menuRoot.value?.contains(target)) return;
  if (menuPanel.value?.contains(target)) return;
  closeMenu();
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") closeMenu();
}

onMounted(() => {
  document.addEventListener("click", onDocClick);
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", onViewportChange);
  window.addEventListener("scroll", onViewportChange, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocClick);
  document.removeEventListener("keydown", onKey);
  window.removeEventListener("resize", onViewportChange);
  window.removeEventListener("scroll", onViewportChange, true);
});

function onViewportChange() {
  if (menuOpen.value) updateMenuPosition();
}

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
        <AppLogo size-class="h-8 w-8" />
        <!-- Mobile hides the brand label (`hidden sm:inline`); keep an sr-only
             name below the sm breakpoint so the logo-only link stays accessible. -->
        <span class="sr-only sm:hidden">{{ $t("nav.brand") }}</span>
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
          v-if="auth.isAuthenticatedUi.value"
          to="/friends"
          class="relative rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-sm"
          :class="
            isMainActive('/friends')
              ? 'bg-brand-50 text-brand-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          "
        >
          {{ $t("nav.friends") }}
          <span
            v-if="friendRequestCount > 0"
            class="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold leading-none text-white"
            :aria-label="
              $t('friends.incomingBadge', { count: friendRequestCount })
            "
          >
            {{ friendRequestCount > 99 ? "99+" : friendRequestCount }}
          </span>
        </NuxtLink>
        <NuxtLink
          v-if="auth.isAuthenticatedUi.value"
          to="/chat"
          class="relative rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-sm"
          :class="
            isMainActive('/chat')
              ? 'bg-brand-50 text-brand-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          "
        >
          {{ $t("nav.chat") }}
          <span
            v-if="unreadTotal > 0"
            class="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold leading-none text-white"
            :aria-label="$t('chat.unreadBadge', { count: unreadTotal })"
          >
            {{ unreadTotal > 99 ? "99+" : unreadTotal }}
          </span>
        </NuxtLink>
        <NuxtLink
          v-if="auth.isAuthenticatedUi.value"
          to="/money"
          class="rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-sm"
          :class="
            isMainActive('/money')
              ? 'bg-brand-50 text-brand-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          "
        >
          {{ $t("nav.money") }}
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
        v-if="auth.isAuthenticatedUi.value && auth.userUi.value"
        ref="menuRoot"
        class="relative shrink-0"
      >
        <button
          ref="menuTrigger"
          type="button"
          class="flex max-w-[12rem] items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:max-w-xs"
          :aria-expanded="menuOpen"
          aria-haspopup="menu"
          :aria-label="$t('nav.accountMenuAria')"
          @click="toggleMenu"
        >
          <UserAvatar
            :name="auth.userUi.value.name"
            :email="auth.userUi.value.email"
            :avatar-url="auth.userUi.value.avatarUrl"
            size="md"
          />
          <span class="hidden min-w-0 text-left sm:block">
            <span class="block truncate text-xs font-medium text-slate-800">
              {{ displayName }}
            </span>
            <span
              class="block text-[10px] uppercase tracking-wider text-slate-400"
            >
              {{ t(ROLE_I18N_KEYS[auth.userUi.value.role] ?? "roles.normal") }}
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

        <Teleport to="body">
          <div
            v-if="menuOpen"
            ref="menuPanel"
            role="menu"
            class="fixed z-50 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
            :style="menuStyle"
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
        </Teleport>
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
