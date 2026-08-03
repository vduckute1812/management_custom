<script setup lang="ts">
import {
  MoneyBudgetScope,
  defaultCategoryPickForDirection,
  moneyCategoryPickFromTx,
  MoneyDirection,
  type MoneyBudget,
  type MoneyCategoryPick,
} from "~/types/money";
import { formatMoneyMinorPlain, parseMoneyMinorInput } from "~/utils/money";

const props = defineProps<{
  open: boolean;
  budget?: MoneyBudget | null;
  yearMonth: string;
  defaultCategoryPick?: MoneyCategoryPick | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "saved", budget: MoneyBudget): void;
  (e: "deleted", id: string): void;
}>();

const { t } = useI18n();
const { saveBudget, deleteBudget } = useMoneyBudgets();
const { pushToast } = useToasts();

interface FormShape {
  id?: string;
  scope: typeof MoneyBudgetScope.Overall | typeof MoneyBudgetScope.Category;
  categoryPick: MoneyCategoryPick;
  amountText: string;
}

const empty = (): FormShape => ({
  scope: MoneyBudgetScope.Category,
  categoryPick:
    props.defaultCategoryPick ??
    defaultCategoryPickForDirection(MoneyDirection.Out),
  amountText: "",
});

const form = ref<FormShape>(empty());
const submitting = ref(false);
const errorMsg = ref<string | null>(null);
const deleteConfirmOpen = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const amountInput = ref<HTMLInputElement | null>(null);
const fid = useId();

watch(
  () => [props.open, props.budget] as const,
  () => {
    if (!props.open) return;
    errorMsg.value = null;
    deleteConfirmOpen.value = false;
    if (!props.budget) {
      form.value = empty();
      return;
    }
    const pick =
      moneyCategoryPickFromTx({
        category: props.budget.category ?? null,
        userCategoryId: props.budget.userCategoryId,
      }) ?? defaultCategoryPickForDirection(MoneyDirection.Out);
    form.value = {
      id: props.budget.id,
      scope: props.budget.scope,
      categoryPick: pick,
      amountText: formatMoneyMinorPlain(props.budget.amountMinor),
    };
  },
  { immediate: true },
);

const isOpen = computed(() => props.open);
useModal(isOpen, {
  container: rootEl,
  initialFocus: amountInput,
  onClose: () => {
    if (deleteConfirmOpen.value) deleteConfirmOpen.value = false;
    else emit("close");
  },
});

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) emit("close");
}

async function onSubmit() {
  const amountMinor = parseMoneyMinorInput(form.value.amountText);
  if (amountMinor == null) {
    errorMsg.value = t("money.budgets.modal.amountRequired");
    return;
  }
  submitting.value = true;
  errorMsg.value = null;
  try {
    const pick = form.value.categoryPick;
    const saved = await saveBudget({
      id: form.value.id,
      yearMonth: props.yearMonth,
      scope: form.value.scope,
      category:
        form.value.scope === MoneyBudgetScope.Overall
          ? null
          : pick.kind === "builtin"
            ? pick.category
            : null,
      userCategoryId:
        form.value.scope === MoneyBudgetScope.Overall
          ? null
          : pick.kind === "custom"
            ? pick.userCategoryId
            : null,
      amountMinor,
    });
    emit("saved", saved);
    emit("close");
  } catch (err: unknown) {
    errorMsg.value =
      err instanceof Error
        ? err.message
        : t("money.budgets.modal.failedToSave");
  } finally {
    submitting.value = false;
  }
}

async function onDelete() {
  if (!form.value.id) return;
  submitting.value = true;
  try {
    await deleteBudget(form.value.id);
    pushToast(t("toasts.budgetDeleted"), { tone: "info" });
    emit("deleted", form.value.id);
    emit("close");
  } catch (err: unknown) {
    errorMsg.value =
      err instanceof Error
        ? err.message
        : t("money.budgets.modal.failedToDelete");
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        ref="rootEl"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
        @mousedown="onBackdrop"
      >
        <div
          class="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="budget-modal-title"
          @mousedown.stop
        >
          <header
            class="flex items-center justify-between border-b border-slate-200 px-6 py-4"
          >
            <h2
              id="budget-modal-title"
              class="text-lg font-semibold text-slate-900"
            >
              {{
                form.id
                  ? $t("money.budgets.modal.editTitle")
                  : $t("money.budgets.modal.newTitle")
              }}
            </h2>
            <button
              type="button"
              class="text-slate-400 transition hover:text-slate-700"
              :aria-label="$t('money.budgets.modal.close')"
              @click="emit('close')"
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

          <form class="space-y-4 px-6 py-5" @submit.prevent="onSubmit">
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="rounded-lg px-3 py-2 text-sm font-semibold ring-1 transition"
                :class="
                  form.scope === MoneyBudgetScope.Overall
                    ? 'bg-slate-900 text-white ring-slate-900'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                "
                :aria-pressed="form.scope === MoneyBudgetScope.Overall"
                @click="form.scope = MoneyBudgetScope.Overall"
              >
                {{ $t("money.budgets.scope.overall") }}
              </button>
              <button
                type="button"
                class="rounded-lg px-3 py-2 text-sm font-semibold ring-1 transition"
                :class="
                  form.scope === MoneyBudgetScope.Category
                    ? 'bg-slate-900 text-white ring-slate-900'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                "
                :aria-pressed="form.scope === MoneyBudgetScope.Category"
                @click="form.scope = MoneyBudgetScope.Category"
              >
                {{ $t("money.budgets.scope.category") }}
              </button>
            </div>

            <div v-if="form.scope === MoneyBudgetScope.Category">
              <label
                class="mb-1 block text-xs font-medium text-slate-600"
                :for="`${fid}-cat`"
              >
                {{ $t("money.budgets.modal.category") }}
              </label>
              <MoneyCategorySelect
                :id="`${fid}-cat`"
                :model-value="form.categoryPick"
                mode="expense"
                allow-create
                @update:model-value="
                  (v) => {
                    if (v != null) form.categoryPick = v;
                  }
                "
              />
            </div>

            <div>
              <label
                class="mb-1 block text-xs font-medium text-slate-600"
                :for="`${fid}-amt`"
              >
                {{ $t("money.budgets.modal.amount") }}
              </label>
              <input
                :id="`${fid}-amt`"
                ref="amountInput"
                v-model="form.amountText"
                type="text"
                inputmode="numeric"
                required
                :placeholder="$t('money.budgets.modal.amountPlaceholder')"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </div>

            <p
              v-if="errorMsg"
              class="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700"
              role="alert"
            >
              {{ errorMsg }}
            </p>

            <div class="flex items-center justify-between gap-2 pt-1">
              <button
                v-if="form.id"
                type="button"
                class="text-xs font-semibold text-rose-600 hover:text-rose-700"
                :disabled="submitting"
                @click="deleteConfirmOpen = true"
              >
                {{ $t("money.budgets.modal.delete") }}
              </button>
              <div v-else />
              <div class="flex gap-2">
                <button
                  type="button"
                  class="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  @click="emit('close')"
                >
                  {{ $t("money.budgets.modal.cancel") }}
                </button>
                <button
                  type="submit"
                  class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  :disabled="submitting"
                >
                  {{
                    submitting
                      ? $t("money.budgets.modal.saving")
                      : $t("money.budgets.modal.save")
                  }}
                </button>
              </div>
            </div>
          </form>

          <div
            v-if="deleteConfirmOpen"
            class="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/40 p-4"
          >
            <div
              class="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl ring-1 ring-slate-200"
              role="alertdialog"
            >
              <p class="text-sm font-semibold text-slate-900">
                {{ $t("money.budgets.modal.deleteTitle") }}
              </p>
              <p class="mt-1 text-xs text-slate-500">
                {{ $t("money.budgets.modal.deleteBody") }}
              </p>
              <div class="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  class="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  @click="deleteConfirmOpen = false"
                >
                  {{ $t("money.budgets.modal.cancel") }}
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                  :disabled="submitting"
                  @click="onDelete"
                >
                  {{ $t("money.budgets.modal.delete") }}
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
