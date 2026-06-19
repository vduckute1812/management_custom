<script setup lang="ts">
import type { Epic } from "~/types/task";

const { epics, fetchAll, isLoading, error } = useEpics();
const { fetchAll: fetchTasks } = useTasks();
const { pushToast } = useToasts();
const { load: loadSamples } = useSampleData();

const modalOpen = ref(false);
const editingEpic = ref<Epic | null>(null);
const seeding = ref(false);

await useAsyncData("epics:initial", async () => {
  await Promise.all([fetchAll(), fetchTasks()]);
  return { ok: true };
});

usePageShortcuts([
  { key: "e", handler: () => openCreate() },
]);

function openCreate() {
  editingEpic.value = null;
  modalOpen.value = true;
}

function openEdit(epic: Epic) {
  editingEpic.value = epic;
  modalOpen.value = true;
}

async function onSaved() {
  modalOpen.value = false;
  await fetchAll();
}

async function onDeleted() {
  modalOpen.value = false;
  await Promise.all([fetchAll(), fetchTasks()]);
}

async function seedSamples() {
  seeding.value = true;
  try {
    await loadSamples();
    pushToast("Sample data loaded", { tone: "success" });
  } catch (err) {
    pushToast(
      err instanceof Error ? err.message : "Failed to load samples",
      { tone: "danger" }
    );
  } finally {
    seeding.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col h-screen">
    <header
      class="px-4 md:px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between"
    >
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Epics</h1>
        <p class="text-xs text-slate-500 mt-0.5">
          High-level containers that aggregate hours from their child tasks
        </p>
      </div>
      <button
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white shadow-sm"
        @click="openCreate"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          class="w-4 h-4"
        >
          <path d="M12 5v14M5 12h14" stroke-linecap="round" />
        </svg>
        New epic
        <kbd class="hidden sm:inline px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">e</kbd>
      </button>
    </header>

    <div
      v-if="error"
      class="px-6 py-2 bg-rose-50 text-rose-700 text-sm border-b border-rose-200"
    >
      {{ error }}
    </div>

    <div class="flex-1 overflow-y-auto scrollbar-thin p-6">
      <SkeletonList v-if="isLoading" variant="card" :rows="3" />

      <div
        v-else-if="epics.length === 0"
        class="h-full flex items-center justify-center"
      >
        <EmptyState
          title="Group related work under an Epic"
          description="An Epic stores no hours itself — totals roll up from child tasks. Try a sample or create one now."
          illustration="layers"
          primary-label="Create epic"
          primary-shortcut="e"
          secondary-label="Load sample data"
          :secondary-loading="seeding"
          @primary="openCreate"
          @secondary="seedSamples"
        />
      </div>

      <div
        v-else
        class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
      >
        <EpicCard
          v-for="epic in epics"
          :key="epic.id"
          :epic="epic"
          :href="`/epics/${epic.id}`"
          @edit="openEdit"
        />
      </div>
    </div>

    <EpicModal
      :open="modalOpen"
      :epic="editingEpic"
      @close="modalOpen = false"
      @saved="onSaved"
      @deleted="onDeleted"
    />
  </div>
</template>
