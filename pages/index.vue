<script setup lang="ts">
import { categoryDisplayName } from "~/utils/categoryLabel";

const auth = useAuth();
const { t, te } = useI18n();
const {
  categories,
  loading: categoriesLoading,
  refresh: refreshCategories,
} = useCategories();

useSeoMeta({
  title: computed(() => t("seo.home")),
  description: computed(() => t("seo.homeDescription")),
});

onMounted(() => {
  refreshCategories().catch(() => undefined);
});

function catLabel(cat: { slug: string; name: string }) {
  return categoryDisplayName(cat, t, te);
}
</script>

<template>
  <div
    class="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-3xl flex-col justify-center px-4 py-10 sm:px-6"
  >
    <header class="max-w-2xl">
      <p class="text-sm font-medium uppercase tracking-wide text-brand-600">
        {{ $t("home.brand") }}
      </p>
      <h1
        class="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl"
      >
        {{
          auth.user.value?.name
            ? $t("home.welcomeNamed", { name: auth.user.value.name })
            : $t("home.welcome")
        }}
      </h1>
      <p class="mt-4 text-base leading-relaxed text-slate-600">
        {{ $t("home.intro") }}
      </p>
    </header>

    <section class="mt-10" :aria-label="$t('home.categoriesTitle')">
      <h2 class="text-base font-semibold text-slate-900">
        {{ $t("home.categoriesTitle") }}
      </h2>
      <p class="mt-1.5 text-sm leading-relaxed text-slate-600">
        {{ $t("home.categoriesBody") }}
      </p>

      <div
        v-if="categoriesLoading && !categories.length"
        class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
        aria-busy="true"
      >
        <SkeletonBlock
          v-for="n in 4"
          :key="n"
          height="h-20"
          rounded="rounded-xl"
        />
      </div>

      <div v-else class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <NuxtLink
          v-for="cat in categories"
          :key="cat.id"
          :to="{ path: '/feed', query: { category: cat.slug } }"
          class="group rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-brand-300 hover:bg-brand-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <p
            class="text-sm font-semibold text-slate-900 group-hover:text-brand-700"
          >
            {{ catLabel(cat) }}
          </p>
          <p class="mt-1 text-xs text-slate-500">
            {{
              t("home.articleCount", cat.postCount ?? 0, {
                count: cat.postCount ?? 0,
              })
            }}
          </p>
        </NuxtLink>
      </div>
    </section>

    <section class="mt-10 space-y-6 text-sm leading-relaxed text-slate-600">
      <div>
        <h2 class="text-base font-semibold text-slate-900">
          {{ $t("home.feedTitle") }}
        </h2>
        <p class="mt-1.5">
          {{ $t("home.feedBody") }}
        </p>
      </div>
      <div>
        <h2 class="text-base font-semibold text-slate-900">
          {{ $t("home.timeTitle") }}
        </h2>
        <p class="mt-1.5">
          {{ $t("home.timeBody") }}
        </p>
      </div>
      <p class="text-slate-500">
        {{ auth.isAuthenticated.value ? $t("home.cta") : $t("home.ctaGuest") }}
      </p>
    </section>
  </div>
</template>
