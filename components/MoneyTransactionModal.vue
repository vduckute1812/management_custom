<script setup lang="ts">
import {
  MONEY_CATEGORIES,
  MONEY_CATEGORY_COLORS,
  MONEY_CATEGORY_I18N_KEYS,
  MoneyCategory,
  MoneyDirection,
  coerceCategoryForDirection,
  defaultCategoryForDirection,
  type MoneyTransaction,
} from "~/types/money";
import { formatMoneyMinorPlain, parseMoneyMinorInput } from "~/utils/money";

const props = defineProps<{
  open: boolean;
  transaction?: MoneyTransaction | null;
  defaultDate?: string;
  /** Prefer this category when creating (e.g. from a filter chip). */
  defaultCategory?: MoneyCategory | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "saved", tx: MoneyTransaction): void;
  (e: "deleted", id: string): void;
}>();

const { t } = useI18n();
const { saveTransaction, deleteTransaction } = useMoney();
const { pushToast } = useToasts();

interface FormShape {
  id?: string;
  occurredOn: string;
  amountText: string;
  direction: typeof MoneyDirection.Out | typeof MoneyDirection.In;
  category: MoneyCategory;
  note: string;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const empty = (): FormShape => {
  const direction = MoneyDirection.Out;
  const preferred = props.defaultCategory ?? null;
  const category =
    preferred != null
      ? coerceCategoryForDirection(preferred, direction)
      : defaultCategoryForDirection(direction);
  return {
    occurredOn: todayIso(),
    amountText: "",
    direction,
    category,
    note: "",
  };
};

const form = ref<FormShape>(empty());
const submitting = ref(false);
const justSaved = ref(false);
const errorMsg = ref<string | null>(null);
const baseline = ref("");
const discardConfirmOpen = ref(false);
const deleteConfirmOpen = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const amountInput = ref<HTMLInputElement | null>(null);
const discardKeepBtn = ref<HTMLButtonElement | null>(null);
const fid = useId();
const fieldIds = {
  amount: `${fid}-amount`,
  occurredOn: `${fid}-date`,
  direction: `${fid}-dir`,
  category: `${fid}-cat`,
  note: `${fid}-note`,
};

function snapshotForm() {
  baseline.value = JSON.stringify(form.value);
}

function isDirty() {
  return JSON.stringify(form.value) !== baseline.value;
}

function loadFrom(tx?: MoneyTransaction | null) {
  if (!tx) {
    form.value = {
      ...empty(),
      occurredOn: props.defaultDate || todayIso(),
    };
    return;
  }
  form.value = {
    id: tx.id,
    occurredOn: tx.occurredOn,
    amountText: formatMoneyMinorPlain(tx.amountMinor),
    direction: tx.direction,
    category: tx.category,
    note: tx.note ?? "",
  };
}

function setDirection(
  direction: typeof MoneyDirection.Out | typeof MoneyDirection.In,
) {
  form.value.direction = direction;
  form.value.category = coerceCategoryForDirection(
    form.value.category,
    direction,
  );
}

watch(
  () => [props.open, props.transaction] as const,
  () => {
    if (props.open) {
      loadFrom(props.transaction);
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
  const amountMinor = parseMoneyMinorInput(form.value.amountText);
  if (amountMinor == null) {
    errorMsg.value = t("money.modal.amountRequired");
    return;
  }
  if (!form.value.occurredOn) {
    errorMsg.value = t("money.modal.dateRequired");
    return;
  }
  submitting.value = true;
  errorMsg.value = null;
  try {
    const saved = await saveTransaction({
      id: form.value.id,
      occurredOn: form.value.occurredOn,
      amountMinor,
      direction: form.value.direction,
      category: form.value.category,
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
      err instanceof Error ? err.message : t("money.modal.failedToSave");
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
    await deleteTransaction(form.value.id);
    deleteConfirmOpen.value = false;
    pushToast(t("toasts.moneyTransactionDeleted"), { tone: "info" });
    emit("deleted", form.value.id);
    emit("close");
  } catch (err: unknown) {
    errorMsg.value =
      err instanceof Error ? err.message : t("money.modal.failedToDelete");
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
      ? (discardKeepBtn.value ?? amountInput.value)
      : amountInput.value,
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
          aria-labelledby="money-modal-title"
        >
          <header
            class="flex items-center justify-between border-b border-slate-200 px-6 py-4"
          >
            <h2
              id="money-modal-title"
              class="text-lg font-semibold text-slate-900"
            >
              {{
                form.id
                  ? $t("money.modal.editTitle")
                  : $t("money.modal.newTitle")
              }}
            </h2>
            <button
              type="button"
              class="text-slate-400 transition hover:text-slate-700"
              :aria-label="$t('money.modal.close')"
              @click="requestClose"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="h-5 w-5"
              >
                <path d="M6 6l12 12M6 18L18 6" stroke-linecap="round" />
              </svg>
            </button>
          </header>

          <form
            class="flex-1 space-y-4 overflow-y-auto px-6 py-5 scrollbar-thin"
            @submit.prevent="onSubmit"
          >
            <div class="grid grid-cols-2 gap-3">
              <button
                type="button"
                class="rounded-lg px-3 py-2 text-sm font-semibold ring-1 transition"
                :class="
                  form.direction === MoneyDirection.Out
                    ? 'bg-rose-50 text-rose-700 ring-rose-200'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                "
                :aria-pressed="form.direction === MoneyDirection.Out"
                @click="setDirection(MoneyDirection.Out)"
              >
                {{ $t("money.direction.out") }}
              </button>
              <button
                type="button"
                class="rounded-lg px-3 py-2 text-sm font-semibold ring-1 transition"
                :class="
                  form.direction === MoneyDirection.In
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                "
                :aria-pressed="form.direction === MoneyDirection.In"
                @click="setDirection(MoneyDirection.In)"
              >
                {{ $t("money.direction.in") }}
              </button>
            </div>

            <div>
              <label
                class="mb-1 block text-xs font-medium text-slate-600"
                :for="fieldIds.amount"
              >
                {{ $t("money.modal.amount") }}
              </label>
              <input
                :id="fieldIds.amount"
                ref="amountInput"
                v-model="form.amountText"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                required
                :placeholder="$t('money.modal.amountPlaceholder')"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </div>

            <div>
              <label
                class="mb-1 block text-xs font-medium text-slate-600"
                :for="fieldIds.occurredOn"
              >
                {{ $t("money.modal.date") }}
              </label>
              <input
                :id="fieldIds.occurredOn"
                v-model="form.occurredOn"
                type="date"
                required
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </div>

            <div>
              <p
                :id="fieldIds.category"
                class="mb-2 text-xs font-medium text-slate-600"
              >
                {{ $t("money.modal.category") }}
              </p>
              <div
                class="flex flex-wrap gap-1.5"
                role="group"
                :aria-labelledby="fieldIds.category"
              >
                <button
                  v-for="cat in MONEY_CATEGORIES"
                  :key="cat"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 transition"
                  :class="
                    form.category === cat
                      ? 'bg-slate-900 text-white ring-slate-900'
                      : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
                  "
                  :aria-pressed="form.category === cat"
                  @click="form.category = cat"
                >
                  <span
                    class="h-2 w-2 rounded-full"
                    :style="{ backgroundColor: MONEY_CATEGORY_COLORS[cat] }"
                    aria-hidden="true"
                  />
                  {{ $t(MONEY_CATEGORY_I18N_KEYS[cat]) }}
                </button>
              </div>
            </div>

            <div>
              <label
                class="mb-1 block text-xs font-medium text-slate-600"
                :for="fieldIds.note"
              >
                {{ $t("money.modal.note") }}
              </label>
              <input
                :id="fieldIds.note"
                v-model="form.note"
                type="text"
                maxlength="500"
                :placeholder="$t('money.modal.notePlaceholder')"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </div>

            <p
              v-if="errorMsg"
              class="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700"
              role="alert"
            >
              {{ errorMsg }}
            </p>
          </form>

          <footer
            class="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4"
          >
            <button
              v-if="form.id"
              type="button"
              class="text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
              :disabled="submitting"
              @click="requestDelete"
            >
              {{ $t("money.modal.delete") }}
            </button>
            <div v-else />
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                :disabled="submitting"
                @click="requestClose"
              >
                {{ $t("money.modal.cancel") }}
              </button>
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
                :disabled="submitting"
                @click="onSubmit"
              >
                {{
                  submitting ? $t("money.modal.saving") : $t("money.modal.save")
                }}
              </button>
            </div>
          </footer>

          <div
            v-if="discardConfirmOpen"
            class="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/40 p-4"
          >
            <div
              class="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl ring-1 ring-slate-200"
              role="alertdialog"
              :aria-label="$t('money.modal.discardTitle')"
            >
              <p class="text-sm font-semibold text-slate-900">
                {{ $t("money.modal.discardTitle") }}
              </p>
              <p class="mt-1 text-xs text-slate-500">
                {{ $t("money.modal.discardBody") }}
              </p>
              <div class="mt-4 flex justify-end gap-2">
                <button
                  ref="discardKeepBtn"
                  type="button"
                  class="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  @click="discardConfirmOpen = false"
                >
                  {{ $t("money.modal.keepEditing") }}
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                  @click="confirmDiscard"
                >
                  {{ $t("money.modal.discard") }}
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
              :aria-label="$t('money.modal.deleteTitle')"
            >
              <p class="text-sm font-semibold text-slate-900">
                {{ $t("money.modal.deleteTitle") }}
              </p>
              <p class="mt-1 text-xs text-slate-500">
                {{ $t("money.modal.deleteBody") }}
              </p>
              <div class="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  class="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  @click="deleteConfirmOpen = false"
                >
                  {{ $t("money.modal.cancel") }}
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                  :disabled="submitting"
                  @click="onDelete"
                >
                  {{ $t("money.modal.delete") }}
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
