<script setup lang="ts">
import { TaskPriority, TaskStatus, type Task } from "~/types/task";
import { parseQuickCapture } from "~/utils/parseQuickCapture";

const { t } = useI18n();
const { quickCaptureOpen } = useUiOverlays();
const { saveTask } = useTasks();
const { pushToast } = useToasts();

const title = ref("");
const submitting = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);
const rootEl = ref<HTMLElement | null>(null);

useModal(quickCaptureOpen, {
  container: rootEl,
  initialFocus: inputEl,
  onClose: () => {
    if (!submitting.value) quickCaptureOpen.value = false;
  },
});

watch(quickCaptureOpen, (open) => {
  if (open) title.value = "";
});

const preview = computed(() => {
  const text = title.value.trim();
  if (!text) return null;
  try {
    return parseQuickCapture(text);
  } catch {
    return null;
  }
});

async function onSubmit() {
  const text = title.value.trim();
  if (!text) return;
  submitting.value = true;
  try {
    const parsed = parseQuickCapture(text);
    const payload: Partial<Task> = {
      title: parsed.title,
      status: TaskStatus.Todo,
      priority: TaskPriority.Normal,
      dueDate: parsed.dueDate,
      tags: parsed.tags,
      timeBlocks: [parsed.block],
    };
    const saved = await saveTask(payload);
    const tagHint = parsed.tags.length ? ` · #${parsed.tags.join(" #")}` : "";
    pushToast(
      t("toasts.captured", {
        title: saved.title,
        schedule: parsed.scheduleLabel,
        tags: tagHint,
      }),
      {
        tone: "success",
        duration: 3500,
      },
    );
    quickCaptureOpen.value = false;
  } catch (err: unknown) {
    pushToast(
      err instanceof Error ? err.message : t("toasts.failedToCapture"),
      { tone: "danger" },
    );
  } finally {
    submitting.value = false;
  }
}

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) quickCaptureOpen.value = false;
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="quickCaptureOpen"
        ref="rootEl"
        class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 backdrop-blur-sm pt-32 px-4"
        role="dialog"
        aria-modal="true"
        :aria-label="$t('tasks.quickCapture.aria')"
        @mousedown="onBackdrop"
      >
        <div
          class="w-full max-w-xl bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden"
          @mousedown.stop
        >
          <form @submit.prevent="onSubmit" class="flex items-center">
            <span class="pl-4 text-slate-400" aria-hidden="true">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="w-5 h-5"
              >
                <path d="M12 5v14M5 12h14" stroke-linecap="round" />
              </svg>
            </span>
            <input
              ref="inputEl"
              v-model="title"
              type="text"
              :placeholder="$t('tasks.quickCapture.placeholder')"
              class="flex-1 px-3 py-4 text-base outline-none bg-transparent placeholder:text-slate-400"
              :aria-label="$t('tasks.quickCapture.titleAria')"
            />
            <button
              type="submit"
              :disabled="submitting || !title.trim()"
              class="m-2 px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-lg shadow-sm disabled:opacity-50"
            >
              {{
                submitting
                  ? $t("tasks.quickCapture.saving")
                  : $t("tasks.quickCapture.add")
              }}
            </button>
          </form>
          <p
            v-if="preview"
            class="px-4 pb-1 text-[11px] text-brand-700 tabular-nums"
          >
            → {{ preview.title }}
            <span v-if="preview.tags.length">
              · #{{ preview.tags.join(" #") }}
            </span>
            · {{ preview.scheduleLabel }}
          </p>
          <p
            class="px-4 pb-3 text-[11px] text-slate-500 flex items-center gap-3 flex-wrap"
          >
            <kbd
              class="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-mono"
              >Enter</kbd
            >
            {{ $t("tasks.quickCapture.enterToSave") }}
            <kbd
              class="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-mono"
              >Esc</kbd
            >
            {{ $t("tasks.quickCapture.escToCancel") }}
            <span class="ml-auto italic">
              {{ $t("tasks.quickCapture.hint") }}
            </span>
          </p>
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
