<script setup lang="ts">
const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  keepEditing: [];
  discard: [];
}>();

const keepBtn = ref<HTMLButtonElement | null>(null);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) nextTick(() => keepBtn.value?.focus());
  },
);

defineExpose({
  getKeepBtnEl: () => keepBtn.value,
});
</script>

<template>
  <div
    v-if="open"
    class="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/40 rounded-2xl p-4"
    role="alertdialog"
    aria-labelledby="task-discard-title"
    aria-describedby="task-discard-desc"
  >
    <div
      class="bg-white rounded-xl shadow-xl ring-1 ring-slate-200 p-5 max-w-sm w-full"
    >
      <h3 id="task-discard-title" class="text-sm font-semibold text-slate-900">
        {{ $t("tasks.modal.discardTitle") }}
      </h3>
      <p id="task-discard-desc" class="mt-1 text-xs text-slate-500">
        {{ $t("tasks.modal.discardBody") }}
      </p>
      <div class="mt-4 flex justify-end gap-2">
        <button
          ref="keepBtn"
          type="button"
          class="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
          @click="emit('keepEditing')"
        >
          {{ $t("tasks.modal.keepEditing") }}
        </button>
        <button
          type="button"
          class="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg"
          @click="emit('discard')"
        >
          {{ $t("tasks.modal.discard") }}
        </button>
      </div>
    </div>
  </div>
</template>
