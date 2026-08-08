<script setup lang="ts">
defineProps<{
  isAuthenticated: boolean;
}>();

const emit = defineEmits<{
  compose: [];
}>();
</script>

<template>
  <header
    class="relative border-b border-slate-200 bg-white px-4 py-7 sm:px-6 sm:py-9"
  >
    <div class="mx-auto max-w-[1180px]">
      <div class="flex items-start justify-between gap-6">
        <div class="max-w-2xl">
          <div class="mb-3 flex items-center gap-2">
            <span
              class="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-200"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                class="h-4 w-4"
              >
                <path d="M4 5.5h16v11H8l-4 3v-14Z" stroke-linejoin="round" />
                <path d="M8 9h8M8 13h5" stroke-linecap="round" />
              </svg>
            </span>
            <span
              class="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700"
            >
              {{ $t("home.brand") }}
            </span>
          </div>
          <h1
            class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          >
            {{ $t("feed.title") }}
          </h1>
          <p class="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            <template v-if="isAuthenticated">
              {{ $t("feed.subtitleAuth") }}
            </template>
            <template v-else>
              {{ $t("feed.subtitleGuest") }}
            </template>
          </p>
        </div>

        <div
          v-if="isAuthenticated"
          class="hidden shrink-0 items-center gap-2 lg:flex"
        >
          <NuxtLink
            to="/feed/write"
            class="feed-manuscript-btn inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:-translate-y-0.5"
          >
            {{ $t("manuscript.writeCta") }}
          </NuxtLink>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-200 transition hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md"
            @click="emit('compose')"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" stroke-linecap="round" />
            </svg>
            {{ $t("feed.composer.writeAPost") }}
          </button>
        </div>
      </div>
    </div>
  </header>
</template>
