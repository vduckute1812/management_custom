<script setup lang="ts">
import type { ChatSticker } from "~/types/chat";
import { CHAT_VOICE_MAX_MS } from "~/types/chat";

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
const composerInput = ref<{
  insertAtCursor: (char: string) => void;
  openImagePicker: () => void;
} | null>(null);
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
  composerInput.value?.insertAtCursor(char);
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

function openImagePicker() {
  composerInput.value?.openImagePicker();
}

async function onImageSelected(file: File) {
  if (busy.value) return;
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
    <ChatComposerPanel
      :panel="panel"
      :emoji="emoji"
      :stickers="stickers"
      :disabled="busy"
      @insert-emoji="insertEmoji"
      @send-sticker="onSendSticker"
    />

    <ChatComposerRecordingBar
      v-if="recording"
      :time-label="formatRecordClock(recordMs)"
      @cancel="cancelRecording"
      @send="stopRecording(true)"
    />

    <ChatComposerInput
      ref="composerInput"
      v-model="draft"
      :busy="busy"
      :recording="recording"
      :sending="sending"
      :uploading-media="uploadingMedia"
      @submit="submit"
      @image-selected="onImageSelected"
    >
      <template #toolbar>
        <ChatComposerToolbar
          :panel="panel"
          :busy="busy"
          :recording="recording"
          :record-supported="recordSupported"
          @toggle-panel="togglePanel"
          @attach-image="openImagePicker"
          @start-recording="startRecording"
          @stop-recording="stopRecording(true)"
        />
      </template>
    </ChatComposerInput>
  </div>
</template>
