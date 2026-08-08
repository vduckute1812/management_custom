<script setup lang="ts">
const props = defineProps<{
  authenticated: boolean;
  friendRequestCount: number;
  unreadTotal: number;
}>();

const route = useRoute();

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

const linkClass = (to: string) =>
  isMainActive(to)
    ? "bg-brand-50 text-brand-700"
    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900";
</script>

<template>
  <nav
    class="flex min-w-0 flex-1 items-center justify-end gap-0.5 sm:gap-1"
    :aria-label="$t('nav.primaryAria')"
  >
    <NuxtLink
      to="/"
      class="hidden rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:inline-flex sm:px-3 sm:text-sm"
      :class="linkClass('/')"
    >
      {{ $t("nav.home") }}
    </NuxtLink>
    <NuxtLink
      to="/feed"
      class="rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-sm"
      :class="linkClass('/feed')"
    >
      {{ $t("nav.feed") }}
    </NuxtLink>
    <!-- Friends lives in the feed bottom/side nav on phones; keep the
         text link for md+ where the header has room. -->
    <NuxtLink
      v-if="props.authenticated"
      to="/friends"
      class="relative hidden rounded-lg px-2.5 py-1.5 text-xs font-semibold transition md:inline-flex md:px-3 md:text-sm"
      :class="linkClass('/friends')"
    >
      {{ $t("nav.friends") }}
      <span
        v-if="props.friendRequestCount > 0"
        class="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold leading-none text-white"
        :aria-label="
          $t('friends.incomingBadge', { count: props.friendRequestCount })
        "
      >
        {{ props.friendRequestCount > 99 ? "99+" : props.friendRequestCount }}
      </span>
    </NuxtLink>
    <NuxtLink
      v-if="props.authenticated"
      to="/chat"
      class="relative rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-sm"
      :class="linkClass('/chat')"
    >
      {{ $t("nav.chat") }}
      <span
        v-if="props.unreadTotal > 0"
        class="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold leading-none text-white"
        :aria-label="$t('chat.unreadBadge', { count: props.unreadTotal })"
      >
        {{ props.unreadTotal > 99 ? "99+" : props.unreadTotal }}
      </span>
    </NuxtLink>
    <!-- Money is a primary module (with Feed / Time); always keep it in the
         header so phones can reach it without hunting the account menu. -->
    <NuxtLink
      v-if="props.authenticated"
      to="/money"
      class="rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-sm"
      :class="linkClass('/money')"
    >
      {{ $t("nav.money") }}
    </NuxtLink>
    <NuxtLink
      to="/tasks"
      class="rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-sm"
      :class="linkClass('/tasks')"
    >
      <span class="sm:hidden">{{ $t("nav.timeShort") }}</span>
      <span class="hidden sm:inline">{{ $t("nav.timeManagement") }}</span>
    </NuxtLink>
  </nav>
</template>
