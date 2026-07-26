<script setup lang="ts">
const auth = useAuth();
const { t } = useI18n();

useSeoMeta({
  title: computed(() => t("seo.home")),
  description: computed(() => t("seo.homeDescription")),
});
</script>

<template>
  <div class="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-3xl flex-col justify-center px-4 py-10 sm:px-6">
    <header class="max-w-2xl">
      <p class="text-sm font-medium uppercase tracking-wide text-brand-600">
        {{ $t("home.brand") }}
      </p>
      <h1 class="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
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

    <section class="mt-10 space-y-6 text-sm leading-relaxed text-slate-600">
      <div>
        <h2 class="text-base font-semibold text-slate-900">{{ $t("home.feedTitle") }}</h2>
        <p class="mt-1.5">
          {{ $t("home.feedBody") }}
        </p>
      </div>
      <div>
        <h2 class="text-base font-semibold text-slate-900">{{ $t("home.timeTitle") }}</h2>
        <p class="mt-1.5">
          {{ $t("home.timeBody") }}
        </p>
      </div>
      <p class="text-slate-500">
        {{
          auth.isAuthenticated.value ? $t("home.cta") : $t("home.ctaGuest")
        }}
      </p>
    </section>
  </div>
</template>
