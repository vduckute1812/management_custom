<script setup lang="ts">
import type { MoneySavingsGoal } from "~/types/money";
import { formatMoneyMinorPlain, parseMoneyMinorInput } from "~/utils/money";

const props = defineProps<{
  open: boolean;
  goal: MoneySavingsGoal | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "saved"): void;
}>();

const { t } = useI18n();
const { addContribution } = useMoneySavings();

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const amountText = ref("");
const occurredOn = ref(todayIso());
const note = ref("");
const submitting = ref(false);
const errorMsg = ref<string | null>(null);
const rootEl = ref<HTMLElement | null>(null);
const amountInput = ref<HTMLInputElement | null>(null);
const fid = useId();

watch(
  () => props.open,
  (open) => {
    if (open) {
      amountText.value = "";
      occurredOn.value = todayIso();
      note.value = "";
      errorMsg.value = null;
    }
  },
);

const isOpen = computed(() => props.open);
useModal(isOpen, {
  container: rootEl,
  initialFocus: amountInput,
  onClose: () => emit("close"),
});

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) emit("close");
}

async function onSubmit() {
  if (!props.goal) return;
  const amountMinor = parseMoneyMinorInput(amountText.value);
  if (amountMinor == null || amountMinor < 1) {
    errorMsg.value = t("money.savings.contribute.amountRequired");
    return;
  }
  submitting.value = true;
  errorMsg.value = null;
  try {
    await addContribution(props.goal.id, {
      occurredOn: occurredOn.value,
      amountMinor,
      note: note.value.trim() || null,
    });
    emit("saved");
    emit("close");
  } catch (err: unknown) {
    errorMsg.value =
      err instanceof Error ? err.message : t("money.savings.contribute.failed");
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open && goal"
        ref="rootEl"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
        @mousedown="onBackdrop"
      >
        <div
          class="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="contribute-modal-title"
          @mousedown.stop
        >
          <header
            class="flex items-center justify-between border-b border-slate-200 px-5 py-4"
          >
            <div>
              <h2
                id="contribute-modal-title"
                class="text-lg font-semibold text-slate-900"
              >
                {{ $t("money.savings.contribute.title") }}
              </h2>
              <p class="mt-0.5 text-xs text-slate-500">
                {{ goal.title }}
              </p>
            </div>
            <button
              type="button"
              class="text-slate-400 hover:text-slate-700"
              :aria-label="$t('money.savings.modal.close')"
              @click="emit('close')"
            >
              ×
            </button>
          </header>

          <form class="space-y-4 px-5 py-4" @submit.prevent="onSubmit">
            <div>
              <label
                class="mb-1 block text-xs font-medium text-slate-600"
                :for="`${fid}-amt`"
              >
                {{ $t("money.savings.contribute.amount") }}
              </label>
              <input
                :id="`${fid}-amt`"
                ref="amountInput"
                v-model="amountText"
                type="text"
                inputmode="numeric"
                required
                :placeholder="formatMoneyMinorPlain(100000)"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </div>
            <div>
              <label
                class="mb-1 block text-xs font-medium text-slate-600"
                :for="`${fid}-date`"
              >
                {{ $t("money.savings.contribute.date") }}
              </label>
              <input
                :id="`${fid}-date`"
                v-model="occurredOn"
                type="date"
                required
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </div>
            <div>
              <label
                class="mb-1 block text-xs font-medium text-slate-600"
                :for="`${fid}-note`"
              >
                {{ $t("money.savings.contribute.note") }}
              </label>
              <input
                :id="`${fid}-note`"
                v-model="note"
                type="text"
                maxlength="500"
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
            <div class="flex justify-end gap-2 pt-1">
              <button
                type="button"
                class="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                @click="emit('close')"
              >
                {{ $t("money.savings.modal.cancel") }}
              </button>
              <button
                type="submit"
                class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                :disabled="submitting"
              >
                {{
                  submitting
                    ? $t("money.savings.modal.saving")
                    : $t("money.savings.contribute.save")
                }}
              </button>
            </div>
          </form>
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
