<script setup lang="ts">
import type { PostCategory } from "~/types/post";
import { categoryDisplayName } from "~/utils/categoryLabel";

defineProps<{
  categories: PostCategory[];
  categoryFilter: string | null;
  categoriesLoading: boolean;
  isAuthenticated: boolean;
}>();

const emit = defineEmits<{
  filter: [id: string | null];
  compose: [];
}>();

const { t, te } = useI18n();

function catLabel(cat: PostCategory) {
  return categoryDisplayName(cat, t, te);
}
</script>

<template>
  <aside class="sticky top-20 hidden space-y-4 lg:block">
    <section
      class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div class="border-b border-slate-100 px-4 py-3.5">
        <h2
          class="text-xs font-bold uppercase tracking-[0.14em] text-slate-500"
        >
          {{ $t("feed.category") }}
        </h2>
      </div>
      <div
        class="space-y-1 p-2"
        role="group"
        :aria-label="$t('feed.categoryFilterAria')"
      >
        <button
          type="button"
          class="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition"
          :class="
            !categoryFilter
              ? 'bg-brand-50 text-brand-700'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          "
          :disabled="categoriesLoading"
          @click="emit('filter', null)"
        >
          <span class="flex items-center gap-2.5">
            <span
              class="h-2 w-2 rounded-full"
              :class="!categoryFilter ? 'bg-brand-500' : 'bg-slate-300'"
            />
            {{ $t("feed.all") }}
          </span>
        </button>
        <button
          v-for="cat in categories"
          :key="cat.id"
          type="button"
          class="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition"
          :class="
            categoryFilter === cat.id
              ? 'bg-brand-50 text-brand-700'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          "
          @click="emit('filter', cat.id)"
        >
          <span class="flex min-w-0 items-center gap-2.5">
            <span
              class="h-2 w-2 shrink-0 rounded-full"
              :class="
                categoryFilter === cat.id ? 'bg-brand-500' : 'bg-slate-300'
              "
            />
            <span class="truncate">{{ catLabel(cat) }}</span>
          </span>
          <span
            v-if="cat.postCount !== undefined"
            class="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-500"
          >
            {{ cat.postCount }}
          </span>
        </button>
      </div>
    </section>

    <section
      class="relative overflow-hidden rounded-2xl bg-slate-900 p-5 text-white shadow-sm"
    >
      <div
        class="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-500/30 blur-2xl"
        aria-hidden="true"
      />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        class="relative mb-4 h-6 w-6 text-brand-300"
        aria-hidden="true"
      >
        <path d="M8 12h8M12 8v8" stroke-linecap="round" />
        <circle cx="12" cy="12" r="9" />
      </svg>
      <p class="relative text-sm font-semibold leading-5">
        {{ $t("feed.title") }}
      </p>
      <p class="relative mt-2 text-xs leading-5 text-slate-300">
        {{
          isAuthenticated ? $t("feed.subtitleAuth") : $t("feed.subtitleGuest")
        }}
      </p>
      <button
        v-if="isAuthenticated"
        type="button"
        class="relative mt-4 w-full rounded-xl bg-white px-3 py-2.5 text-xs font-semibold text-slate-900 transition hover:bg-brand-50"
        @click="emit('compose')"
      >
        {{ $t("feed.composer.writeAPost") }}
      </button>
      <NuxtLink
        v-if="isAuthenticated"
        to="/feed/write"
        class="relative mt-2 block w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-center text-xs font-semibold text-white transition hover:bg-white/20"
      >
        {{ $t("manuscript.writeCta") }}
      </NuxtLink>
    </section>
  </aside>
</template>
