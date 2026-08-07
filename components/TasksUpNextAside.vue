<script setup lang="ts">
import dayjs from "dayjs";
import {
  PRIORITY_BADGE,
  PRIORITY_I18N_KEYS,
  TaskPriority,
  type Task,
} from "~/types/task";

defineProps<{
  upcoming: Task[];
  isLoading: boolean;
  nextCursor: string | null;
  isLoadingMore: boolean;
}>();

const emit = defineEmits<{
  select: [task: Task];
  "load-more": [];
  "drag-start": [event: DragEvent, task: Task];
}>();

const { findEpic, colorOfTask } = useEpics();
const { formatTime } = useSettings();
</script>

<template>
  <aside
    class="border-t lg:border-t-0 lg:border-l border-slate-200 bg-white overflow-y-auto scrollbar-thin max-h-[40vh] lg:max-h-none"
  >
    <div class="p-4 border-b border-slate-100">
      <h2 class="text-sm font-semibold text-slate-800">
        {{ $t("tasks.upNext") }}
      </h2>
      <p class="text-[11px] text-slate-500">
        <span class="lg:hidden">{{ $t("tasks.upNextHint") }}</span>
        <span class="hidden lg:inline">{{
          $t("tasks.upNextHintDesktop")
        }}</span>
      </p>
    </div>
    <SkeletonList v-if="isLoading" variant="row" :rows="3" />
    <ul v-else class="divide-y divide-slate-100">
      <li
        v-for="task in upcoming"
        :key="task.id"
        class="p-4 hover:bg-slate-50 cursor-grab active:cursor-grabbing"
        draggable="true"
        @dragstart="emit('drag-start', $event, task)"
        @click="emit('select', task)"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex items-center gap-2">
            <span
              class="w-2 h-2 rounded-full shrink-0"
              :class="colorOfTask(task).solid"
              :title="findEpic(task.epicId)?.title ?? $t('tasks.standalone')"
            />
            <p class="text-sm font-medium text-slate-900 truncate">
              {{ task.title }}
            </p>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <TaskTimerButton :task="task" />
            <StatusPill :task="task" />
          </div>
        </div>
        <p
          v-if="findEpic(task.epicId)"
          class="mt-0.5 text-[11px] text-slate-500 truncate ml-4"
        >
          {{ findEpic(task.epicId)?.title }}
        </p>
        <div
          class="mt-1 ml-4 flex items-center gap-2 text-[11px] text-slate-500 tabular-nums flex-wrap"
        >
          <span
            v-if="
              task.priority !== undefined &&
              task.priority !== TaskPriority.Normal
            "
            class="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide"
            :class="PRIORITY_BADGE[task.priority]"
          >
            {{ $t(PRIORITY_I18N_KEYS[task.priority]) }}
          </span>
          <span v-if="task.timeBlocks?.[0]">
            {{
              $t("tasks.nextBlock", {
                date: dayjs(task.timeBlocks[0].start).format("MMM D"),
                time: formatTime(dayjs(task.timeBlocks[0].start)),
              })
            }}
          </span>
          <span v-else-if="task.dueDate">
            {{ $t("tasks.due", { date: dayjs(task.dueDate).format("MMM D") }) }}
          </span>
          <span v-if="task.estimatedHours !== undefined">
            {{
              $t("tasks.hoursRatio", {
                spent: task.spentHours ?? 0,
                estimated: task.estimatedHours,
              })
            }}
          </span>
          <span
            v-if="task.checklist && task.checklist.length"
            class="inline-flex items-center gap-0.5"
            :title="
              $t('tasks.checklistTitle', {
                done: task.checklist.filter((c) => c.done).length,
                total: task.checklist.length,
              })
            "
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              class="w-3 h-3"
            >
              <polyline
                points="20 6 9 17 4 12"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            {{ task.checklist.filter((c) => c.done).length }}/{{
              task.checklist.length
            }}
          </span>
        </div>
        <div
          v-if="task.progress !== undefined"
          class="mt-2 ml-4 h-1 rounded-full bg-slate-100 overflow-hidden"
        >
          <div
            class="h-full"
            :class="colorOfTask(task).solid"
            :style="{ width: task.progress + '%' }"
          />
        </div>
      </li>
      <li
        v-if="upcoming.length === 0"
        class="p-6 text-center text-xs text-slate-400 italic"
      >
        {{ $t("tasks.allClear") }}
      </li>
    </ul>
    <div v-if="nextCursor" class="border-t border-slate-100 p-3">
      <button
        type="button"
        class="w-full rounded-lg px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
        :disabled="isLoadingMore"
        :aria-busy="isLoadingMore"
        @click="emit('load-more')"
      >
        {{ $t("common.loadMore") }}
      </button>
    </div>
  </aside>
</template>
