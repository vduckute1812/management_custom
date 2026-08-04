<script setup lang="ts">
definePageMeta({ layout: false });

// Already-authenticated visitors are redirected away by the global auth
// middleware (see middleware/auth.global.ts), so we only handle the
// unauthenticated sign-in flow here.
const auth = useAuth();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();

useSeoMeta({
  title: computed(() => t("seo.login")),
});

const email = ref("");
const password = ref("");
const busy = ref(false);
const error = ref<string | null>(null);
const googleEnabled = ref(false);

const OAUTH_ERROR_KEYS: Record<string, string> = {
  denied: "auth.googleDenied",
  state: "auth.googleStateInvalid",
  config: "auth.googleNotConfigured",
  email: "auth.googleEmailUnverified",
  conflict: "auth.googleConflict",
  unverified: "auth.googleUnverifiedExists",
  auth: "auth.googleAuthRequired",
  failed: "auth.googleFailed",
  google: "auth.googleUpstream",
};

const redirectTarget = computed(() => (route.query.redirect as string) || "/");

onMounted(async () => {
  const errCode =
    typeof route.query.oauth_error === "string" ? route.query.oauth_error : "";
  if (errCode) {
    error.value = t(OAUTH_ERROR_KEYS[errCode] || "auth.googleFailed");
    const nextQuery = { ...route.query };
    delete nextQuery.oauth_error;
    void router.replace({ path: "/login", query: nextQuery });
  }
  try {
    const providers = await $fetch<{ google: boolean }>("/api/auth/providers");
    googleEnabled.value = providers.google === true;
  } catch {
    googleEnabled.value = false;
  }
});

async function onSubmit() {
  if (busy.value) return;
  error.value = null;
  busy.value = true;
  try {
    await auth.login(email.value.trim(), password.value);
    await router.replace(redirectTarget.value);
  } catch (err: unknown) {
    const statusMessage =
      (err as { data?: { statusMessage?: string }; statusMessage?: string })
        ?.data?.statusMessage ??
      (err as { statusMessage?: string }).statusMessage ??
      null;
    if (statusMessage && /google sign-in/i.test(statusMessage)) {
      error.value = t("auth.googleAccountUseGoogle");
    } else {
      error.value = statusMessage ?? t("auth.loginFailed");
    }
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
        <div
          class="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold shadow-sm"
        >
          M
        </div>
        <div class="text-left">
          <p class="text-base font-semibold text-slate-900 leading-tight">
            {{ $t("nav.brand") }}
          </p>
          <p class="text-xs text-slate-500">{{ $t("auth.signInTitle") }}</p>
        </div>
      </div>

      <form
        class="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4"
        @submit.prevent="onSubmit"
      >
        <template v-if="googleEnabled">
          <GoogleSignInButton
            intent="login"
            :redirect="redirectTarget"
            :busy="busy"
          />
          <div class="flex items-center gap-3 text-[11px] text-slate-400">
            <span class="flex-1 h-px bg-slate-200" />
            <span>{{ $t("auth.orEmailPassword") }}</span>
            <span class="flex-1 h-px bg-slate-200" />
          </div>
        </template>

        <div>
          <label
            for="login-email"
            class="block text-xs font-medium text-slate-600 mb-1"
            >{{ $t("auth.email") }}</label
          >
          <input
            id="login-email"
            v-model="email"
            type="email"
            autocomplete="email"
            required
            class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
        </div>
        <div>
          <label
            for="login-password"
            class="block text-xs font-medium text-slate-600 mb-1"
            >{{ $t("auth.password") }}</label
          >
          <input
            id="login-password"
            v-model="password"
            type="password"
            autocomplete="current-password"
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
          {{ busy ? $t("auth.signingIn") : $t("auth.signIn") }}
        </button>

        <div class="flex items-center justify-between text-xs">
          <NuxtLink to="/signup" class="text-brand-600 hover:underline">
            {{ $t("auth.createAccountLink") }}
          </NuxtLink>
          <NuxtLink
            to="/forgot-password"
            class="text-brand-600 hover:underline"
          >
            {{ $t("auth.forgotPasswordLink") }}
          </NuxtLink>
        </div>
      </form>
    </div>
  </div>
</template>
