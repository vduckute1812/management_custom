<script setup lang="ts">
import { ROLE_I18N_KEYS } from "~/types/task";
import { INTL_LOCALE, type AppLocale } from "~/types/locale";

const auth = useAuth();
const router = useRouter();
const { t } = useI18n();
const { settings } = useSettings();

useSeoMeta({
  title: computed(() => t("seo.profile")),
  description: computed(() => t("seo.profileDescription")),
});

const user = computed(() => auth.user.value);

const userInitial = computed(() => {
  const src = user.value?.name || user.value?.email || "";
  return src.charAt(0).toUpperCase() || "?";
});

const memberSince = computed(() => {
  if (!user.value) return "";
  const tag =
    INTL_LOCALE[settings.value.locale as AppLocale] ?? settings.value.locale;
  return new Date(user.value.createdAt).toLocaleDateString(tag);
});

async function onLogout() {
  await auth.logout();
  await router.replace("/");
}

onMounted(async () => {
  if (auth.isAuthenticated.value) {
    await auth.fetchMe().catch(() => undefined);
  }
});
</script>

<template>
  <div class="mx-auto max-w-xl px-4 py-8 sm:px-6">
    <h1 class="text-2xl font-semibold tracking-tight text-slate-900">
      {{ $t("profile.title") }}
    </h1>
    <p class="mt-1 text-sm text-slate-600">
      {{ $t("profile.subtitle") }}
    </p>

    <div
      v-if="user"
      class="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div class="flex items-center gap-4">
        <div
          class="flex h-14 w-14 items-center justify-center rounded-full bg-slate-200 text-lg font-semibold text-slate-700"
          aria-hidden="true"
        >
          {{ userInitial }}
        </div>
        <div class="min-w-0">
          <p class="truncate text-lg font-semibold text-slate-900">
            {{ user.name || $t("profile.unnamedUser") }}
          </p>
          <p class="truncate text-sm text-slate-500">{{ user.email }}</p>
        </div>
      </div>

      <dl class="mt-6 space-y-3 text-sm">
        <div class="flex justify-between gap-4 border-t border-slate-100 pt-3">
          <dt class="text-slate-500">{{ $t("profile.role") }}</dt>
          <dd class="font-medium text-slate-800">
            {{ t(ROLE_I18N_KEYS[user.role] ?? "roles.normal") }}
          </dd>
        </div>
        <div class="flex justify-between gap-4 border-t border-slate-100 pt-3">
          <dt class="text-slate-500">{{ $t("profile.emailVerified") }}</dt>
          <dd class="font-medium text-slate-800">
            {{ user.emailVerified ? $t("profile.yes") : $t("profile.no") }}
          </dd>
        </div>
        <div class="flex justify-between gap-4 border-t border-slate-100 pt-3">
          <dt class="text-slate-500">{{ $t("profile.memberSince") }}</dt>
          <dd class="font-medium tabular-nums text-slate-800">
            {{ memberSince }}
          </dd>
        </div>
      </dl>

      <div class="mt-6 flex flex-wrap gap-3">
        <NuxtLink
          to="/settings"
          class="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          {{ $t("profile.settings") }}
        </NuxtLink>
        <button
          type="button"
          class="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
          @click="onLogout"
        >
          {{ $t("profile.logout") }}
        </button>
      </div>
    </div>

    <p v-else class="mt-8 text-sm text-slate-500">
      {{ $t("profile.signInPrompt") }}
    </p>
  </div>
</template>
