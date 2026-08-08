<script setup lang="ts">
import { ArticleStatus } from "~/types/article";
import type { PostCategory } from "~/types/post";
import { categoryDisplayName } from "~/utils/categoryLabel";

defineProps<{
  pipelineCategories: PostCategory[];
}>();

const statusFilter = defineModel<number>("statusFilter", { required: true });
const categoryId = defineModel<string>("categoryId", { required: true });
const createdFrom = defineModel<string>("createdFrom", { required: true });
const createdTo = defineModel<string>("createdTo", { required: true });

const { t, te } = useI18n();

function categoryOptionLabel(cat: PostCategory): string {
  return categoryDisplayName(cat, t, te);
}
</script>

<template>
  <div
    class="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap gap-3 items-end"
  >
    <label class="flex flex-col gap-1 text-xs text-slate-600">
      <span>{{ $t("adminArticles.filterStatus") }}</span>
      <select
        v-model.number="statusFilter"
        class="border border-slate-300 rounded-md px-2 py-1.5 bg-white min-w-[10rem]"
      >
        <option :value="ArticleStatus.PendingApproval">
          {{ $t("adminArticles.statusPending") }}
        </option>
        <option :value="ArticleStatus.Draft">
          {{ $t("adminArticles.statusDraft") }}
        </option>
        <option :value="ArticleStatus.Approved">
          {{ $t("adminArticles.statusApproved") }}
        </option>
        <option :value="ArticleStatus.Rejected">
          {{ $t("adminArticles.statusRejected") }}
        </option>
      </select>
    </label>
    <label class="flex flex-col gap-1 text-xs text-slate-600">
      <span>{{ $t("adminArticles.filterCategory") }}</span>
      <select
        v-model="categoryId"
        class="border border-slate-300 rounded-md px-2 py-1.5 bg-white min-w-[12rem]"
      >
        <option value="">{{ $t("adminArticles.allCategories") }}</option>
        <option v-for="cat in pipelineCategories" :key="cat.id" :value="cat.id">
          {{ categoryOptionLabel(cat) }}
        </option>
      </select>
    </label>
    <label class="flex flex-col gap-1 text-xs text-slate-600">
      <span>{{ $t("adminArticles.filterFrom") }}</span>
      <input
        v-model="createdFrom"
        type="date"
        class="border border-slate-300 rounded-md px-2 py-1.5 bg-white"
      />
    </label>
    <label class="flex flex-col gap-1 text-xs text-slate-600">
      <span>{{ $t("adminArticles.filterTo") }}</span>
      <input
        v-model="createdTo"
        type="date"
        class="border border-slate-300 rounded-md px-2 py-1.5 bg-white"
      />
    </label>
  </div>
</template>
