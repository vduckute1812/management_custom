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

const modules = computed(() => [
  { to: "/feed", label: t("nav.feed"), body: t("home.feedBody") },
  {
    to: "/tasks",
    label: t("nav.timeManagement"),
    body: t("home.timeBody"),
  },
  { to: "/money", label: t("nav.money"), body: t("home.moneyBody") },
  { to: "/chat", label: t("nav.chat"), body: t("home.chatBody") },
  { to: "/friends", label: t("nav.friends"), body: t("home.friendsBody") },
]);
</script>

<template>
  <div class="relative isolate flex-1 overflow-hidden">
    <div
      class="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      aria-hidden="true"
    >
      <div
        class="absolute inset-0 bg-gradient-to-b from-brand-50/80 via-slate-50 to-slate-50"
      />
      <div
        class="absolute -left-24 -top-40 h-[32rem] w-[32rem] rounded-full bg-brand-200/35 blur-3xl home-ambient-brand"
      />
      <div
        class="absolute -right-28 top-24 h-[28rem] w-[28rem] rounded-full bg-brand-100/45 blur-3xl home-ambient-brand"
      />
      <div
        class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-300 to-transparent"
      />
    </div>

    <div
      class="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-20"
    >
      <!-- Hero: brand + one headline + one sentence + CTA — no cards -->
      <section class="relative min-h-[70vh] max-w-3xl">
        <header>
          <div class="flex items-center gap-3">
            <img
              src="/branding/google-oauth-logo.png"
              width="56"
              height="56"
              decoding="async"
              alt=""
              aria-hidden="true"
              class="h-14 w-14 shrink-0 rounded-[0.95rem] shadow-sm ring-1 ring-brand-200/80"
            />
            <div class="min-w-0">
              <p
                class="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl"
              >
                {{ $t("home.brand") }}
              </p>
              <p class="text-sm font-medium tracking-wide text-brand-700">
                {{ $t("home.brandTagline") }}
              </p>
            </div>
          </div>

          <h1
            class="mt-8 max-w-2xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl lg:leading-[1.1]"
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
              class="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
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
      </section>

      <!-- Modules: link rows, not hero cards -->
      <section
        class="mt-6 border-t border-slate-200/80 pt-12 sm:mt-8 sm:pt-16"
        :aria-label="$t('home.modulesTitle')"
      >
        <div class="max-w-2xl">
          <div class="flex items-center gap-3">
            <span class="h-px w-8 bg-brand-500" aria-hidden="true" />
            <p
              class="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600"
            >
              {{ $t("home.modulesTitle") }}
            </p>
          </div>
          <h2
            class="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          >
            {{ $t("home.modulesBody") }}
          </h2>
        </div>

        <ul class="mt-8 divide-y divide-slate-200 border-y border-slate-200">
          <li v-for="mod in modules" :key="mod.to">
            <NuxtLink
              :to="mod.to"
              class="group flex flex-col gap-1 py-5 transition sm:flex-row sm:items-baseline sm:justify-between sm:gap-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <span
                class="text-base font-semibold text-slate-900 group-hover:text-brand-700"
              >
                {{ mod.label }}
              </span>
              <span
                class="max-w-xl text-sm leading-6 text-slate-500 sm:text-right"
              >
                {{ mod.body }}
              </span>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <section class="mt-16 sm:mt-20" :aria-label="$t('home.categoriesTitle')">
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
            class="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white/90 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-600/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
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
