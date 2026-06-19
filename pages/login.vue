<script setup lang="ts">
definePageMeta({ layout: false });

// Already-authenticated visitors are redirected away by the global auth
// middleware (see middleware/auth.global.ts), so we only handle the
// unauthenticated sign-in flow here.
const auth = useAuth();
const route = useRoute();
const router = useRouter();

const email = ref("");
const password = ref("");
const busy = ref(false);
const error = ref<string | null>(null);

async function onSubmit() {
  if (busy.value) return;
  error.value = null;
  busy.value = true;
  try {
    await auth.login(email.value.trim(), password.value);
    const redirect = (route.query.redirect as string) || "/";
    await router.replace(redirect);
  } catch (err: unknown) {
    error.value =
      (err as { data?: { statusMessage?: string }; statusMessage?: string })
        ?.data?.statusMessage ??
      (err as { statusMessage?: string }).statusMessage ??
      "Login failed";
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
            Management
          </p>
          <p class="text-xs text-slate-500">Sign in to continue</p>
        </div>
      </div>

      <form
        class="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4"
        @submit.prevent="onSubmit"
      >
        <div>
          <label
            for="login-email"
            class="block text-xs font-medium text-slate-600 mb-1"
            >Email</label
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
            >Password</label
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
          {{ busy ? "Signing in…" : "Sign in" }}
        </button>

        <div class="flex items-center justify-between text-xs">
          <NuxtLink to="/signup" class="text-brand-600 hover:underline">
            Create an account
          </NuxtLink>
          <span class="text-slate-400">Local install</span>
        </div>
      </form>
    </div>
  </div>
</template>
