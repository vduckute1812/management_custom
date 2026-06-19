<script setup lang="ts">
definePageMeta({ layout: false });

const auth = useAuth();
const router = useRouter();

const email = ref("");
const password = ref("");
const name = ref("");
const busy = ref(false);
const error = ref<string | null>(null);
const success = ref<{ verificationSent: boolean } | null>(null);

onMounted(async () => {
  await nextTick();
  if (auth.isAuthenticated.value) {
    await router.replace("/");
  }
});

async function onSubmit() {
  if (busy.value) return;
  error.value = null;
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
      "Sign-up failed";
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
            Create an account
          </p>
          <p class="text-xs text-slate-500">It takes a minute</p>
        </div>
      </div>

      <div
        v-if="success"
        class="bg-white border border-emerald-200 rounded-xl shadow-sm p-6 space-y-3"
      >
        <p class="text-sm font-semibold text-emerald-700">Account created</p>
        <p class="text-sm text-slate-700">
          {{
            success.verificationSent
              ? "Check your inbox for a verification link. Once you click it you can sign in."
              : "The verification email couldn't be sent — check the server console for the link in dry-run mode."
          }}
        </p>
        <NuxtLink
          to="/login"
          class="block text-center w-full py-2 rounded-md text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition"
        >
          Go to sign in
        </NuxtLink>
      </div>

      <form
        v-else
        class="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4"
        @submit.prevent="onSubmit"
      >
        <div>
          <label
            for="signup-name"
            class="block text-xs font-medium text-slate-600 mb-1"
            >Name (optional)</label
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
            >Email</label
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
            >Password</label
          >
          <input
            id="signup-password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
            class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
          <p class="text-[11px] text-slate-500 mt-1">
            Minimum 8 characters.
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
          :disabled="busy"
          class="w-full py-2 rounded-md text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          {{ busy ? "Creating account…" : "Create account" }}
        </button>

        <div class="flex items-center justify-between text-xs">
          <NuxtLink to="/login" class="text-brand-600 hover:underline">
            Already have an account? Sign in
          </NuxtLink>
        </div>
      </form>
    </div>
  </div>
</template>
