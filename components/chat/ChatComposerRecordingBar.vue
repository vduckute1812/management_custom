<script setup lang="ts">
defineProps<{
  timeLabel: string;
}>();

const emit = defineEmits<{
  cancel: [];
  send: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div
    class="flex items-center gap-3 border-b border-rose-100 bg-rose-50 px-3 py-2"
  >
    <span
      class="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-rose-600"
      aria-hidden="true"
    />
    <p class="flex-1 text-sm font-medium text-rose-700">
      {{ t("chat.recording", { time: timeLabel }) }}
    </p>
    <button
      type="button"
      class="rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-white"
      @click="emit('cancel')"
    >
      {{ t("chat.voiceCancel") }}
    </button>
    <button
      type="button"
      class="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700"
      @click="emit('send')"
    >
      {{ t("chat.voiceSend") }}
    </button>
  </div>
</template>
