<script setup lang="ts">
import { MoneySavingsGoalStatus, type MoneySavingsGoal } from "~/types/money";
import { formatMoneyMinorPlain, parseMoneyMinorInput } from "~/utils/money";

const props = defineProps<{
  open: boolean;
  goal?: MoneySavingsGoal | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "saved", goal: MoneySavingsGoal): void;
  (e: "deleted", id: string): void;
}>();

const { t } = useI18n();
const { currency, intlLocale } = useMoneyCurrency();
const { saveGoal, deleteGoal } = useMoneySavings();
const { pushToast } = useToasts();

interface FormShape {
  id?: string;
  title: string;
  targetText: string;
  status: MoneySavingsGoalStatus;
  targetDate: string;
  note: string;
}

const empty = (): FormShape => ({
  title: "",
  targetText: "",
  status: MoneySavingsGoalStatus.Active,
  targetDate: "",
  note: "",
});

const form = ref<FormShape>(empty());
const submitting = ref(false);
const justSaved = ref(false);
const errorMsg = ref<string | null>(null);
const baseline = ref("");
const discardConfirmOpen = ref(false);
const deleteConfirmOpen = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const formFields = ref<{ titleInputEl: () => HTMLInputElement | null } | null>(
  null,
);
const discardKeepBtn = ref<HTMLButtonElement | null>(null);
const fid = useId();
const fieldIds = {
  title: `${fid}-title`,
  target: `${fid}-target`,
  status: `${fid}-status`,
  targetDate: `${fid}-date`,
  note: `${fid}-note`,
};

function snapshotForm() {
  baseline.value = JSON.stringify(form.value);
}

function isDirty() {
  return JSON.stringify(form.value) !== baseline.value;
}

function loadFrom(goal?: MoneySavingsGoal | null) {
  if (!goal) {
    form.value = empty();
    return;
  }
  form.value = {
    id: goal.id,
    title: goal.title,
    targetText: formatMoneyMinorPlain(
      goal.targetMinor,
      intlLocale.value,
      currency.value,
    ),
    status: goal.status,
    targetDate: goal.targetDate ?? "",
    note: goal.note ?? "",
  };
}

watch(
  () => [props.open, props.goal] as const,
  () => {
    if (props.open) {
      loadFrom(props.goal);
      errorMsg.value = null;
      justSaved.value = false;
      discardConfirmOpen.value = false;
      deleteConfirmOpen.value = false;
      nextTick(() => snapshotForm());
    }
  },
  { immediate: true },
);

async function onSubmit() {
  const targetMinor = parseMoneyMinorInput(
    form.value.targetText,
    currency.value,
  );
  if (!form.value.title.trim()) {
    errorMsg.value = t("money.savings.modal.titleRequired");
    return;
  }
  if (targetMinor == null) {
    errorMsg.value = t("money.savings.modal.targetRequired");
    return;
  }
  submitting.value = true;
  errorMsg.value = null;
  try {
    const saved = await saveGoal({
      id: form.value.id,
      title: form.value.title.trim(),
      targetMinor,
      status: form.value.status,
      targetDate: form.value.targetDate || undefined,
      note: form.value.note.trim() || undefined,
    });
    justSaved.value = true;
    emit("saved", saved);
    setTimeout(() => {
      emit("close");
      justSaved.value = false;
    }, 280);
  } catch (err: unknown) {
    errorMsg.value =
      err instanceof Error
        ? err.message
        : t("money.savings.modal.failedToSave");
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
    await deleteGoal(form.value.id);
    deleteConfirmOpen.value = false;
    pushToast(t("toasts.savingsGoalDeleted"), { tone: "info" });
    emit("deleted", form.value.id);
    emit("close");
  } catch (err: unknown) {
    errorMsg.value =
      err instanceof Error
        ? err.message
        : t("money.savings.modal.failedToDelete");
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
    void onSubmit();
  }
}

function handleModalEscape() {
  if (deleteConfirmOpen.value) {
    deleteConfirmOpen.value = false;
  } else if (discardConfirmOpen.value) {
    discardConfirmOpen.value = false;
  } else {
    requestClose();
  }
}

const isOpen = computed(() => props.open);
useModal(isOpen, {
  container: rootEl,
  initialFocus: () =>
    discardConfirmOpen.value
      ? (discardKeepBtn.value ?? formFields.value?.titleInputEl() ?? null)
      : (formFields.value?.titleInputEl() ?? null),
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
          class="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="savings-goal-modal-title"
        >
          <div :inert="discardConfirmOpen || deleteConfirmOpen">
            <MoneySavingsGoalModalHeader
              :goal-id="form.id"
              @close="requestClose"
            />

            <form
              class="flex-1 space-y-4 overflow-y-auto px-6 py-5 scrollbar-thin"
              @submit.prevent="onSubmit"
            >
              <MoneySavingsGoalModalForm
                ref="formFields"
                v-model="form"
                :field-ids="fieldIds"
              />

              <p
                v-if="errorMsg"
                class="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700"
                role="alert"
              >
                {{ errorMsg }}
              </p>
            </form>

            <MoneySavingsGoalModalFooter
              :goal-id="form.id"
              :submitting="submitting"
              @cancel="requestClose"
              @delete="requestDelete"
              @save="onSubmit"
            />
          </div>

          <div
            v-if="discardConfirmOpen"
            class="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/40 p-4"
          >
            <div
              class="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl ring-1 ring-slate-200"
              role="alertdialog"
            >
              <p class="text-sm font-semibold text-slate-900">
                {{ $t("money.savings.modal.discardTitle") }}
              </p>
              <p class="mt-1 text-xs text-slate-500">
                {{ $t("money.savings.modal.discardBody") }}
              </p>
              <div class="mt-4 flex justify-end gap-2">
                <button
                  ref="discardKeepBtn"
                  type="button"
                  class="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  @click="discardConfirmOpen = false"
                >
                  {{ $t("money.savings.modal.keepEditing") }}
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                  @click="confirmDiscard"
                >
                  {{ $t("money.savings.modal.discard") }}
                </button>
              </div>
            </div>
          </div>

          <div
            v-if="deleteConfirmOpen"
            class="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/40 p-4"
          >
            <div
              class="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl ring-1 ring-slate-200"
              role="alertdialog"
            >
              <p class="text-sm font-semibold text-slate-900">
                {{ $t("money.savings.modal.deleteTitle") }}
              </p>
              <p class="mt-1 text-xs text-slate-500">
                {{ $t("money.savings.modal.deleteBody") }}
              </p>
              <div class="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  class="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  @click="deleteConfirmOpen = false"
                >
                  {{ $t("money.savings.modal.cancel") }}
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                  :disabled="submitting"
                  @click="onDelete"
                >
                  {{ $t("money.savings.modal.delete") }}
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
