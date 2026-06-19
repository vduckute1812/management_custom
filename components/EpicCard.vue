<script setup lang="ts">
import dayjs from "dayjs";
import {
  epicColorOf,
  STATUS_COLORS,
  STATUS_LABELS,
  TaskStatus,
  type Epic,
} from "~/types/task";

const props = defineProps<{
  epic: Epic;
  href?: string;
}>();

const emit = defineEmits<{
  (e: "edit", epic: Epic): void;
}>();

const accent = computed(() => epicColorOf(props.epic.color));

const variance = computed(() => {
  const est = props.epic.estimatedHours ?? 0;
  const spent = props.epic.spentHours ?? 0;
  return Math.round((spent - est) * 10) / 10;
});

const isOverdue = computed(() => {
  if (!props.epic.dueDate) return false;
  if (props.epic.status === TaskStatus.Done) return false;
  return dayjs(props.epic.dueDate).isBefore(dayjs(), "day");
});
</script>

<template>
  <div
    class="relative bg-white ring-1 ring-slate-200 rounded-xl shadow-sm hover:shadow-md transition flex flex-col gap-3 overflow-hidden"
  >
    <div
      class="absolute left-0 top-0 bottom-0 w-1"
      :class="accent.solid"
      aria-hidden="true"
    />
    <div class="p-4 pl-5 flex flex-col gap-3">
      <header class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <component
            :is="href ? 'NuxtLink' : 'h3'"
            :to="href"
            class="text-sm font-semibold text-slate-900 hover:text-brand-700 transition truncate block"
          >
            {{ epic.title }}
          </component>
          <p
            v-if="epic.description"
            class="text-xs text-slate-500 mt-1 line-clamp-2"
          >
            {{ epic.description }}
          </p>
        </div>
        <span
          class="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
          :class="STATUS_COLORS[epic.status]"
        >
          {{ STATUS_LABELS[epic.status] }}
        </span>
      </header>

      <div class="flex items-center gap-3 text-[11px] text-slate-500 tabular-nums">
        <span>
          <strong class="font-semibold text-slate-700">{{ epic.taskCount ?? 0 }}</strong>
          tasks
        </span>
        <span>
          {{ epic.spentHours ?? 0 }}h /
          <span class="text-slate-400">{{ epic.estimatedHours ?? 0 }}h</span>
        </span>
        <span
          v-if="(epic.estimatedHours ?? 0) > 0"
          :class="variance > 0 ? 'text-rose-600' : 'text-emerald-600'"
        >
          ({{ variance > 0 ? "+" : "" }}{{ variance }}h)
        </span>
      </div>

      <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          class="h-full"
          :class="accent.solid"
          :style="{ width: (epic.progress ?? 0) + '%' }"
        />
      </div>

      <footer class="flex items-center justify-between text-[11px]">
        <span
          v-if="epic.dueDate"
          :class="isOverdue ? 'text-rose-600 font-medium' : 'text-slate-500'"
        >
          Due {{ dayjs(epic.dueDate).format("MMM D, YYYY") }}
          <span v-if="isOverdue">· overdue</span>
        </span>
        <span v-else class="text-slate-400 italic">No deadline</span>

        <button
          type="button"
          class="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 bg-white hover:bg-slate-100 rounded-md ring-1 ring-slate-200 transition"
          @click="emit('edit', epic)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-3 h-3"
            aria-hidden="true"
          >
            <path d="M12 20h9" stroke-linecap="round" />
            <path
              d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          Edit
        </button>
      </footer>

      <div v-if="(epic.tags?.length ?? 0) > 0" class="flex flex-wrap gap-1">
        <span
          v-for="tag in epic.tags"
          :key="tag"
          class="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600"
        >
          {{ tag }}
        </span>
      </div>
    </div>
  </div>
</template>
