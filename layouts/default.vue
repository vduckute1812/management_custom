<script setup lang="ts">
const route = useRoute();
const { isFeedSection, isTasksSection, isMoneySection, navItems } =
  useAppSection();

const isHub = computed(() => route.path === "/");
/**
 * Marketing-style surfaces get the footer with the legal links. The feed is
 * excluded on purpose: an infinite-scroll list never reaches its own footer.
 */
const showFooter = computed(
  () => isHub.value || route.path === "/privacy" || route.path === "/terms",
);
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
  return isFeedSection.value || isTasksSection.value || isMoneySection.value;
});

// Mount global keyboard shortcuts exactly once.
useShortcuts();
</script>

<template>
  <div class="min-h-screen flex flex-col bg-slate-50">
    <a href="#main-content" class="skip-link">{{ $t("nav.skipToContent") }}</a>

    <AppHeader />

    <div class="flex min-h-0 flex-1">
      <AppModuleSidebar v-if="showModuleSidebar" />

      <main
        id="main-content"
        class="flex min-h-0 min-w-0 flex-1 flex-col"
        :class="
          showModuleSidebar
            ? 'pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0'
            : ''
        "
        tabindex="-1"
      >
        <slot />
      </main>
    </div>

    <AppFooter v-if="showFooter" />

    <AppMobileModuleNav v-if="showModuleSidebar && navItems.length" />

    <ToastStack />
    <LazyCommandPalette />
    <QuickCapture v-if="showTaskChrome" />
    <LazyShortcutsHelp />
    <TimerPill v-if="showTaskChrome" />
  </div>
</template>
