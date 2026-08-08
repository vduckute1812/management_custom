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
const { currency, intlLocale } = useMoneyCurrency();
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
const formFields = ref<{
  amountInputEl: () => HTMLInputElement | null;
} | null>(null);
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
      amountText: formatMoneyMinorPlain(
        props.budget.amountMinor,
        intlLocale.value,
        currency.value,
      ),
    };
  },
  { immediate: true },
);

const isOpen = computed(() => props.open);
useModal(isOpen, {
  container: rootEl,
  initialFocus: () => formFields.value?.amountInputEl() ?? null,
  onClose: () => {
    if (deleteConfirmOpen.value) deleteConfirmOpen.value = false;
    else emit("close");
  },
});

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) emit("close");
}

async function onSubmit() {
  const amountMinor = parseMoneyMinorInput(
    form.value.amountText,
    currency.value,
  );
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
          <div :inert="deleteConfirmOpen">
            <MoneyBudgetModalHeader
              :budget-id="form.id"
              @close="emit('close')"
            />
            <form @submit.prevent="onSubmit">
              <MoneyBudgetModalForm
                ref="formFields"
                :scope="form.scope"
                :category-pick="form.categoryPick"
                :amount-text="form.amountText"
                :amount-input-id="`${fid}-amt`"
                :category-input-id="`${fid}-cat`"
                :error-msg="errorMsg"
                @update:scope="form.scope = $event"
                @update:category-pick="form.categoryPick = $event"
                @update:amount-text="form.amountText = $event"
              />
              <MoneyBudgetModalFooter
                :budget-id="form.id"
                :submitting="submitting"
                @cancel="emit('close')"
                @delete="deleteConfirmOpen = true"
                @save="onSubmit"
              />
            </form>
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
