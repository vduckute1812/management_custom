<script setup lang="ts">
definePageMeta({ layout: false });

const route = useRoute();
const auth = useAuth();

const status = ref<"pending" | "ok" | "error">("pending");
const error = ref<string | null>(null);

onMounted(async () => {
  const token = (route.query.token as string) ?? "";
  if (!token) {
    status.value = "error";
    error.value = "Missing verification token.";
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
      "Verification failed.";
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
            ? "Verifying…"
            : status === "ok"
            ? "Email verified"
            : "Couldn't verify"
        }}
      </p>
      <p v-if="status === 'pending'" class="text-sm text-slate-500">
        Hang tight…
      </p>
      <p v-else-if="status === 'ok'" class="text-sm text-slate-700">
        You're all set. You can now sign in.
      </p>
      <p v-else class="text-sm text-rose-700">{{ error }}</p>
      <NuxtLink
        to="/login"
        class="block w-full py-2 rounded-md text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition"
      >
        Continue to sign in
      </NuxtLink>
    </div>
  </div>
</template>
