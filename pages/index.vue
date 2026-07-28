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

// Load topic chips during SSR so the hub HTML Google indexes isn't empty.
if (import.meta.server || !categories.value.length) {
  await refreshCategories().catch(() => undefined);
}

onMounted(() => {
  if (!categories.value.length) {
    refreshCategories().catch(() => undefined);
  }
});

function catLabel(cat: { slug: string; name: string }) {
  return categoryDisplayName(cat, t, te);
}
</script>

<template>
  <div class="relative isolate flex-1 overflow-hidden">
    <div
      class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[38rem] overflow-hidden"
      aria-hidden="true"
    >
      <div
        class="absolute -left-24 -top-40 h-[30rem] w-[30rem] rounded-full bg-brand-200/40 blur-3xl home-ambient-brand"
      />
      <div
        class="absolute -right-20 top-10 h-[26rem] w-[26rem] rounded-full bg-violet-100/60 blur-3xl home-ambient-violet"
      />
      <div
        class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-300 to-transparent"
      />
    </div>

    <div
      class="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-20"
    >
      <section
        class="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16"
      >
        <header>
          <div
            class="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1.5 shadow-sm backdrop-blur"
          >
            <span class="relative flex h-2 w-2" aria-hidden="true">
              <span
                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60"
              />
              <span
                class="relative inline-flex h-2 w-2 rounded-full bg-brand-600"
              />
            </span>
            <span class="text-xs font-semibold tracking-wide text-brand-700">
              {{ $t("home.brand") }}
            </span>
          </div>

          <h1
            class="mt-6 max-w-2xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl lg:leading-[1.08]"
          >
            {{
              auth.userUi.value?.name
                ? $t("home.welcomeNamed", { name: auth.userUi.value.name })
                : $t("home.welcome")
            }}
          </h1>
          <p
            class="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg"
          >
            {{ $t("home.intro") }}
          </p>

          <div class="mt-8 flex flex-col gap-3 sm:flex-row">
            <NuxtLink
              to="/feed"
              class="group inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              {{ $t("nav.feed") }}
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                class="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              >
                <path
                  fill-rule="evenodd"
                  d="M3 10a.75.75 0 01.75-.75h10.69L10.22 5.03a.75.75 0 011.06-1.06l5.5 5.5a.75.75 0 010 1.06l-5.5 5.5a.75.75 0 11-1.06-1.06l4.22-4.22H3.75A.75.75 0 013 10z"
                  clip-rule="evenodd"
                />
              </svg>
            </NuxtLink>
            <NuxtLink
              to="/tasks"
              class="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="h-4 w-4 text-brand-600"
                aria-hidden="true"
              >
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M8 3v4M16 3v4M3 10h18" stroke-linecap="round" />
              </svg>
              {{ $t("nav.timeManagement") }}
            </NuxtLink>
          </div>

          <p class="mt-4 max-w-xl text-xs leading-5 text-slate-500">
            {{
              auth.isAuthenticatedUi.value
                ? $t("home.cta")
                : $t("home.ctaGuest")
            }}
          </p>
        </header>

        <div class="relative">
          <div
            class="absolute -inset-4 -z-10 rotate-2 rounded-[2rem] home-preview-glow blur-sm"
            aria-hidden="true"
          />
          <div
            class="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/85 p-3 shadow-2xl shadow-slate-900/10 backdrop-blur sm:p-4"
          >
            <div class="flex items-center justify-between px-2 pb-3 pt-1">
              <div class="flex items-center gap-2">
                <span class="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span class="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span class="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </div>
              <span
                class="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500"
              >
                {{ $t("nav.brand") }}
              </span>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <NuxtLink
                to="/feed"
                class="group flex min-h-64 flex-col rounded-2xl bg-slate-900 p-5 text-white transition hover:-translate-y-1 hover:shadow-xl sm:min-h-72"
              >
                <span
                  class="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    class="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path d="M4 5h16M4 12h16M4 19h10" stroke-linecap="round" />
                    <circle cx="19" cy="19" r="2" />
                  </svg>
                </span>
                <div class="mt-auto">
                  <p
                    class="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300"
                  >
                    {{ $t("nav.feed") }}
                  </p>
                  <h2 class="mt-2 text-xl font-semibold">
                    {{ $t("home.feedTitle") }}
                  </h2>
                  <p class="mt-2 line-clamp-3 text-sm leading-6 text-slate-300">
                    {{ $t("home.feedBody") }}
                  </p>
                  <span
                    class="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-white"
                  >
                    {{ $t("nav.feed") }}
                    <span
                      class="transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                      >→</span
                    >
                  </span>
                </div>
              </NuxtLink>

              <NuxtLink
                to="/tasks"
                class="group flex min-h-64 flex-col overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-b from-brand-50 to-white p-5 transition hover:-translate-y-1 hover:border-brand-300 hover:shadow-xl sm:min-h-72"
              >
                <div class="flex items-center justify-between">
                  <span
                    class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-md shadow-brand-600/20"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                      class="h-5 w-5"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="8" />
                      <path d="M12 8v4l2.5 1.5" stroke-linecap="round" />
                    </svg>
                  </span>
                  <div class="flex gap-1" aria-hidden="true">
                    <span class="h-5 w-1 rounded-full bg-brand-200" />
                    <span class="h-8 w-1 rounded-full bg-brand-400" />
                    <span class="h-6 w-1 rounded-full bg-brand-300" />
                  </div>
                </div>
                <div class="mt-auto">
                  <p
                    class="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600"
                  >
                    {{ $t("nav.timeManagement") }}
                  </p>
                  <h2 class="mt-2 text-xl font-semibold text-slate-900">
                    {{ $t("home.timeTitle") }}
                  </h2>
                  <p class="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
                    {{ $t("home.timeBody") }}
                  </p>
                  <span
                    class="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700"
                  >
                    {{ $t("nav.timeManagement") }}
                    <span
                      class="transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                      >→</span
                    >
                  </span>
                </div>
              </NuxtLink>
            </div>
          </div>
        </div>
      </section>

      <section
        class="mt-16 rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur sm:mt-20 sm:p-8 lg:p-10"
        :aria-label="$t('home.categoriesTitle')"
      >
        <div
          class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div class="max-w-2xl">
            <div class="flex items-center gap-3">
              <span class="h-px w-8 bg-brand-500" aria-hidden="true" />
              <p
                class="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600"
              >
                {{ $t("nav.feed") }}
              </p>
            </div>
            <h2
              class="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
            >
              {{ $t("home.categoriesTitle") }}
            </h2>
            <p class="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              {{ $t("home.categoriesBody") }}
            </p>
          </div>
          <NuxtLink
            to="/feed"
            class="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-brand-700 transition hover:text-brand-800"
          >
            {{ $t("nav.feed") }}
            <span aria-hidden="true">→</span>
          </NuxtLink>
        </div>

        <div
          v-if="categoriesLoading && !categories.length"
          class="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy="true"
        >
          <SkeletonBlock
            v-for="n in 6"
            :key="n"
            height="h-28"
            rounded="rounded-2xl"
          />
        </div>

        <div
          v-else
          class="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <NuxtLink
            v-for="(cat, index) in categories"
            :key="cat.id"
            :to="{ path: '/feed', query: { category: cat.slug } }"
            class="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-600/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <div class="flex items-start justify-between gap-4">
              <span
                class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-sm font-bold text-brand-700 ring-1 ring-brand-100 transition group-hover:bg-brand-600 group-hover:text-white"
                aria-hidden="true"
              >
                {{ String(index + 1).padStart(2, "0") }}
              </span>
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                class="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600"
                aria-hidden="true"
              >
                <path
                  fill-rule="evenodd"
                  d="M3 10a.75.75 0 01.75-.75h10.69L10.22 5.03a.75.75 0 011.06-1.06l5.5 5.5a.75.75 0 010 1.06l-5.5 5.5a.75.75 0 11-1.06-1.06l4.22-4.22H3.75A.75.75 0 013 10z"
                  clip-rule="evenodd"
                />
              </svg>
            </div>
            <p
              class="mt-4 text-sm font-semibold text-slate-900 group-hover:text-brand-700"
            >
              {{ catLabel(cat) }}
            </p>
            <p class="mt-1 text-xs text-slate-500">
              {{
                t(
                  "home.articleCount",
                  { count: cat.postCount ?? 0 },
                  cat.postCount ?? 0,
                )
              }}
            </p>
          </NuxtLink>
        </div>
      </section>
    </div>
  </div>
</template>
