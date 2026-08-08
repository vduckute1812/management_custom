<script setup lang="ts">
const CONTACT_EMAIL = "ducbkdn95@gmail.com";
const year = new Date().getFullYear();
</script>

<template>
  <footer class="no-print border-t border-slate-200 bg-white">
    <div
      class="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"
    >
      <p class="text-xs text-slate-500">
        © {{ year }} {{ $t("nav.brand") }} — {{ $t("footer.rights") }}
      </p>
      <nav
        class="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs"
        :aria-label="$t('footer.aria')"
      >
        <NuxtLink to="/privacy" class="text-slate-500 hover:text-brand-700">
          {{ $t("nav.privacy") }}
        </NuxtLink>
        <NuxtLink to="/terms" class="text-slate-500 hover:text-brand-700">
          {{ $t("nav.terms") }}
        </NuxtLink>
        <a
          :href="`mailto:${CONTACT_EMAIL}`"
          class="text-slate-500 hover:text-brand-700"
        >
          {{ $t("footer.contact") }}
        </a>
      </nav>
    </div>
  </footer>
</template>
