<script setup lang="ts">
import type { ToastTone } from "~/composables/useToasts";

const { toasts, dismiss, triggerAction } = useToasts();

const TONE_CLASSES: Record<ToastTone, string> = {
  info: "bg-slate-900 text-white",
  success: "bg-emerald-700 text-white",
  danger: "bg-rose-700 text-white",
};
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast-in pointer-events-auto rounded-lg shadow-xl ring-1 ring-black/10 px-4 py-2.5 flex items-center gap-3 max-w-md"
        :class="TONE_CLASSES[toast.tone]"
      >
        <span class="text-sm font-medium">{{ toast.message }}</span>
        <button
          v-if="toast.actionLabel"
          type="button"
          class="text-xs font-semibold uppercase tracking-wide underline-offset-2 hover:underline"
          @click="triggerAction(toast)"
        >
          {{ toast.actionLabel }}
        </button>
        <button
          type="button"
          class="text-white/70 hover:text-white"
          aria-label="Dismiss"
          @click="dismiss(toast.id)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-3.5 h-3.5"
          >
            <path d="M6 6l12 12M6 18L18 6" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </div>
  </Teleport>
</template>
