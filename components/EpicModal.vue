<script setup lang="ts">
import { useDiscardConfirm } from "~/composables/useDiscardConfirm";
import { TaskStatus, type Epic, type EpicColor } from "~/types/task";

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
const deleteConfirmOpen = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const basics = ref<{ titleInputEl: () => HTMLInputElement | null } | null>(
  null,
);
const {
  discardConfirmOpen,
  discardKeepBtn,
  requestClose: requestDiscardClose,
  confirmDiscard,
  cancelDiscard,
} = useDiscardConfirm({
  isDirty: () => !justSaved.value && isDirty(),
  onDiscard: () => emit("close"),
});
const fid = useId();
const fieldIds = {
  title: `${fid}-title`,
  description: `${fid}-desc`,
  status: `${fid}-status`,
  dueDate: `${fid}-due`,
  tags: `${fid}-tags`,
};

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
      cancelDiscard();
      deleteConfirmOpen.value = false;
      nextTick(() => snapshotForm());
    }
  },
  { immediate: true },
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

function requestDelete() {
  if (!form.value.id || submitting.value) return;
  deleteConfirmOpen.value = true;
}

async function onDelete() {
  if (!form.value.id) return;
  submitting.value = true;
  try {
    await deleteEpic(form.value.id);
    deleteConfirmOpen.value = false;
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
  requestDiscardClose();
}

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) requestClose();
}

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    onSubmit();
  }
}

function handleModalEscape() {
  if (deleteConfirmOpen.value) {
    deleteConfirmOpen.value = false;
  } else if (discardConfirmOpen.value) {
    cancelDiscard();
  } else {
    requestClose();
  }
}

const isOpen = computed(() => props.open);
useModal(isOpen, {
  container: rootEl,
  initialFocus: () =>
    discardConfirmOpen.value
      ? (discardKeepBtn.value ?? basics.value?.titleInputEl() ?? null)
      : (basics.value?.titleInputEl() ?? null),
  onClose: handleModalEscape,
});

watch(discardConfirmOpen, (open) => {
  if (open) nextTick(() => discardKeepBtn.value?.focus());
});
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        ref="rootEl"
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
          <div :inert="discardConfirmOpen">
            <EpicModalHeader
              :epic-id="form.id"
              :color="form.color"
              @close="requestClose"
            />

            <form
              class="flex-1 overflow-y-auto scrollbar-thin px-6 py-5 space-y-5"
              @submit.prevent="onSubmit"
            >
              <EpicModalBasics
                ref="basics"
                v-model="form"
                :field-ids="fieldIds"
              />

              <p
                v-if="errorMsg"
                class="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"
              >
                {{ errorMsg }}
              </p>
            </form>

            <EpicModalFooter
              :epic-id="form.id"
              :submitting="submitting"
              :just-saved="justSaved"
              @cancel="requestClose"
              @delete="requestDelete"
              @save="onSubmit"
            />
          </div>

          <div
            v-if="discardConfirmOpen"
            class="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/40 rounded-2xl p-4"
            role="alertdialog"
            aria-labelledby="epic-discard-title"
            aria-describedby="epic-discard-desc"
          >
            <div
              class="bg-white rounded-xl shadow-xl ring-1 ring-slate-200 p-5 max-w-sm w-full"
            >
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
                  ref="discardKeepBtn"
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                  @click="cancelDiscard"
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

  <ConfirmDialog
    :open="deleteConfirmOpen"
    :title="$t('epics.modal.deleteConfirmTitle')"
    :description="$t('epics.modal.deleteConfirm')"
    :busy="submitting"
    @cancel="deleteConfirmOpen = false"
    @confirm="onDelete"
  />
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
