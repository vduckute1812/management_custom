<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    busy?: boolean;
    destructive?: boolean;
  }>(),
  {
    description: "",
    confirmLabel: "",
    cancelLabel: "",
    busy: false,
    destructive: true,
  },
);

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "confirm"): void;
}>();

const { t } = useI18n();
const cancelBtn = ref<HTMLButtonElement | null>(null);
const titleId = useId();
const descId = useId();

const resolvedConfirm = computed(
  () => props.confirmLabel || t("common.delete"),
);
const resolvedCancel = computed(() => props.cancelLabel || t("common.cancel"));

watch(
  () => props.open,
  (open) => {
    if (open) {
      nextTick(() => cancelBtn.value?.focus());
    }
  },
);

function onKeydown(e: KeyboardEvent) {
  if (!props.open || props.busy) return;
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    emit("cancel");
  }
}

function onBackdrop(e: MouseEvent) {
  if (props.busy) return;
  if (e.target === e.currentTarget) emit("cancel");
}
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="description ? descId : undefined"
        @mousedown="onBackdrop"
        @keydown="onKeydown"
      >
        <div
          class="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl ring-1 ring-slate-200"
        >
          <h3 :id="titleId" class="text-sm font-semibold text-slate-900">
            {{ title }}
          </h3>
          <p
            v-if="description"
            :id="descId"
            class="mt-1 text-xs text-slate-500"
          >
            {{ description }}
          </p>
          <div class="mt-4 flex justify-end gap-2">
            <button
              ref="cancelBtn"
              type="button"
              class="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              :disabled="busy"
              @click="emit('cancel')"
            >
              {{ resolvedCancel }}
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              :class="
                destructive
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-brand-600 hover:bg-brand-700'
              "
              :disabled="busy"
              @click="emit('confirm')"
            >
              {{ busy ? $t("common.deleting") : resolvedConfirm }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.15s ease;
}
.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}
</style>
