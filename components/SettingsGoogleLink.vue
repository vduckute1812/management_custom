<script setup lang="ts">
const emit = defineEmits<{
  /** Emitted after identities are loaded with the current hasPassword value. */
  hasPasswordChange: [value: boolean];
}>();

const { t } = useI18n();
const auth = useAuth();
const { apiFetch } = useApi();
const { pushToast } = useToasts();

const googleEnabled = ref(false);
const googleLinked = ref(false);
const hasPassword = ref(true);
const googleBusy = ref(false);

async function loadIdentities() {
  if (!auth.isAuthenticated.value) return;
  try {
    const [providers, identities] = await Promise.all([
      apiFetch<{ google: boolean }>("/api/auth/providers"),
      apiFetch<{
        googleLinked: boolean;
        hasPassword: boolean;
      }>("/api/auth/identities"),
    ]);
    googleEnabled.value = providers.google === true;
    googleLinked.value = identities.googleLinked === true;
    hasPassword.value = identities.hasPassword === true;
    emit("hasPasswordChange", hasPassword.value);
  } catch {
    googleEnabled.value = false;
  }
}

async function onUnlinkGoogle() {
  if (googleBusy.value) return;
  googleBusy.value = true;
  try {
    await apiFetch("/api/auth/google/unlink", { method: "POST" });
    googleLinked.value = false;
    hasPassword.value = true;
    emit("hasPasswordChange", true);
    pushToast(t("settings.account.googleUnlinked"), {
      tone: "success",
      duration: 2200,
    });
  } catch (err: unknown) {
    const msg =
      (err as { data?: { statusMessage?: string }; statusMessage?: string })
        ?.data?.statusMessage ??
      (err as { statusMessage?: string }).statusMessage ??
      t("settings.account.googleUnlinkFailed");
    pushToast(msg, { tone: "danger", duration: 4000 });
  } finally {
    googleBusy.value = false;
  }
}

/** Called by the parent to reflect a just-linked Google account. */
function markLinked() {
  googleLinked.value = true;
}

defineExpose({ loadIdentities, markLinked });
</script>

<template>
  <div
    v-if="googleEnabled"
    class="px-5 pb-4 pt-0 border-t border-slate-100 space-y-2"
  >
    <p class="text-[11px] text-slate-500 pt-3">
      {{ $t("settings.account.googleHint") }}
    </p>
    <div class="flex flex-wrap items-center gap-2">
      <p
        class="text-xs font-medium"
        :class="googleLinked ? 'text-emerald-700' : 'text-slate-600'"
      >
        {{
          googleLinked
            ? $t("settings.account.googleLinkedStatus")
            : $t("settings.account.googleNotLinked")
        }}
      </p>
      <GoogleSignInButton
        v-if="!googleLinked"
        intent="link"
        redirect="/settings"
        :busy="googleBusy"
        class="!w-auto px-3"
        :label="$t('settings.account.linkGoogle')"
      />
      <button
        v-else
        type="button"
        class="text-xs font-medium text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
        :disabled="googleBusy || !hasPassword"
        :title="
          !hasPassword
            ? $t('settings.account.googleUnlinkNeedPassword')
            : undefined
        "
        @click="onUnlinkGoogle"
      >
        {{ $t("settings.account.unlinkGoogle") }}
      </button>
    </div>
    <p v-if="googleLinked && !hasPassword" class="text-[11px] text-amber-700">
      {{ $t("settings.account.googleUnlinkNeedPassword") }}
    </p>
  </div>
</template>
