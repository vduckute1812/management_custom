<script setup lang="ts">
defineProps<{
  panel: "emoji" | "sticker" | null;
  busy?: boolean;
  recording?: boolean;
  recordSupported?: boolean;
}>();

const emit = defineEmits<{
  togglePanel: [which: "emoji" | "sticker"];
  attachImage: [];
  startRecording: [];
  stopRecording: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="flex shrink-0 gap-0.5 sm:gap-1">
    <button
      type="button"
      class="flex h-10 w-9 items-center justify-center rounded-lg text-lg transition sm:w-10"
      :class="
        panel === 'emoji'
          ? 'bg-brand-50 text-brand-700'
          : 'text-slate-500 hover:bg-slate-100'
      "
      :aria-pressed="panel === 'emoji'"
      :aria-label="t('chat.emojiPanel')"
      :disabled="busy || recording"
      @click="emit('togglePanel', 'emoji')"
    >
      😊
    </button>
    <button
      type="button"
      class="flex h-10 w-9 items-center justify-center rounded-lg text-lg transition sm:w-10"
      :class="
        panel === 'sticker'
          ? 'bg-brand-50 text-brand-700'
          : 'text-slate-500 hover:bg-slate-100'
      "
      :aria-pressed="panel === 'sticker'"
      :aria-label="t('chat.stickerPanel')"
      :disabled="busy || recording"
      @click="emit('togglePanel', 'sticker')"
    >
      🎨
    </button>
    <button
      type="button"
      class="flex h-10 w-9 items-center justify-center rounded-lg text-base transition sm:w-10"
      :class="'text-slate-500 hover:bg-slate-100'"
      :aria-label="t('chat.attachImage')"
      :disabled="busy || recording"
      @click="emit('attachImage')"
    >
      📷
    </button>
    <button
      v-if="recordSupported"
      type="button"
      class="flex h-10 w-9 items-center justify-center rounded-lg text-base transition sm:w-10"
      :class="
        recording
          ? 'bg-rose-50 text-rose-700'
          : 'text-slate-500 hover:bg-slate-100'
      "
      :aria-label="t('chat.recordVoice')"
      :aria-pressed="recording"
      :disabled="busy && !recording"
      @click="recording ? emit('stopRecording') : emit('startRecording')"
    >
      🎤
    </button>
  </div>
</template>
