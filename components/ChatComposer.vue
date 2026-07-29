<script setup lang="ts">
import type { ChatSticker } from "~/types/chat";
import { CHAT_VOICE_MAX_MS } from "~/types/chat";
import { UPLOAD_ACCEPT_IMAGES_ATTR } from "~/utils/uploadPolicy";

const props = defineProps<{
  emoji: string[];
  stickers: ChatSticker[];
  disabled?: boolean;
  sending?: boolean;
}>();

const emit = defineEmits<{
  sendText: [text: string];
  sendSticker: [stickerId: string];
  sendImage: [uploadId: string];
  sendAudio: [uploadId: string, durationMs: number];
}>();

const { t } = useI18n();
const { uploadFile } = useUploads();
const { pushToast } = useToasts();

const draft = ref("");
const panel = ref<"emoji" | "sticker" | null>(null);
const inputEl = ref<HTMLTextAreaElement | null>(null);
const imageInput = ref<HTMLInputElement | null>(null);
const uploadingMedia = ref(false);

const recording = ref(false);
const recordMs = ref(0);
const recordSupported = ref(false);
let mediaRecorder: MediaRecorder | null = null;
let recordStream: MediaStream | null = null;
let recordChunks: BlobPart[] = [];
let recordTimer: ReturnType<typeof setInterval> | null = null;
let recordMime = "audio/webm";
let recordStartedAt = 0;

const busy = computed(() =>
  Boolean(props.disabled || props.sending || uploadingMedia.value),
);

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

function pickRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

function extForMime(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg")) return "mp3";
  return "webm";
}

onMounted(() => {
  recordSupported.value = Boolean(pickRecorderMime());
});

onBeforeUnmount(() => {
  void cancelRecording();
});

function togglePanel(which: "emoji" | "sticker") {
  panel.value = panel.value === which ? null : which;
}

function insertEmoji(char: string) {
  const el = inputEl.value;
  if (el && typeof el.selectionStart === "number") {
    const start = el.selectionStart;
    const end = el.selectionEnd ?? start;
    const before = draft.value.slice(0, start);
    const after = draft.value.slice(end);
    draft.value = `${before}${char}${after}`;
    nextTick(() => {
      el.focus();
      const pos = start + char.length;
      el.setSelectionRange(pos, pos);
    });
  } else {
    draft.value += char;
    nextTick(() => inputEl.value?.focus());
  }
}

function onSendSticker(id: string) {
  emit("sendSticker", id);
  panel.value = null;
}

function submit() {
  const text = draft.value.trim();
  if (!text || busy.value) return;
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

function openImagePicker() {
  if (busy.value || recording.value) return;
  imageInput.value?.click();
}

async function onImageSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || busy.value) return;
  uploadingMedia.value = true;
  try {
    const upload = await uploadFile(file);
    emit("sendImage", upload.id);
  } catch {
    // toast already shown by useUploads
  } finally {
    uploadingMedia.value = false;
  }
}

function formatRecordClock(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

async function startRecording() {
  if (busy.value || recording.value || !recordSupported.value) return;
  const mime = pickRecorderMime();
  if (!mime) {
    pushToast(t("chat.voiceUnsupported"), { tone: "danger" });
    return;
  }
  try {
    recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    pushToast(t("chat.voicePermissionDenied"), { tone: "danger" });
    return;
  }

  recordMime = mime.split(";")[0] || "audio/webm";
  recordChunks = [];
  try {
    mediaRecorder = new MediaRecorder(recordStream, { mimeType: mime });
  } catch {
    mediaRecorder = new MediaRecorder(recordStream);
  }

  mediaRecorder.ondataavailable = (ev) => {
    if (ev.data.size > 0) recordChunks.push(ev.data);
  };
  mediaRecorder.onstop = () => {
    // handled in stopRecording
  };

  recordStartedAt = Date.now();
  recordMs.value = 0;
  recording.value = true;
  panel.value = null;
  mediaRecorder.start(250);
  recordTimer = setInterval(() => {
    recordMs.value = Date.now() - recordStartedAt;
    if (recordMs.value >= CHAT_VOICE_MAX_MS) {
      void stopRecording(true);
    }
  }, 200);
}

function cleanupRecorder() {
  if (recordTimer) {
    clearInterval(recordTimer);
    recordTimer = null;
  }
  if (recordStream) {
    for (const track of recordStream.getTracks()) track.stop();
    recordStream = null;
  }
  mediaRecorder = null;
  recording.value = false;
  recordMs.value = 0;
}

async function cancelRecording() {
  if (!recording.value && !mediaRecorder) {
    cleanupRecorder();
    return;
  }
  const rec = mediaRecorder;
  cleanupRecorder();
  if (rec && rec.state !== "inactive") {
    try {
      rec.ondataavailable = null;
      rec.stop();
    } catch {
      // ignore
    }
  }
  recordChunks = [];
}

async function stopRecording(send: boolean) {
  if (!mediaRecorder || !recording.value) return;
  const rec = mediaRecorder;
  const elapsed = Math.max(200, Date.now() - recordStartedAt);
  const mime = recordMime;

  await new Promise<void>((resolve) => {
    rec.onstop = () => resolve();
    try {
      if (rec.state !== "inactive") rec.stop();
      else resolve();
    } catch {
      resolve();
    }
  });

  const chunks = [...recordChunks];
  cleanupRecorder();

  if (!send) {
    recordChunks = [];
    return;
  }
  if (!chunks.length || elapsed < 400) {
    pushToast(t("chat.voiceTooShort"), { tone: "danger" });
    return;
  }

  const blob = new Blob(chunks, { type: mime });
  const file = new File([blob], `voice.${extForMime(mime)}`, { type: mime });
  uploadingMedia.value = true;
  try {
    const upload = await uploadFile(file);
    emit("sendAudio", upload.id, Math.min(elapsed, CHAT_VOICE_MAX_MS));
  } catch {
    // toast already shown
  } finally {
    uploadingMedia.value = false;
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
            :title="t('chat.insertEmoji')"
            :disabled="busy"
            @click="insertEmoji(char)"
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
              :disabled="busy"
              @click="onSendSticker(s.id)"
            >
              {{ s.emoji }}
            </button>
          </div>
        </div>
      </template>
    </div>

    <div
      v-if="recording"
      class="flex items-center gap-3 border-b border-rose-100 bg-rose-50 px-3 py-2"
    >
      <span
        class="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-rose-600"
        aria-hidden="true"
      />
      <p class="flex-1 text-sm font-medium text-rose-700">
        {{ t("chat.recording", { time: formatRecordClock(recordMs) }) }}
      </p>
      <button
        type="button"
        class="rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-white"
        @click="cancelRecording"
      >
        {{ t("chat.voiceCancel") }}
      </button>
      <button
        type="button"
        class="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700"
        @click="stopRecording(true)"
      >
        {{ t("chat.voiceSend") }}
      </button>
    </div>

    <form class="flex items-end gap-1.5 p-3 sm:gap-2" @submit.prevent="submit">
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
          @click="togglePanel('emoji')"
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
          @click="togglePanel('sticker')"
        >
          🎨
        </button>
        <button
          type="button"
          class="flex h-10 w-9 items-center justify-center rounded-lg text-base transition sm:w-10"
          :class="'text-slate-500 hover:bg-slate-100'"
          :aria-label="t('chat.attachImage')"
          :disabled="busy || recording"
          @click="openImagePicker"
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
          @click="recording ? stopRecording(true) : startRecording()"
        >
          🎤
        </button>
      </div>

      <input
        ref="imageInput"
        type="file"
        class="hidden"
        :accept="UPLOAD_ACCEPT_IMAGES_ATTR"
        @change="onImageSelected"
      />

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
        :disabled="busy || recording"
        @keydown="onKeydown"
      />

      <button
        type="submit"
        class="h-10 shrink-0 rounded-xl bg-brand-600 px-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50 sm:px-4"
        :disabled="!draft.trim() || busy || recording"
      >
        {{
          uploadingMedia
            ? t("chat.uploading")
            : sending
              ? t("chat.sending")
              : t("chat.send")
        }}
      </button>
    </form>
  </div>
</template>
