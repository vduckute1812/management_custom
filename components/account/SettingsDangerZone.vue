<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    /** Whether the account has a local password (controls modal password field). */
    hasPassword?: boolean;
  }>(),
  { hasPassword: true },
);

const { t } = useI18n();
const auth = useAuth();
const router = useRouter();
const { apiFetch } = useApi();
const { pushToast } = useToasts();

const deleteOpen = ref(false);
const deleteBusy = ref(false);
const deleteError = ref("");

function openDeleteAccount() {
  deleteError.value = "";
  deleteOpen.value = true;
}

async function onDeleteAccount(payload: { email: string; password: string }) {
  if (deleteBusy.value) return;
  deleteBusy.value = true;
  deleteError.value = "";
  try {
    await apiFetch("/api/auth/account", {
      method: "DELETE",
      body: {
        email: payload.email,
        password: payload.password || undefined,
      },
    });
    deleteOpen.value = false;
    auth.clearSession();
    pushToast(t("settings.danger.deleted"), {
      tone: "success",
      duration: 6000,
    });
    await router.replace("/");
  } catch (err: unknown) {
    deleteError.value = apiErrorMessage(err, t("settings.danger.failed"));
  } finally {
    deleteBusy.value = false;
  }
}
</script>

<template>
  <section
    v-if="auth.user.value"
    class="bg-white ring-1 ring-rose-200 rounded-xl shadow-sm"
  >
    <header class="px-5 py-3 border-b border-rose-100">
      <h2 class="text-sm font-semibold text-rose-700">
        {{ $t("settings.danger.title") }}
      </h2>
      <p class="text-[11px] text-slate-500">
        {{ $t("settings.danger.subtitle") }}
      </p>
    </header>
    <div class="px-5 py-4 space-y-3">
      <p class="text-xs text-slate-600 leading-relaxed">
        {{ $t("settings.danger.body") }}
      </p>
      <p class="text-[11px] text-slate-500">
        {{ $t("settings.danger.exportFirst") }}
      </p>
      <p
        v-if="auth.isSuperAdmin.value"
        class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800"
      >
        {{ $t("settings.danger.superadminBlocked") }}
      </p>
      <button
        v-else
        type="button"
        class="px-3 py-2 rounded-lg text-xs font-semibold text-rose-700 ring-1 ring-rose-300 hover:bg-rose-50 transition"
        @click="openDeleteAccount"
      >
        {{ $t("settings.danger.openButton") }}
      </button>
    </div>

    <DeleteAccountModal
      :open="deleteOpen"
      :account-email="auth.user.value?.email ?? ''"
      :requires-password="props.hasPassword"
      :busy="deleteBusy"
      :error="deleteError"
      @cancel="deleteOpen = false"
      @confirm="onDeleteAccount"
    />
  </section>
</template>
