<script setup lang="ts">
definePageMeta({ layout: false });

const auth = useAuth();
const { t } = useI18n();

useSeoMeta({
  title: computed(() => t("seo.forgotPassword")),
});

const email = ref("");
const busy = ref(false);
const error = ref<string | null>(null);
const sent = ref(false);

async function onSubmit() {
  if (busy.value) return;
  error.value = null;
  busy.value = true;
  try {
    await auth.requestPasswordReset(email.value.trim());
    sent.value = true;
  } catch (err: unknown) {
    error.value =
      (err as { data?: { statusMessage?: string }; statusMessage?: string })
        ?.data?.statusMessage ??
      (err as { statusMessage?: string }).statusMessage ??
      t("auth.forgotPasswordFailed");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div
    class="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 py-12"
  >
    <div class="w-full max-w-sm">
      <div class="flex items-center justify-center gap-3 mb-8">
        <AppLogo size-class="h-11 w-11" rounded-class="rounded-xl" />
        <div class="text-left">
          <p class="text-base font-semibold text-slate-900 leading-tight">
            {{ $t("auth.forgotPasswordTitle") }}
          </p>
          <p class="text-xs text-slate-500">
            {{ $t("auth.forgotPasswordSubtitle") }}
          </p>
        </div>
      </div>

      <div
        v-if="sent"
        class="bg-white border border-emerald-200 rounded-xl shadow-sm p-6 space-y-3"
      >
        <p class="text-sm font-semibold text-emerald-700">
          {{ $t("auth.resetLinkSentTitle") }}
        </p>
        <p class="text-sm text-slate-700">
          {{ $t("auth.resetLinkSentBody") }}
        </p>
        <NuxtLink
          to="/login"
          class="block w-full py-2 rounded-md text-sm font-semibold text-center text-white bg-brand-600 hover:bg-brand-700 transition"
        >
          {{ $t("auth.goToSignIn") }}
        </NuxtLink>
      </div>

      <form
        v-else
        class="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4"
        @submit.prevent="onSubmit"
      >
        <div>
          <label
            for="forgot-email"
            class="block text-xs font-medium text-slate-600 mb-1"
            >{{ $t("auth.email") }}</label
          >
          <input
            id="forgot-email"
            v-model="email"
            type="email"
            autocomplete="email"
            required
            class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
        </div>

        <p
          v-if="error"
          class="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2"
        >
          {{ error }}
        </p>

        <button
          type="submit"
          :disabled="busy"
          class="w-full py-2 rounded-md text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          {{ busy ? $t("auth.sendingResetLink") : $t("auth.sendResetLink") }}
        </button>

        <div class="flex items-center justify-center text-xs">
          <NuxtLink to="/login" class="text-brand-600 hover:underline">
            {{ $t("auth.backToSignIn") }}
          </NuxtLink>
        </div>
      </form>
    </div>
  </div>
</template>
