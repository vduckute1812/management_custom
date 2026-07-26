<script setup lang="ts">
import {
  EPIC_COLORS,
  EPIC_COLOR_CLASSES,
  STATUS_I18N_KEYS,
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

const { t } = useI18n();
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
const baseline = ref("");
const discardConfirmOpen = ref(false);

function colorLabel(c: EpicColor): string {
  return t(`epics.colors.${c}`);
}

function snapshotForm() {
  baseline.value = JSON.stringify(form.value);
}

function isDirty() {
  return JSON.stringify(form.value) !== baseline.value;
}

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
      discardConfirmOpen.value = false;
      nextTick(() => snapshotForm());
    }
  },
  { immediate: true }
);

async function onSubmit() {
  if (!form.value.title.trim()) {
    errorMsg.value = t("epics.modal.titleRequired");
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
        .map((tag) => tag.trim())
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
    errorMsg.value =
      err instanceof Error ? err.message : t("epics.modal.failedToSave");
  } finally {
    submitting.value = false;
  }
}

async function onDelete() {
  if (!form.value.id) return;
  // Epic delete cascades epicId removal; we keep the confirm dialog per spec.
  if (!confirm(t("epics.modal.deleteConfirm"))) return;
  submitting.value = true;
  try {
    await deleteEpic(form.value.id);
    pushToast(t("toasts.epicDeletedPreserved"), { tone: "info" });
    emit("deleted", form.value.id);
    emit("close");
  } catch (err: unknown) {
    errorMsg.value =
      err instanceof Error ? err.message : t("epics.modal.failedToDelete");
  } finally {
    submitting.value = false;
  }
}

function requestClose() {
  if (submitting.value) return;
  if (justSaved.value || !isDirty()) {
    emit("close");
    return;
  }
  discardConfirmOpen.value = true;
}

function confirmDiscard() {
  discardConfirmOpen.value = false;
  emit("close");
}

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) requestClose();
}

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    onSubmit();
  } else if (e.key === "Escape") {
    e.preventDefault();
    if (discardConfirmOpen.value) {
      discardConfirmOpen.value = false;
    } else {
      requestClose();
    }
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
          class="relative bg-white w-full max-w-xl rounded-2xl shadow-2xl ring-1 ring-slate-200 max-h-[90vh] flex flex-col"
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
              {{ form.id ? $t("epics.modal.editEpic") : $t("epics.modal.newEpic") }}
            </h2>
            <button
              type="button"
              class="text-slate-400 hover:text-slate-700 transition"
              :aria-label="$t('epics.modal.close')"
              @click="requestClose"
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
                {{ $t("epics.modal.title") }}
              </label>
              <input
                v-model="form.title"
                type="text"
                required
                :placeholder="$t('epics.modal.titlePlaceholder')"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">
                {{ $t("epics.modal.description") }}
              </label>
              <textarea
                v-model="form.description"
                rows="3"
                :placeholder="$t('epics.modal.descriptionPlaceholder')"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none resize-y"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-600 mb-2">
                {{ $t("epics.modal.colorIdentity") }}
                <span class="text-slate-400 font-normal">
                  {{ $t("epics.modal.colorHint") }}
                </span>
              </label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="c in EPIC_COLORS"
                  :key="c"
                  type="button"
                  class="w-8 h-8 rounded-lg ring-1 ring-slate-200 hover:scale-105 transition flex items-center justify-center"
                  :class="EPIC_COLOR_CLASSES[c].solid"
                  :title="colorLabel(c)"
                  :aria-label="$t('epics.modal.useColor', { color: colorLabel(c) })"
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
                  {{ $t("epics.modal.status") }}
                </label>
                <select
                  v-model.number="form.status"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none bg-white"
                >
                  <option :value="TaskStatus.Todo">
                    {{ $t(STATUS_I18N_KEYS[TaskStatus.Todo]) }}
                  </option>
                  <option :value="TaskStatus.InProgress">
                    {{ $t(STATUS_I18N_KEYS[TaskStatus.InProgress]) }}
                  </option>
                  <option :value="TaskStatus.Done">
                    {{ $t(STATUS_I18N_KEYS[TaskStatus.Done]) }}
                  </option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">
                  {{ $t("epics.modal.targetCompletion") }}
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
                {{ $t("epics.modal.tags") }}
              </label>
              <input
                v-model="form.tags"
                type="text"
                :placeholder="$t('epics.modal.tagsPlaceholder')"
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
              {{ $t("epics.modal.deleteEpic") }}
            </button>
            <span v-else />
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition"
                @click="requestClose"
              >
                {{ $t("epics.modal.cancel") }}
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
                    ? $t("epics.modal.saved")
                    : submitting
                    ? $t("epics.modal.saving")
                    : form.id
                    ? $t("epics.modal.saveChanges")
                    : $t("epics.modal.createEpic")
                }}
              </button>
            </div>
          </footer>

          <div
            v-if="discardConfirmOpen"
            class="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/40 rounded-2xl p-4"
            role="alertdialog"
            aria-labelledby="epic-discard-title"
            aria-describedby="epic-discard-desc"
          >
            <div class="bg-white rounded-xl shadow-xl ring-1 ring-slate-200 p-5 max-w-sm w-full">
              <h3
                id="epic-discard-title"
                class="text-sm font-semibold text-slate-900"
              >
                {{ $t("epics.modal.discardTitle") }}
              </h3>
              <p id="epic-discard-desc" class="mt-1 text-xs text-slate-500">
                {{ $t("epics.modal.discardBody") }}
              </p>
              <div class="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                  @click="discardConfirmOpen = false"
                >
                  {{ $t("epics.modal.keepEditing") }}
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg"
                  @click="confirmDiscard"
                >
                  {{ $t("epics.modal.discard") }}
                </button>
              </div>
            </div>
          </div>
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
