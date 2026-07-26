<script setup lang="ts">
definePageMeta({ layout: false });

const route = useRoute();
const auth = useAuth();
const { t } = useI18n();

useSeoMeta({
  title: computed(() => t("seo.verifyEmail")),
});

const status = ref<"pending" | "ok" | "error">("pending");
const error = ref<string | null>(null);

onMounted(async () => {
  const token = (route.query.token as string) ?? "";
  if (!token) {
    status.value = "error";
    error.value = t("auth.missingToken");
    return;
  }
  try {
    await auth.verifyEmail(token);
    status.value = "ok";
  } catch (err: unknown) {
    status.value = "error";
    error.value =
      (err as { data?: { statusMessage?: string }; statusMessage?: string })
        ?.data?.statusMessage ??
      (err as { statusMessage?: string }).statusMessage ??
      t("auth.verificationFailed");
  }
});
</script>

<template>
  <div
    class="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 py-12"
  >
    <div
      class="w-full max-w-sm bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-center space-y-4"
    >
      <p
        class="text-base font-semibold"
        :class="{
          'text-slate-700': status === 'pending',
          'text-emerald-700': status === 'ok',
          'text-rose-700': status === 'error',
        }"
      >
        {{
          status === "pending"
            ? $t("auth.verifying")
            : status === "ok"
            ? $t("auth.emailVerified")
            : $t("auth.couldNotVerify")
        }}
      </p>
      <p v-if="status === 'pending'" class="text-sm text-slate-500">
        {{ $t("auth.hangTight") }}
      </p>
      <p v-else-if="status === 'ok'" class="text-sm text-slate-700">
        {{ $t("auth.verifiedBody") }}
      </p>
      <p v-else class="text-sm text-rose-700">{{ error }}</p>
      <NuxtLink
        to="/login"
        class="block w-full py-2 rounded-md text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition"
      >
        {{ $t("auth.continueToSignIn") }}
      </NuxtLink>
    </div>
  </div>
</template>
