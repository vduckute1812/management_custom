<script setup lang="ts">
import {
  MONEY_USER_CATEGORY_COLORS,
  MONEY_USER_CATEGORY_EMOJI_SUGGESTIONS,
  type MoneyDirection,
  type MoneyUserCategory,
} from "~/types/money";

const props = defineProps<{
  open: boolean;
  direction: MoneyDirection;
  colorIndex: number;
}>();

const emit = defineEmits<{
  close: [];
  created: [category: MoneyUserCategory];
}>();

const { t } = useI18n();
const { saveCategory } = useMoneyCategories();

const createName = ref("");
const createEmoji = ref("📌");
const createColor = ref<string>(MONEY_USER_CATEGORY_COLORS[0]!);
const createBusy = ref(false);
const createError = ref<string | null>(null);
const createDialogEl = ref<HTMLElement | null>(null);
const createNameInput = ref<HTMLInputElement | null>(null);
const createFieldIds = {
  name: useId(),
  emoji: useId(),
  color: useId(),
};

const modalOpen = computed(() => props.open);

function resetForm() {
  createName.value = "";
  createEmoji.value = "📌";
  createColor.value =
    MONEY_USER_CATEGORY_COLORS[
      props.colorIndex % MONEY_USER_CATEGORY_COLORS.length
    ]!;
  createError.value = null;
}

function close() {
  emit("close");
}

useModal(modalOpen, {
  container: createDialogEl,
  onClose: close,
  initialFocus: createNameInput,
  // Parent money modals already lock scroll; nesting is fine.
});

watch(
  () => props.open,
  (open) => {
    if (open) resetForm();
  },
);

async function submitCreate() {
  const name = createName.value.trim();
  if (!name) {
    createError.value = t("money.categoriesAdd.nameRequired");
    return;
  }
  createBusy.value = true;
  createError.value = null;
  try {
    const saved = await saveCategory({
      name,
      emoji: createEmoji.value.trim() || "📌",
      color: createColor.value,
      direction: props.direction,
    });
    emit("created", saved);
  } catch (err: unknown) {
    createError.value =
      err instanceof Error ? err.message : t("money.categoriesAdd.failed");
  } finally {
    createBusy.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      @mousedown.self="close"
    >
      <form
        ref="createDialogEl"
        role="dialog"
        aria-modal="true"
        :aria-label="$t('money.categoriesAdd.title')"
        class="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-200"
        @submit.prevent="submitCreate"
      >
        <div class="flex items-start justify-between gap-3">
          <p class="text-sm font-semibold text-slate-900">
            {{ $t("money.categoriesAdd.title") }}
          </p>
          <button
            type="button"
            class="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
            @click="close"
          >
            {{ $t("money.modal.cancel") }}
          </button>
        </div>
        <div>
          <label
            class="mb-1 block text-xs font-medium text-slate-600"
            :for="createFieldIds.name"
          >
            {{ $t("money.categoriesAdd.name") }}
          </label>
          <input
            :id="createFieldIds.name"
            ref="createNameInput"
            v-model="createName"
            type="text"
            maxlength="120"
            :placeholder="$t('money.categoriesAdd.namePlaceholder')"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          />
        </div>
        <div>
          <p
            :id="createFieldIds.emoji"
            class="mb-1.5 text-[11px] font-medium text-slate-500"
          >
            {{ $t("money.categoriesAdd.emoji") }}
          </p>
          <div
            class="flex flex-wrap gap-1.5"
            role="group"
            :aria-labelledby="createFieldIds.emoji"
          >
            <button
              v-for="em in MONEY_USER_CATEGORY_EMOJI_SUGGESTIONS"
              :key="em"
              type="button"
              class="flex h-9 w-9 items-center justify-center rounded-lg text-base ring-1 transition"
              :class="
                createEmoji === em
                  ? 'bg-brand-50 ring-brand-400'
                  : 'bg-slate-50 ring-slate-200 hover:ring-slate-300'
              "
              :aria-pressed="createEmoji === em"
              :aria-label="em"
              @click="createEmoji = em"
            >
              {{ em }}
            </button>
          </div>
        </div>
        <div>
          <p
            :id="createFieldIds.color"
            class="mb-1.5 text-[11px] font-medium text-slate-500"
          >
            {{ $t("money.categoriesAdd.color") }}
          </p>
          <div
            class="flex flex-wrap gap-2"
            role="group"
            :aria-labelledby="createFieldIds.color"
          >
            <button
              v-for="c in MONEY_USER_CATEGORY_COLORS"
              :key="c"
              type="button"
              class="h-6 w-6 rounded-full ring-2 transition"
              :class="createColor === c ? 'ring-slate-900' : 'ring-transparent'"
              :style="{ backgroundColor: c }"
              :aria-pressed="createColor === c"
              :aria-label="c"
              @click="createColor = c"
            />
          </div>
        </div>
        <p v-if="createError" class="text-xs text-rose-600" role="alert">
          {{ createError }}
        </p>
        <div class="flex justify-end gap-2 pt-1">
          <button
            type="button"
            class="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            @click="close"
          >
            {{ $t("money.modal.cancel") }}
          </button>
          <button
            type="submit"
            class="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            :disabled="createBusy"
          >
            {{
              createBusy
                ? $t("money.categoriesAdd.saving")
                : $t("money.categoriesAdd.save")
            }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
