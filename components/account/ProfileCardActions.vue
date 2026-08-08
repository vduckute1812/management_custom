<script setup lang="ts">
defineProps<{
  editing: boolean;
  busy: boolean;
}>();

defineEmits<{
  edit: [];
  logout: [];
  cancel: [];
}>();
</script>

<template>
  <div class="mt-6 flex flex-wrap gap-3">
    <template v-if="!editing">
      <button
        type="button"
        class="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        @click="$emit('edit')"
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
        @click="$emit('logout')"
      >
        {{ $t("profile.logout") }}
      </button>
    </template>
    <template v-else>
      <button
        type="submit"
        form="profile-edit-form"
        class="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-50"
        :disabled="busy"
      >
        {{ busy ? $t("profile.saving") : $t("profile.save") }}
      </button>
      <button
        type="button"
        class="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
        :disabled="busy"
        @click="$emit('cancel')"
      >
        {{ $t("common.cancel") }}
      </button>
    </template>
  </div>
</template>
