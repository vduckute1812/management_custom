<script setup lang="ts">
interface ProfileFormModel {
  name: string;
  title: string;
  job: string;
  location: string;
}

const model = defineModel<ProfileFormModel>({ required: true });

const emit = defineEmits<{
  submit: [];
}>();
</script>

<template>
  <form
    id="profile-edit-form"
    class="space-y-3"
    @submit.prevent="emit('submit')"
  >
    <div>
      <label
        class="block text-xs font-medium text-slate-600"
        for="profile-name"
      >
        {{ $t("profile.fields.name") }}
      </label>
      <input
        id="profile-name"
        v-model="model.name"
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
        v-model="model.title"
        type="text"
        maxlength="120"
        class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        :placeholder="$t('profile.fields.titlePlaceholder')"
      />
    </div>
    <div>
      <label class="block text-xs font-medium text-slate-600" for="profile-job">
        {{ $t("profile.fields.job") }}
      </label>
      <input
        id="profile-job"
        v-model="model.job"
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
        v-model="model.location"
        type="text"
        maxlength="120"
        autocomplete="address-level2"
        class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        :placeholder="$t('profile.fields.locationPlaceholder')"
      />
    </div>
  </form>
</template>
