<script setup lang="ts">
import {
  EPIC_COLORS,
  EPIC_COLOR_CLASSES,
  TaskStatus,
  type Epic,
  type EpicColor,
} from "~/types/task";

const props = defineProps<{
  open: boolean;
  epic?: Epic | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "saved", epic: Epic): void;
  (e: "deleted", id: string): void;
}>();

const { saveEpic, deleteEpic } = useEpics();
const { pushToast } = useToasts();

interface FormShape {
  id?: string;
  title: string;
  description: string;
  status: TaskStatus;
  color: EpicColor;
  dueDate: string;
  tags: string;
}

const empty: FormShape = {
  title: "",
  description: "",
  status: TaskStatus.Todo,
  color: "brand",
  dueDate: "",
  tags: "",
};

const form = ref<FormShape>({ ...empty });
const submitting = ref(false);
const justSaved = ref(false);
const errorMsg = ref<string | null>(null);

function loadFrom(epic?: Epic | null) {
  if (!epic) {
    form.value = { ...empty };
    return;
  }
  form.value = {
    id: epic.id,
    title: epic.title,
    description: epic.description ?? "",
    status: epic.status,
    color: epic.color ?? "brand",
    dueDate: epic.dueDate ?? "",
    tags: (epic.tags ?? []).join(", "),
  };
}

watch(
  () => [props.open, props.epic],
  () => {
    if (props.open) {
      loadFrom(props.epic);
      errorMsg.value = null;
      justSaved.value = false;
    }
  },
  { immediate: true }
);

async function onSubmit() {
  if (!form.value.title.trim()) {
    errorMsg.value = "Title is required.";
    return;
  }
  submitting.value = true;
  errorMsg.value = null;
  try {
    const payload: Partial<Epic> = {
      id: form.value.id,
      title: form.value.title.trim(),
      description: form.value.description,
      status: form.value.status,
      color: form.value.color,
      dueDate: form.value.dueDate || undefined,
      tags: form.value.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    const saved = await saveEpic(payload);
    justSaved.value = true;
    emit("saved", saved);
    setTimeout(() => {
      emit("close");
      justSaved.value = false;
    }, 320);
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : "Failed to save epic";
  } finally {
    submitting.value = false;
  }
}

async function onDelete() {
  if (!form.value.id) return;
  // Epic delete cascades epicId removal; we keep the confirm dialog per spec.
  if (
    !confirm(
      "Delete this epic? Child tasks will be kept but their epic link will be cleared."
    )
  )
    return;
  submitting.value = true;
  try {
    await deleteEpic(form.value.id);
    pushToast("Epic deleted. Child tasks were preserved.", { tone: "info" });
    emit("deleted", form.value.id);
    emit("close");
  } catch (err: unknown) {
    errorMsg.value =
      err instanceof Error ? err.message : "Failed to delete epic";
  } finally {
    submitting.value = false;
  }
}

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) emit("close");
}

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    onSubmit();
  } else if (e.key === "Escape") {
    e.preventDefault();
    emit("close");
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
        @mousedown="onBackdrop"
        @keydown="onKeydown"
      >
        <div
          class="bg-white w-full max-w-xl rounded-2xl shadow-2xl ring-1 ring-slate-200 max-h-[90vh] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-labelledby="epic-modal-title"
        >
          <header
            class="flex items-center justify-between px-6 py-4 border-b border-slate-200"
          >
            <h2 id="epic-modal-title" class="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <span
                class="w-2.5 h-2.5 rounded-full"
                :class="EPIC_COLOR_CLASSES[form.color].solid"
                aria-hidden="true"
              />
              {{ form.id ? "Edit epic" : "New epic" }}
            </h2>
            <button
              type="button"
              class="text-slate-400 hover:text-slate-700 transition"
              aria-label="Close"
              @click="emit('close')"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="w-5 h-5"
              >
                <path d="M6 6l12 12M6 18L18 6" stroke-linecap="round" />
              </svg>
            </button>
          </header>

          <form
            class="flex-1 overflow-y-auto scrollbar-thin px-6 py-5 space-y-5"
            @submit.prevent="onSubmit"
          >
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">
                Title
              </label>
              <input
                v-model="form.title"
                type="text"
                required
                placeholder="A goal or project area"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">
                Description (Markdown supported)
              </label>
              <textarea
                v-model="form.description"
                rows="3"
                placeholder="High-level summary of the work this epic covers."
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none resize-y"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-600 mb-2">
                Color identity
                <span class="text-slate-400 font-normal">
                  · child task blocks inherit this color
                </span>
              </label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="c in EPIC_COLORS"
                  :key="c"
                  type="button"
                  class="w-8 h-8 rounded-lg ring-1 ring-slate-200 hover:scale-105 transition flex items-center justify-center"
                  :class="EPIC_COLOR_CLASSES[c].solid"
                  :title="EPIC_COLOR_CLASSES[c].label"
                  :aria-label="`Use ${EPIC_COLOR_CLASSES[c].label} color`"
                  :aria-pressed="form.color === c"
                  @click="form.color = c"
                >
                  <svg
                    v-if="form.color === c"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    stroke-width="3"
                    class="w-4 h-4"
                  >
                    <polyline points="20 6 9 17 4 12" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">
                  Status
                </label>
                <select
                  v-model.number="form.status"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none bg-white"
                >
                  <option :value="TaskStatus.Todo">To do</option>
                  <option :value="TaskStatus.InProgress">In progress</option>
                  <option :value="TaskStatus.Done">Done</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">
                  Target completion
                </label>
                <input
                  v-model="form.dueDate"
                  type="date"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
                />
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">
                Tags (comma separated)
              </label>
              <input
                v-model="form.tags"
                type="text"
                placeholder="ml, vision, infra"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
              />
            </div>

            <p
              v-if="errorMsg"
              class="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"
            >
              {{ errorMsg }}
            </p>
          </form>

          <footer
            class="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl"
          >
            <button
              v-if="form.id"
              type="button"
              :disabled="submitting"
              class="text-sm font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"
              @click="onDelete"
            >
              Delete epic
            </button>
            <span v-else />
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition"
                @click="emit('close')"
              >
                Cancel
              </button>
              <button
                type="button"
                :disabled="submitting"
                class="px-4 py-2 text-sm font-medium bg-brand-600 hover:bg-brand-700 text-white rounded-lg shadow-sm disabled:opacity-50 inline-flex items-center gap-2"
                @click="onSubmit"
              >
                <svg
                  v-if="justSaved"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  class="w-4 h-4"
                >
                  <polyline points="20 6 9 17 4 12" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                {{
                  justSaved
                    ? "Saved"
                    : submitting
                    ? "Saving…"
                    : form.id
                    ? "Save changes"
                    : "Create epic"
                }}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
