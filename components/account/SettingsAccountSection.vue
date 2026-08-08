<script setup lang="ts">
const emit = defineEmits<{
  hasPasswordChange: [value: boolean];
}>();

const { t } = useI18n();
const { pushToast } = useToasts();
const auth = useAuth();
const router = useRouter();
const route = useRoute();

const googleLinkRef = ref<{
  loadIdentities: () => Promise<void>;
  markLinked: () => void;
} | null>(null);

async function onLogout() {
  await auth.logout();
  await router.replace("/");
}

if (import.meta.client) {
  const oauthErr =
    typeof route.query.oauth_error === "string" ? route.query.oauth_error : "";
  const linked = route.query.linked === "google";
  if (oauthErr || linked) {
    if (oauthErr) {
      const key =
        (
          {
            denied: "auth.googleDenied",
            state: "auth.googleStateInvalid",
            config: "auth.googleNotConfigured",
            email: "auth.googleEmailUnverified",
            conflict: "auth.googleConflict",
            unverified: "auth.googleUnverifiedExists",
            auth: "auth.googleAuthRequired",
            failed: "auth.googleFailed",
            google: "auth.googleUpstream",
          } as Record<string, string>
        )[oauthErr] || "auth.googleFailed";
      queueMicrotask(() => {
        pushToast(t(key), { tone: "danger", duration: 4200 });
      });
    } else {
      queueMicrotask(() => {
        pushToast(t("settings.account.googleLinked"), {
          tone: "success",
          duration: 2200,
        });
      });
      nextTick(() => googleLinkRef.value?.markLinked());
    }
    const nextQuery = { ...route.query };
    delete nextQuery.oauth_error;
    delete nextQuery.linked;
    void router.replace({ path: "/settings", query: nextQuery });
  }
}

onMounted(() => {
  void googleLinkRef.value?.loadIdentities();
});
</script>

<template>
  <section
    v-if="auth.user.value"
    class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm"
  >
    <header class="px-5 py-3 border-b border-slate-100">
      <h2 class="text-sm font-semibold text-slate-800">
        {{ $t("settings.account.title") }}
      </h2>
      <p class="text-[11px] text-slate-500">
        {{ $t("settings.account.subtitle") }}
      </p>
    </header>
    <div class="px-5 py-4 flex items-center gap-3">
      <UserAvatar
        :name="auth.user.value.name"
        :email="auth.user.value.email"
        :avatar-url="auth.user.value.avatarUrl"
        size="md"
      />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-slate-800 truncate">
          {{ auth.user.value.name || auth.user.value.email }}
        </p>
        <p class="text-[11px] text-slate-500 truncate">
          <template v-if="auth.user.value.title || auth.user.value.job">
            <span v-if="auth.user.value.title">{{
              auth.user.value.title
            }}</span>
            <span v-if="auth.user.value.title && auth.user.value.job"> · </span>
            <span v-if="auth.user.value.job">{{ auth.user.value.job }}</span>
          </template>
          <template v-else>
            {{ auth.user.value.email }}
          </template>
        </p>
      </div>
      <NuxtLink
        to="/profile"
        class="text-xs font-medium text-brand-700 hover:text-brand-800 px-3 py-1.5 rounded-lg hover:bg-brand-50"
      >
        {{ $t("settings.account.editProfile") }}
      </NuxtLink>
      <button
        type="button"
        class="text-xs font-medium text-rose-600 hover:text-rose-700 px-3 py-1.5 rounded-lg hover:bg-rose-50"
        @click="onLogout"
      >
        {{ $t("settings.account.signOut") }}
      </button>
    </div>
    <SettingsGoogleLink
      ref="googleLinkRef"
      @has-password-change="emit('hasPasswordChange', $event)"
    />
  </section>
</template>
