<script setup lang="ts">
const auth = useAuth();
const { unreadTotal } = useChat();
const { incomingCount, friends, incoming, outgoing, refreshBadge } =
  useFriends();
const friendRequestCount = computed(() => incomingCount.value);

watch(
  () => auth.isAuthenticatedUi.value,
  async (ok) => {
    if (!ok) {
      friends.value = [];
      incoming.value = [];
      outgoing.value = [];
      incomingCount.value = 0;
      return;
    }
    try {
      await refreshBadge();
    } catch {
      /* badge is best-effort */
    }
  },
  { immediate: true },
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

      <AppHeaderNav
        :authenticated="auth.isAuthenticatedUi.value"
        :friend-request-count="friendRequestCount"
        :unread-total="unreadTotal"
      />

      <AppHeaderAccountMenu
        v-if="auth.isAuthenticatedUi.value && auth.userUi.value"
        :user="auth.userUi.value"
        :friend-request-count="friendRequestCount"
      />

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
