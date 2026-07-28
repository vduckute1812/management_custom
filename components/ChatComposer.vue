<script setup lang="ts">
import type { ChatSticker } from "~/types/chat";

const props = defineProps<{
  emoji: string[];
  stickers: ChatSticker[];
  disabled?: boolean;
  sending?: boolean;
}>();

const emit = defineEmits<{
  sendText: [text: string];
  sendEmoji: [emoji: string];
  sendSticker: [stickerId: string];
}>();

const { t } = useI18n();
const draft = ref("");
const panel = ref<"emoji" | "sticker" | null>(null);
const inputEl = ref<HTMLTextAreaElement | null>(null);

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

function togglePanel(which: "emoji" | "sticker") {
  panel.value = panel.value === which ? null : which;
}

function insertEmoji(char: string) {
  draft.value += char;
  panel.value = null;
  nextTick(() => inputEl.value?.focus());
}

function onSendEmojiDirect(char: string) {
  emit("sendEmoji", char);
  panel.value = null;
}

function onSendSticker(id: string) {
  emit("sendSticker", id);
  panel.value = null;
}

function submit() {
  const text = draft.value.trim();
  if (!text || props.disabled || props.sending) return;
  emit("sendText", text);
  draft.value = "";
  panel.value = null;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submit();
  }
}
</script>

<template>
  <div class="border-t border-slate-200 bg-white">
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
            :title="t('chat.sendEmoji')"
            :disabled="disabled || sending"
            @click="onSendEmojiDirect(char)"
            @contextmenu.prevent="insertEmoji(char)"
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
              :disabled="disabled || sending"
              @click="onSendSticker(s.id)"
            >
              {{ s.emoji }}
            </button>
          </div>
        </div>
      </template>
    </div>

    <form class="flex items-end gap-2 p-3" @submit.prevent="submit">
      <div class="flex shrink-0 gap-1">
        <button
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-lg text-lg transition"
          :class="
            panel === 'emoji'
              ? 'bg-brand-50 text-brand-700'
              : 'text-slate-500 hover:bg-slate-100'
          "
          :aria-pressed="panel === 'emoji'"
          :aria-label="t('chat.emojiPanel')"
          :disabled="disabled"
          @click="togglePanel('emoji')"
        >
          😊
        </button>
        <button
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-lg text-lg transition"
          :class="
            panel === 'sticker'
              ? 'bg-brand-50 text-brand-700'
              : 'text-slate-500 hover:bg-slate-100'
          "
          :aria-pressed="panel === 'sticker'"
          :aria-label="t('chat.stickerPanel')"
          :disabled="disabled"
          @click="togglePanel('sticker')"
        >
          🎨
        </button>
      </div>

      <label class="sr-only" for="chat-composer">{{
        t("chat.composeLabel")
      }}</label>
      <textarea
        id="chat-composer"
        ref="inputEl"
        v-model="draft"
        rows="1"
        maxlength="4000"
        class="max-h-28 min-h-[2.5rem] flex-1 resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
        :placeholder="t('chat.composePlaceholder')"
        :disabled="disabled || sending"
        @keydown="onKeydown"
      />

      <button
        type="submit"
        class="h-10 shrink-0 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
        :disabled="!draft.trim() || disabled || sending"
      >
        {{ sending ? t("chat.sending") : t("chat.send") }}
      </button>
    </form>
  </div>
</template>
