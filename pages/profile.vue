<script setup lang="ts">
import { ROLE_LABELS } from "~/types/task";

const auth = useAuth();
const router = useRouter();

useSeoMeta({
  title: "Profile",
  description: "Your account details.",
});

const user = computed(() => auth.user.value);

const userInitial = computed(() => {
  const src = user.value?.name || user.value?.email || "";
  return src.charAt(0).toUpperCase() || "?";
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
      Profile
    </h1>
    <p class="mt-1 text-sm text-slate-600">
      Your account information for this workspace.
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
            {{ user.name || "Unnamed user" }}
          </p>
          <p class="truncate text-sm text-slate-500">{{ user.email }}</p>
        </div>
      </div>

      <dl class="mt-6 space-y-3 text-sm">
        <div class="flex justify-between gap-4 border-t border-slate-100 pt-3">
          <dt class="text-slate-500">Role</dt>
          <dd class="font-medium text-slate-800">
            {{ ROLE_LABELS[user.role] ?? "Member" }}
          </dd>
        </div>
        <div class="flex justify-between gap-4 border-t border-slate-100 pt-3">
          <dt class="text-slate-500">Email verified</dt>
          <dd class="font-medium text-slate-800">
            {{ user.emailVerified ? "Yes" : "No" }}
          </dd>
        </div>
        <div class="flex justify-between gap-4 border-t border-slate-100 pt-3">
          <dt class="text-slate-500">Member since</dt>
          <dd class="font-medium tabular-nums text-slate-800">
            {{ new Date(user.createdAt).toLocaleDateString() }}
          </dd>
        </div>
      </dl>

      <div class="mt-6 flex flex-wrap gap-3">
        <NuxtLink
          to="/settings"
          class="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          Settings
        </NuxtLink>
        <button
          type="button"
          class="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
          @click="onLogout"
        >
          Logout
        </button>
      </div>
    </div>

    <p v-else class="mt-8 text-sm text-slate-500">
      Sign in to view your profile.
    </p>
  </div>
</template>
