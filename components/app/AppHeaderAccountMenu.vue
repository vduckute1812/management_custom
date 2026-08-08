<script setup lang="ts">
import { ROLE_I18N_KEYS } from "~/types/task";
import type { AuthUser } from "~/types/auth";

const props = defineProps<{
  user: AuthUser;
  friendRequestCount: number;
}>();

const router = useRouter();
const auth = useAuth();
const { t } = useI18n();
const route = useRoute();

const menuOpen = ref(false);
const menuRoot = ref<HTMLElement | null>(null);
const menuTrigger = ref<HTMLButtonElement | null>(null);
const menuPanel = ref<HTMLElement | null>(null);
const menuStyle = ref<Record<string, string>>({});

const displayName = computed(
  () => props.user.name || props.user.email || t("nav.account"),
);

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

function onViewportChange() {
  if (menuOpen.value) updateMenuPosition();
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

watch(
  () => route.fullPath,
  () => closeMenu(),
);
</script>

<template>
  <div ref="menuRoot" class="relative shrink-0">
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
        :name="props.user.name"
        :email="props.user.email"
        :avatar-url="props.user.avatarUrl"
        size="md"
      />
      <span class="hidden min-w-0 text-left sm:block">
        <span class="block truncate text-xs font-medium text-slate-800">
          {{ displayName }}
        </span>
        <span class="block text-[10px] uppercase tracking-wider text-slate-400">
          {{ t(ROLE_I18N_KEYS[props.user.role] ?? "roles.normal") }}
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
          to="/friends"
          role="menuitem"
          class="flex items-center justify-between gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 md:hidden"
          @click="closeMenu"
        >
          <span>{{ $t("nav.friends") }}</span>
          <span
            v-if="props.friendRequestCount > 0"
            class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold leading-none text-white"
            :aria-label="
              $t('friends.incomingBadge', { count: props.friendRequestCount })
            "
          >
            {{
              props.friendRequestCount > 99 ? "99+" : props.friendRequestCount
            }}
          </span>
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
          <LanguageSwitcher id="header-language" variant="select" />
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
</template>
