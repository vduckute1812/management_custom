<script setup lang="ts">
import type { ChatSticker } from "~/types/chat";

const props = defineProps<{
  panel: "emoji" | "sticker" | null;
  emoji: string[];
  stickers: ChatSticker[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  insertEmoji: [char: string];
  sendSticker: [stickerId: string];
}>();

const { t } = useI18n();

const stickerCategories = computed(() => {
  const cats: Array<{ id: ChatSticker["category"]; items: ChatSticker[] }> = [];
  const order: ChatSticker["category"][] = [
    "gestures",
    "mood",
    "celebration",
    "work",
  ];
  for (const id of order) {
    const items = props.stickers.filter((s) => s.category === id);
    if (items.length) cats.push({ id, items });
  }
  return cats;
});
</script>

<template>
  <div
    v-if="panel"
    class="max-h-52 overflow-y-auto border-b border-slate-100 p-3"
  >
    <template v-if="panel === 'emoji'">
      <p
        class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400"
      >
        {{ t("chat.emojiPanel") }}
      </p>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="char in emoji"
          :key="char"
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-lg text-xl transition hover:bg-slate-100"
          :title="t('chat.insertEmoji')"
          :disabled="disabled"
          @click="emit('insertEmoji', char)"
        >
          {{ char }}
        </button>
      </div>
      <p class="mt-2 text-[10px] text-slate-400">
        {{ t("chat.emojiHint") }}
      </p>
    </template>
    <template v-else>
      <div
        v-for="cat in stickerCategories"
        :key="cat.id"
        class="mb-3 last:mb-0"
      >
        <p
          class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"
        >
          {{ t(`chat.stickerCategories.${cat.id}`) }}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="s in cat.items"
            :key="s.id"
            type="button"
            class="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-50 text-3xl transition hover:bg-brand-50 hover:ring-2 hover:ring-brand-200"
            :title="t(s.labelKey)"
            :aria-label="t(s.labelKey)"
            :disabled="disabled"
            @click="emit('sendSticker', s.id)"
          >
            {{ s.emoji }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
