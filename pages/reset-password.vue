<script setup lang="ts">
import {
  evaluatePassword,
  isPasswordStrong,
  type PasswordRuleId,
} from "~/utils/passwordPolicy";

definePageMeta({ layout: false });

const route = useRoute();
const auth = useAuth();
const { t } = useI18n();

useSeoMeta({
  title: computed(() => t("seo.resetPassword")),
});

const token = computed(() => (route.query.token as string) ?? "");

const password = ref("");
const passwordConfirm = ref("");
const busy = ref(false);
const error = ref<string | null>(null);
const success = ref(false);

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
  () =>
    !!token.value &&
    isPasswordStrong(password.value) &&
    passwordsMatch.value &&
    !busy.value,
);

async function onSubmit() {
  if (busy.value || !token.value) return;
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
    await auth.resetPassword(token.value, password.value);
    success.value = true;
  } catch (err: unknown) {
    error.value =
      (err as { data?: { statusMessage?: string }; statusMessage?: string })
        ?.data?.statusMessage ??
      (err as { statusMessage?: string }).statusMessage ??
      t("auth.resetPasswordFailed");
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
            {{ $t("auth.resetPasswordTitle") }}
          </p>
          <p class="text-xs text-slate-500">
            {{ $t("auth.resetPasswordSubtitle") }}
          </p>
        </div>
      </div>

      <div
        v-if="!token"
        class="bg-white border border-rose-200 rounded-xl shadow-sm p-6 space-y-3 text-center"
      >
        <p class="text-sm font-semibold text-rose-700">
          {{ $t("auth.missingResetToken") }}
        </p>
        <NuxtLink
          to="/forgot-password"
          class="block w-full py-2 rounded-md text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition"
        >
          {{ $t("auth.requestNewResetLink") }}
        </NuxtLink>
      </div>

      <div
        v-else-if="success"
        class="bg-white border border-emerald-200 rounded-xl shadow-sm p-6 space-y-3 text-center"
      >
        <p class="text-sm font-semibold text-emerald-700">
          {{ $t("auth.passwordResetTitle") }}
        </p>
        <p class="text-sm text-slate-700">
          {{ $t("auth.passwordResetBody") }}
        </p>
        <NuxtLink
          to="/login"
          class="block w-full py-2 rounded-md text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition"
        >
          {{ $t("auth.continueToSignIn") }}
        </NuxtLink>
      </div>

      <form
        v-else
        class="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4"
        @submit.prevent="onSubmit"
      >
        <div>
          <label
            for="reset-password"
            class="block text-xs font-medium text-slate-600 mb-1"
            >{{ $t("auth.newPassword") }}</label
          >
          <input
            id="reset-password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            required
            class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
        </div>
        <div>
          <label
            for="reset-password-confirm"
            class="block text-xs font-medium text-slate-600 mb-1"
            >{{ $t("auth.confirmPassword") }}</label
          >
          <input
            id="reset-password-confirm"
            v-model="passwordConfirm"
            type="password"
            autocomplete="new-password"
            required
            class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
        </div>

        <ul class="space-y-1 text-xs">
          <li
            v-for="rule in passwordRules"
            :key="rule.id"
            class="flex items-center gap-2"
            :class="rule.ok ? 'text-emerald-600' : 'text-slate-500'"
          >
            <span aria-hidden="true">{{ rule.ok ? "✓" : "○" }}</span>
            {{ $t(RULE_I18N[rule.id]) }}
          </li>
        </ul>

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
          {{ busy ? $t("auth.resettingPassword") : $t("auth.resetPassword") }}
        </button>
      </form>
    </div>
  </div>
</template>
