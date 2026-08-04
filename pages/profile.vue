<script setup lang="ts">
import { UploadKind } from "~/types/post";
import { ROLE_I18N_KEYS } from "~/types/task";
import { INTL_LOCALE, type AppLocale } from "~/types/locale";

const auth = useAuth();
const router = useRouter();
const { t } = useI18n();
const { settings } = useSettings();
const { uploadFile } = useUploads();
const { pushToast } = useToasts();

useSeoMeta({
  title: computed(() => t("seo.profile")),
  description: computed(() => t("seo.profileDescription")),
});

const user = computed(() => auth.user.value);

const memberSince = computed(() => {
  if (!user.value) return "";
  const tag =
    INTL_LOCALE[settings.value.locale as AppLocale] ?? settings.value.locale;
  return new Date(user.value.createdAt).toLocaleDateString(tag);
});

const editing = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const avatarInput = ref<HTMLInputElement | null>(null);

const form = reactive({
  name: "",
  title: "",
  job: "",
  location: "",
  /** Set when user picks a new upload or clears; null means leave unchanged. */
  avatarUploadId: null as string | null | undefined,
  avatarPreviewUrl: null as string | null,
  avatarDirty: false,
});

function syncFormFromUser() {
  const u = user.value;
  form.name = u?.name ?? "";
  form.title = u?.title ?? "";
  form.job = u?.job ?? "";
  form.location = u?.location ?? "";
  form.avatarUploadId = undefined;
  form.avatarPreviewUrl = u?.avatarUrl ?? null;
  form.avatarDirty = false;
}

function startEdit() {
  syncFormFromUser();
  error.value = null;
  editing.value = true;
}

function cancelEdit() {
  editing.value = false;
  error.value = null;
  syncFormFromUser();
}

const displayAvatarUrl = computed(() => {
  if (editing.value) return form.avatarPreviewUrl;
  return user.value?.avatarUrl ?? null;
});

async function onAvatarPicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  busy.value = true;
  error.value = null;
  try {
    const upload = await uploadFile(file);
    if (upload.kind !== UploadKind.Image) {
      error.value = t("profile.avatarMustBeImage");
      return;
    }
    form.avatarUploadId = upload.id;
    form.avatarPreviewUrl = upload.url;
    form.avatarDirty = true;
  } catch {
    // useUploads already toasts rejection reasons
  } finally {
    busy.value = false;
  }
}

function clearAvatar() {
  form.avatarUploadId = null;
  form.avatarPreviewUrl = null;
  form.avatarDirty = true;
}

async function onSave() {
  if (busy.value || !user.value) return;
  if (!form.name.trim()) {
    error.value = t("auth.nameRequired");
    return;
  }
  busy.value = true;
  error.value = null;
  try {
    const payload: {
      name: string;
      title: string | null;
      job: string | null;
      location: string | null;
      avatarUploadId?: string | null;
    } = {
      name: form.name.trim(),
      title: form.title.trim() || null,
      job: form.job.trim() || null,
      location: form.location.trim() || null,
    };
    if (form.avatarDirty) {
      payload.avatarUploadId = form.avatarUploadId ?? null;
    }
    await auth.updateProfile(payload);
    editing.value = false;
    pushToast(t("toasts.profileUpdated"), { tone: "success", duration: 1800 });
  } catch (err: unknown) {
    error.value =
      (err as { data?: { statusMessage?: string }; statusMessage?: string })
        ?.data?.statusMessage ??
      (err as { statusMessage?: string }).statusMessage ??
      t("profile.saveFailed");
  } finally {
    busy.value = false;
  }
}

async function onLogout() {
  await auth.logout();
  await router.replace("/");
}

onMounted(async () => {
  if (auth.isAuthenticated.value) {
    await auth.fetchMe().catch(() => undefined);
  }
  syncFormFromUser();
});
</script>

<template>
  <div class="mx-auto max-w-xl px-4 py-8 sm:px-6">
    <h1 class="text-2xl font-semibold tracking-tight text-slate-900">
      {{ $t("profile.title") }}
    </h1>
    <p class="mt-1 text-sm text-slate-600">
      {{ $t("profile.subtitle") }}
    </p>

    <div
      v-if="user"
      class="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div class="flex items-start gap-4">
        <div class="relative">
          <UserAvatar
            :name="editing ? form.name : user.name"
            :email="user.email"
            :avatar-url="displayAvatarUrl"
            size="lg"
          />
          <template v-if="editing">
            <input
              ref="avatarInput"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              class="sr-only"
              @change="onAvatarPicked"
            />
            <div class="mt-2 flex flex-col gap-1">
              <button
                type="button"
                class="text-xs font-semibold text-brand-700 hover:underline disabled:opacity-50"
                :disabled="busy"
                @click="avatarInput?.click()"
              >
                {{ $t("profile.changeAvatar") }}
              </button>
              <button
                v-if="displayAvatarUrl"
                type="button"
                class="text-xs font-medium text-slate-500 hover:underline disabled:opacity-50"
                :disabled="busy"
                @click="clearAvatar"
              >
                {{ $t("profile.removeAvatar") }}
              </button>
            </div>
          </template>
        </div>

        <div class="min-w-0 flex-1">
          <template v-if="!editing">
            <p class="truncate text-lg font-semibold text-slate-900">
              {{ user.name || $t("profile.unnamedUser") }}
            </p>
            <p class="truncate text-sm text-slate-500">{{ user.email }}</p>
            <p v-if="user.title" class="mt-1 truncate text-sm text-slate-700">
              {{ user.title }}
            </p>
            <p
              v-if="user.job || user.location"
              class="mt-0.5 truncate text-xs text-slate-500"
            >
              <span v-if="user.job">{{ user.job }}</span>
              <span v-if="user.job && user.location"> · </span>
              <span v-if="user.location">{{ user.location }}</span>
            </p>
          </template>

          <form v-else class="space-y-3" @submit.prevent="onSave">
            <div>
              <label
                class="block text-xs font-medium text-slate-600"
                for="profile-name"
              >
                {{ $t("profile.fields.name") }}
              </label>
              <input
                id="profile-name"
                v-model="form.name"
                type="text"
                required
                maxlength="120"
                autocomplete="name"
                class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                :placeholder="$t('profile.fields.namePlaceholder')"
              />
            </div>
            <div>
              <label
                class="block text-xs font-medium text-slate-600"
                for="profile-title"
              >
                {{ $t("profile.fields.title") }}
              </label>
              <input
                id="profile-title"
                v-model="form.title"
                type="text"
                maxlength="120"
                class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                :placeholder="$t('profile.fields.titlePlaceholder')"
              />
            </div>
            <div>
              <label
                class="block text-xs font-medium text-slate-600"
                for="profile-job"
              >
                {{ $t("profile.fields.job") }}
              </label>
              <input
                id="profile-job"
                v-model="form.job"
                type="text"
                maxlength="120"
                class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                :placeholder="$t('profile.fields.jobPlaceholder')"
              />
            </div>
            <div>
              <label
                class="block text-xs font-medium text-slate-600"
                for="profile-location"
              >
                {{ $t("profile.fields.location") }}
              </label>
              <input
                id="profile-location"
                v-model="form.location"
                type="text"
                maxlength="120"
                autocomplete="address-level2"
                class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                :placeholder="$t('profile.fields.locationPlaceholder')"
              />
            </div>
          </form>
        </div>
      </div>

      <p
        v-if="error"
        class="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        role="alert"
      >
        {{ error }}
      </p>

      <dl v-if="!editing" class="mt-6 space-y-3 text-sm">
        <div class="flex justify-between gap-4 border-t border-slate-100 pt-3">
          <dt class="text-slate-500">{{ $t("profile.role") }}</dt>
          <dd class="font-medium text-slate-800">
            {{ t(ROLE_I18N_KEYS[user.role] ?? "roles.normal") }}
          </dd>
        </div>
        <div class="flex justify-between gap-4 border-t border-slate-100 pt-3">
          <dt class="text-slate-500">{{ $t("profile.emailVerified") }}</dt>
          <dd class="font-medium text-slate-800">
            {{ user.emailVerified ? $t("profile.yes") : $t("profile.no") }}
          </dd>
        </div>
        <div class="flex justify-between gap-4 border-t border-slate-100 pt-3">
          <dt class="text-slate-500">{{ $t("profile.memberSince") }}</dt>
          <dd class="font-medium tabular-nums text-slate-800">
            {{ memberSince }}
          </dd>
        </div>
      </dl>

      <div class="mt-6 flex flex-wrap gap-3">
        <template v-if="!editing">
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            @click="startEdit"
          >
            {{ $t("profile.edit") }}
          </button>
          <NuxtLink
            to="/settings"
            class="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            {{ $t("profile.settings") }}
          </NuxtLink>
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
            @click="onLogout"
          >
            {{ $t("profile.logout") }}
          </button>
        </template>
        <template v-else>
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-50"
            :disabled="busy"
            @click="onSave"
          >
            {{ busy ? $t("profile.saving") : $t("profile.save") }}
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
            :disabled="busy"
            @click="cancelEdit"
          >
            {{ $t("common.cancel") }}
          </button>
        </template>
      </div>
    </div>

    <p v-else class="mt-8 text-sm text-slate-500">
      {{ $t("profile.signInPrompt") }}
    </p>
  </div>
</template>
