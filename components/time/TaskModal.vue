<script setup lang="ts">
import { useDiscardConfirm } from "~/composables/account/useDiscardConfirm";
import { useTaskModalForm } from "~/composables/time/useTaskModalForm";
import type { Task } from "~/types/task";

const props = defineProps<{
  open: boolean;
  task?: Task | null;
  defaultDate?: string;
  defaultEpicId?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "saved", task: Task): void;
  (e: "deleted", id: string): void;
}>();

const { epics } = useEpics();
const rootEl = ref<HTMLElement | null>(null);
const basics = ref<{ titleInputEl: () => HTMLInputElement | null } | null>(
  null,
);
const discardDialog = ref<{
  getKeepBtnEl: () => HTMLButtonElement | null;
} | null>(null);

const openRef = computed(() => props.open);
const taskRef = computed(() => props.task);
const defaultDateRef = computed(() => props.defaultDate);
const defaultEpicIdRef = computed(() => props.defaultEpicId);

const {
  form,
  submitting,
  justSaved,
  errorMsg,
  deleteConfirmOpen,
  totalSpent,
  isDirty,
  onSubmit,
  requestDelete,
  onDelete,
} = useTaskModalForm({
  open: openRef,
  task: taskRef,
  defaultDate: defaultDateRef,
  defaultEpicId: defaultEpicIdRef,
  onSaved: (task) => emit("saved", task),
  onDeleted: (id) => emit("deleted", id),
  onClose: () => emit("close"),
});

const {
  discardConfirmOpen,
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
  epic: `${fid}-epic`,
  priority: `${fid}-priority`,
  notes: `${fid}-notes`,
  status: `${fid}-status`,
  dueDate: `${fid}-due`,
  estimated: `${fid}-est`,
  progress: `${fid}-progress`,
  tags: `${fid}-tags`,
  checklistAdd: `${fid}-check-add`,
  recurs: `${fid}-recurs`,
};

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) cancelDiscard();
  },
);

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
      ? (discardDialog.value?.getKeepBtnEl() ??
        basics.value?.titleInputEl() ??
        null)
      : (basics.value?.titleInputEl() ?? null),
  onClose: handleModalEscape,
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
          class="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl ring-1 ring-slate-200 max-h-[90vh] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-modal-title"
        >
          <div :inert="discardConfirmOpen">
            <TaskModalHeader
              :task="task"
              :task-id="form.id"
              @close="requestClose"
            />

            <form
              class="flex-1 overflow-y-auto scrollbar-thin px-6 py-5 space-y-5"
              @submit.prevent="onSubmit"
            >
              <TaskModalBasics
                ref="basics"
                v-model="form"
                :epics="epics"
                :field-ids="fieldIds"
                :total-spent="totalSpent"
              />

              <TaskModalChecklist
                v-model="form.checklist"
                :add-input-id="fieldIds.checklistAdd"
              />

              <TaskModalSchedule
                v-model="form"
                :recurs-input-id="fieldIds.recurs"
              />

              <p
                v-if="errorMsg"
                class="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"
              >
                {{ errorMsg }}
              </p>
            </form>

            <TaskModalFooter
              :task-id="form.id"
              :submitting="submitting"
              :just-saved="justSaved"
              @cancel="requestClose"
              @delete="requestDelete"
              @save="onSubmit"
            />
          </div>

          <TaskModalDiscardDialog
            ref="discardDialog"
            :open="discardConfirmOpen"
            @keep-editing="cancelDiscard"
            @discard="confirmDiscard"
          />
        </div>
      </div>
    </Transition>
  </Teleport>

  <ConfirmDialog
    :open="deleteConfirmOpen"
    :title="$t('tasks.modal.deleteConfirmTitle')"
    :description="$t('tasks.modal.deleteConfirm')"
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
