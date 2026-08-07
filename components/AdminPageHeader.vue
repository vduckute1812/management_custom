<script setup lang="ts">
const days = defineModel<number>("days", { required: true });
</script>

<template>
  <header
    class="shrink-0 px-4 md:px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between flex-wrap gap-3"
  >
    <div>
      <h1 class="text-lg font-semibold text-slate-900">
        {{ $t("admin.title") }}
      </h1>
      <p class="text-xs text-slate-500">
        {{ $t("admin.subtitle") }}
      </p>
    </div>
    <div class="flex items-center gap-2 flex-wrap">
      <NuxtLink
        to="/admin/articles/pending"
        class="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800"
      >
        {{ $t("admin.pendingArticlesLink") }}
      </NuxtLink>
      <label class="text-xs text-slate-500" for="admin-range">{{
        $t("admin.range")
      }}</label>
      <select
        id="admin-range"
        v-model.number="days"
        class="text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white"
      >
        <option :value="7">
          {{ $t("admin.last7Days") }}
        </option>
        <option :value="14">
          {{ $t("admin.last14Days") }}
        </option>
        <option :value="30">
          {{ $t("admin.last30Days") }}
        </option>
        <option :value="90">
          {{ $t("admin.last90Days") }}
        </option>
      </select>
    </div>
  </header>
</template>
