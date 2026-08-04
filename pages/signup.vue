<script setup lang="ts">
import {
  evaluatePassword,
  isPasswordStrong,
  type PasswordRuleId,
} from "~/utils/passwordPolicy";

definePageMeta({ layout: false });

// Already-authenticated visitors are redirected away by the global auth
// middleware (see middleware/auth.global.ts), so we only handle the
// unauthenticated sign-up flow here.
const auth = useAuth();
const { t } = useI18n();

useSeoMeta({
  title: computed(() => t("seo.signup")),
});

const email = ref("");
const password = ref("");
const passwordConfirm = ref("");
const name = ref("");
const busy = ref(false);
const error = ref<string | null>(null);
const success = ref<{ verificationSent: boolean } | null>(null);
const googleEnabled = ref(false);

const RULE_I18N: Record<PasswordRuleId, string> = {
  minLength: "auth.passwordRuleMinLength",
  lower: "auth.passwordRuleLower",
  upper: "auth.passwordRuleUpper",
  digit: "auth.passwordRuleDigit",
  special: "auth.passwordRuleSpecial",
};

const passwordRules = computed(() => evaluatePassword(password.value));
const passwordsMatch = computed(
  () =>
    passwordConfirm.value.length > 0 &&
    password.value === passwordConfirm.value,
);
const canSubmit = computed(
  () => isPasswordStrong(password.value) && passwordsMatch.value && !busy.value,
);

onMounted(async () => {
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

  if (!isPasswordStrong(password.value)) {
    error.value = t("auth.passwordTooWeak");
    return;
  }
  if (password.value !== passwordConfirm.value) {
    error.value = t("auth.passwordMismatch");
    return;
  }

  busy.value = true;
  try {
    const result = await auth.signup({
      email: email.value.trim(),
      password: password.value,
      name: name.value.trim() || undefined,
    });
    success.value = { verificationSent: result.verificationSent };
  } catch (err: unknown) {
    error.value =
      (err as { data?: { statusMessage?: string }; statusMessage?: string })
        ?.data?.statusMessage ??
      (err as { statusMessage?: string }).statusMessage ??
      t("auth.signupFailed");
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
            {{ $t("auth.signupTitle") }}
          </p>
          <p class="text-xs text-slate-500">{{ $t("auth.signupSubtitle") }}</p>
        </div>
      </div>

      <div
        v-if="success"
        class="bg-white border border-emerald-200 rounded-xl shadow-sm p-6 space-y-3"
      >
        <p class="text-sm font-semibold text-emerald-700">
          {{ $t("auth.accountCreated") }}
        </p>
        <p class="text-sm text-slate-700">
          {{
            success.verificationSent
              ? $t("auth.verificationSent")
              : $t("auth.verificationDryRun")
          }}
        </p>
        <NuxtLink
          to="/login"
          class="block text-center w-full py-2 rounded-md text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition"
        >
          {{ $t("auth.goToSignIn") }}
        </NuxtLink>
      </div>

      <form
        v-else
        class="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4"
        @submit.prevent="onSubmit"
      >
        <template v-if="googleEnabled">
          <GoogleSignInButton intent="login" redirect="/" :busy="busy" />
          <div class="flex items-center gap-3 text-[11px] text-slate-400">
            <span class="flex-1 h-px bg-slate-200" />
            <span>{{ $t("auth.orEmailPassword") }}</span>
            <span class="flex-1 h-px bg-slate-200" />
          </div>
        </template>

        <div>
          <label
            for="signup-name"
            class="block text-xs font-medium text-slate-600 mb-1"
            >{{ $t("auth.nameOptional") }}</label
          >
          <input
            id="signup-name"
            v-model="name"
            type="text"
            autocomplete="name"
            class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
        </div>
        <div>
          <label
            for="signup-email"
            class="block text-xs font-medium text-slate-600 mb-1"
            >{{ $t("auth.email") }}</label
          >
          <input
            id="signup-email"
            v-model="email"
            type="email"
            autocomplete="email"
            required
            class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
        </div>
        <div>
          <label
            for="signup-password"
            class="block text-xs font-medium text-slate-600 mb-1"
            >{{ $t("auth.password") }}</label
          >
          <input
            id="signup-password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
            aria-describedby="signup-password-rules"
            class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
          <ul
            id="signup-password-rules"
            class="mt-2 space-y-1"
            :aria-label="$t('auth.passwordRequirements')"
          >
            <li
              v-for="rule in passwordRules"
              :key="rule.id"
              class="flex items-center gap-1.5 text-[11px]"
              :class="rule.ok ? 'text-emerald-700' : 'text-slate-500'"
            >
              <span aria-hidden="true">{{ rule.ok ? "✓" : "○" }}</span>
              <span>{{ $t(RULE_I18N[rule.id]) }}</span>
            </li>
          </ul>
        </div>
        <div>
          <label
            for="signup-password-confirm"
            class="block text-xs font-medium text-slate-600 mb-1"
            >{{ $t("auth.confirmPassword") }}</label
          >
          <input
            id="signup-password-confirm"
            v-model="passwordConfirm"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
            class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            :class="
              passwordConfirm && !passwordsMatch
                ? 'border-rose-300 focus:ring-rose-300 focus:border-rose-400'
                : ''
            "
          />
          <p
            v-if="passwordConfirm && !passwordsMatch"
            class="mt-1 text-[11px] text-rose-600"
          >
            {{ $t("auth.passwordMismatch") }}
          </p>
        </div>

        <p
          v-if="error"
          class="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2"
        >
          {{ error }}
        </p>

        <button
          type="submit"
          :disabled="!canSubmit"
          class="w-full py-2 rounded-md text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          {{ busy ? $t("auth.creatingAccount") : $t("auth.createAccount") }}
        </button>

        <p class="text-[11px] leading-5 text-slate-500">
          <i18n-t keypath="auth.signupConsent" tag="span">
            <template #terms>
              <NuxtLink
                to="/terms"
                class="font-medium text-brand-700 hover:underline"
              >
                {{ $t("auth.termsLink") }}
              </NuxtLink>
            </template>
            <template #privacy>
              <NuxtLink
                to="/privacy"
                class="font-medium text-brand-700 hover:underline"
              >
                {{ $t("auth.privacyLink") }}
              </NuxtLink>
            </template>
          </i18n-t>
        </p>

        <div class="flex items-center justify-between text-xs">
          <NuxtLink to="/login" class="text-brand-600 hover:underline">
            {{ $t("auth.alreadyHaveAccount") }}
          </NuxtLink>
        </div>
      </form>
    </div>
  </div>
</template>
