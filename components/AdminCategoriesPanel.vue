<script setup lang="ts">
import type { PostCategory } from "~/types/post";

const { t } = useI18n();
const { pushToast } = useToasts();
const {
  categories,
  loading: categoriesLoading,
  refresh: refreshCategories,
  createCategory,
  updateCategory,
  removeCategory,
} = useCategories();

const newCategoryName = ref("");
const categoryBusy = ref<string | null>(null);
const pendingDeleteCategory = ref<PostCategory | null>(null);
const renameTarget = ref<PostCategory | null>(null);
const renameName = ref("");
const renameRoot = ref<HTMLElement | null>(null);
const renameInput = ref<HTMLInputElement | null>(null);
const renameOpen = computed(() => !!renameTarget.value);

useModal(renameOpen, {
  container: renameRoot,
  initialFocus: renameInput,
  onClose: () => {
    if (!categoryBusy.value) renameTarget.value = null;
  },
});

onMounted(() => {
  refreshCategories().catch(() => undefined);
});

function apiErrorMessage(err: unknown, fallback: string): string {
  return (
    (err as { data?: { statusMessage?: string }; statusMessage?: string })?.data
      ?.statusMessage ??
    (err as { statusMessage?: string }).statusMessage ??
    fallback
  );
}

async function onAddCategory() {
  const name = newCategoryName.value.trim();
  if (!name || categoryBusy.value) return;
  categoryBusy.value = "new";
  try {
    await createCategory({ name });
    newCategoryName.value = "";
    pushToast(t("admin.categoryCreated"), { tone: "success" });
  } catch (err: unknown) {
    pushToast(apiErrorMessage(err, t("admin.categorySaveFailed")), {
      tone: "danger",
    });
  } finally {
    categoryBusy.value = null;
  }
}

function onRenameCategory(cat: PostCategory) {
  renameTarget.value = cat;
  renameName.value = cat.name;
}

async function confirmRenameCategory() {
  const cat = renameTarget.value;
  const name = renameName.value.trim();
  if (!cat || !name || name === cat.name) {
    renameTarget.value = null;
    return;
  }
  categoryBusy.value = cat.id;
  try {
    await updateCategory(cat.id, { name });
    renameTarget.value = null;
    pushToast(t("admin.categoryRenamed"), { tone: "success" });
  } catch (err: unknown) {
    pushToast(apiErrorMessage(err, t("admin.categorySaveFailed")), {
      tone: "danger",
    });
  } finally {
    categoryBusy.value = null;
  }
}

function requestDeleteCategory(cat: PostCategory) {
  if (categoryBusy.value) return;
  pendingDeleteCategory.value = cat;
}

async function confirmDeleteCategory() {
  const cat = pendingDeleteCategory.value;
  if (!cat) return;
  categoryBusy.value = cat.id;
  try {
    await removeCategory(cat.id);
    pendingDeleteCategory.value = null;
    pushToast(t("admin.categoryDeleted"), { tone: "success" });
  } catch (err: unknown) {
    pushToast(apiErrorMessage(err, t("admin.categorySaveFailed")), {
      tone: "danger",
    });
  } finally {
    categoryBusy.value = null;
  }
}
</script>

<template>
  <div class="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
    <div>
      <h2 class="text-sm font-semibold text-slate-800">
        {{ $t("admin.categoriesTitle") }}
      </h2>
      <p class="text-xs text-slate-500">
        {{ $t("admin.categoriesSubtitle") }}
      </p>
    </div>

    <form class="flex gap-2" @submit.prevent="onAddCategory">
      <label class="sr-only" for="new-category-name">
        {{ $t("admin.categoryNameLabel") }}
      </label>
      <input
        id="new-category-name"
        v-model="newCategoryName"
        type="text"
        maxlength="120"
        class="flex-1 max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
        :placeholder="$t('admin.categoryNamePlaceholder')"
        :disabled="categoryBusy === 'new'"
      />
      <button
        type="submit"
        class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        :disabled="!newCategoryName.trim() || categoryBusy === 'new'"
      >
        {{ $t("admin.categoryAdd") }}
      </button>
    </form>

    <div v-if="categoriesLoading && !categories.length" aria-busy="true">
      <SkeletonList :rows="4" />
    </div>
    <EmptyState
      v-else-if="!categories.length"
      class="my-4"
      illustration="layers"
      :title="$t('admin.categoryEmpty')"
    />
    <table v-else class="min-w-full text-sm">
      <thead
        class="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"
      >
        <tr>
          <th class="text-left px-3 py-2 font-medium">
            {{ $t("admin.categoryColName") }}
          </th>
          <th class="text-left px-3 py-2 font-medium">
            {{ $t("admin.categoryColSlug") }}
          </th>
          <th class="text-right px-3 py-2 font-medium">
            {{ $t("admin.categoryColArticles") }}
          </th>
          <th class="text-right px-3 py-2 font-medium">
            {{ $t("admin.colActions") }}
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        <tr v-for="cat in categories" :key="cat.id">
          <td class="px-3 py-2 font-medium text-slate-800">
            {{ cat.name }}
          </td>
          <td class="px-3 py-2 text-xs text-slate-500">
            {{ cat.slug }}
          </td>
          <td class="px-3 py-2 text-right tabular-nums">
            {{ cat.postCount ?? 0 }}
          </td>
          <td class="px-3 py-2 text-right">
            <div class="inline-flex items-center justify-end gap-1.5">
              <button
                type="button"
                class="text-[11px] px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                :disabled="categoryBusy === cat.id"
                @click="onRenameCategory(cat)"
              >
                {{ $t("admin.categoryRename") }}
              </button>
              <button
                type="button"
                class="text-[11px] px-2 py-1 rounded border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                :disabled="categoryBusy === cat.id"
                @click="requestDeleteCategory(cat)"
              >
                {{ $t("admin.remove") }}
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <ConfirmDialog
    :open="!!pendingDeleteCategory"
    :title="$t('admin.categoryDeleteConfirmTitle')"
    :description="
      pendingDeleteCategory
        ? $t('admin.categoryDeleteConfirm', {
            name: pendingDeleteCategory.name,
            count: pendingDeleteCategory.postCount ?? 0,
          })
        : ''
    "
    :busy="!!categoryBusy"
    @cancel="pendingDeleteCategory = null"
    @confirm="confirmDeleteCategory"
  />

  <Teleport to="body">
    <div
      v-if="renameTarget"
      ref="renameRoot"
      class="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-rename-title"
      @mousedown="
        (e) => {
          if (e.target === e.currentTarget && !categoryBusy)
            renameTarget = null;
        }
      "
    >
      <form
        class="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl ring-1 ring-slate-200"
        @submit.prevent="confirmRenameCategory"
      >
        <h3
          id="admin-rename-title"
          class="text-sm font-semibold text-slate-900"
        >
          {{ $t("admin.categoryRenameTitle") }}
        </h3>
        <label
          class="mt-3 block text-xs font-medium text-slate-600"
          for="admin-rename-input"
        >
          {{ $t("admin.categoryRenameName") }}
        </label>
        <input
          id="admin-rename-input"
          ref="renameInput"
          v-model="renameName"
          type="text"
          required
          maxlength="80"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
          :disabled="!!categoryBusy"
        />
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            :disabled="!!categoryBusy"
            @click="renameTarget = null"
          >
            {{ $t("common.cancel") }}
          </button>
          <button
            type="submit"
            class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            :disabled="!!categoryBusy || !renameName.trim()"
          >
            {{ $t("admin.categoryRenameSave") }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
