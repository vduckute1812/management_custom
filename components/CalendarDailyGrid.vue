<script setup lang="ts">
import dayjs from "dayjs";
import {
  STATUS_BORDER,
  STATUS_DOTS,
  STATUS_I18N_KEYS,
  type Task,
  type TimeBlock,
} from "~/types/task";

interface PositionedBlock {
  task: Task;
  block: TimeBlock;
  top: number;
  height: number;
  column: number;
  columnCount: number;
}

type DragMode = "move" | "resize-top" | "resize-bottom";

interface DragSession {
  entry: PositionedBlock;
  mode: DragMode;
  startPointerY: number;
  startTop: number;
  startHeight: number;
  currentTop: number;
  currentHeight: number;
  moved: boolean;
  saving: boolean;
}

const props = defineProps<{
  hours: number[];
  hourHeight: number;
  dropHour: number | null;
  dayBlocks: PositionedBlock[];
  drag: DragSession | null;
  showNowLine: boolean;
  nowTopPx: number;
  nowLabel: string;
  dragLabel: string | null;
}>();

const emit = defineEmits<{
  (e: "slot-click", hour: number): void;
  (e: "slot-keydown", event: KeyboardEvent, hour: number): void;
  (e: "slot-dragover", event: DragEvent, hour: number): void;
  (e: "slot-dragleave", hour: number): void;
  (e: "slot-drop", event: DragEvent, hour: number): void;
  (
    e: "block-pointerdown",
    event: PointerEvent,
    entry: PositionedBlock,
    mode: DragMode,
  ): void;
  (e: "block-click", event: MouseEvent, entry: PositionedBlock): void;
  (e: "block-dblclick", event: MouseEvent, entry: PositionedBlock): void;
}>();

const { colorOfTask } = useEpics();
const { formatTime, formatHourLabel } = useSettings();

function blockStyle(entry: PositionedBlock) {
  const active = props.drag && props.drag.entry.block.id === entry.block.id;
  const top = active ? props.drag!.currentTop : entry.top;
  const height = active ? props.drag!.currentHeight : entry.height;
  return {
    top: `${top}px`,
    height: `${height}px`,
    left: `calc(${(entry.column / entry.columnCount) * 100}% + 4px)`,
    width: `calc(${100 / entry.columnCount}% - 8px)`,
    zIndex: active ? 20 : "auto",
  };
}
</script>

<template>
  <div class="flex-1 overflow-y-auto scrollbar-thin">
    <div class="relative grid" style="grid-template-columns: 64px 1fr">
      <div class="border-r border-slate-200 bg-slate-50">
        <div
          v-for="h in hours"
          :key="h"
          class="text-[10px] font-medium text-slate-500 px-2 pt-1 tabular-nums"
          :style="{ height: hourHeight + 'px' }"
        >
          {{ formatHourLabel(h) }}
        </div>
      </div>

      <div class="relative">
        <div
          v-for="h in hours"
          :key="`slot-${h}`"
          role="button"
          tabindex="0"
          :aria-label="
            $t('calendar.createOrDropAt', { hour: formatHourLabel(h) })
          "
          class="border-b border-slate-100 hover:bg-brand-50/30 cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300"
          :class="
            dropHour === h
              ? 'bg-brand-50/60 ring-1 ring-inset ring-brand-300'
              : ''
          "
          :style="{ height: hourHeight + 'px' }"
          @click="emit('slot-click', h)"
          @keydown="emit('slot-keydown', $event, h)"
          @dragover="emit('slot-dragover', $event, h)"
          @dragleave="emit('slot-dragleave', h)"
          @drop="emit('slot-drop', $event, h)"
        />

        <!-- Live "now" line. The badge spills into the gutter via the negative
             left offset so it's legible even when an event is rendered nearby. -->
        <div
          v-if="showNowLine"
          class="pointer-events-none absolute left-0 right-0 z-30"
          :style="{ top: nowTopPx + 'px' }"
          aria-hidden="true"
        >
          <div class="relative">
            <span
              class="absolute -left-[60px] -top-[9px] inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums bg-rose-600 text-white shadow-sm ring-1 ring-rose-700"
            >
              {{ nowLabel }}
            </span>
            <span
              class="absolute -left-1 -top-[5px] w-2.5 h-2.5 rounded-full bg-rose-600 ring-2 ring-white"
            />
            <span
              class="block h-px bg-rose-500 shadow-[0_0_0_1px_rgba(244,63,94,0.25)]"
            />
          </div>
        </div>

        <button
          v-for="entry in dayBlocks"
          :key="entry.block.id"
          type="button"
          :class="[
            'absolute rounded-lg px-2 py-1 text-left text-xs font-medium ring-1 shadow-sm hover:shadow-md transition-shadow overflow-hidden border-l-4 select-none group',
            colorOfTask(entry.task).bg,
            colorOfTask(entry.task).text,
            colorOfTask(entry.task).ring,
            STATUS_BORDER[entry.task.status],
            entry.block.projected
              ? 'opacity-60 border-dashed cursor-pointer'
              : drag && drag.entry.block.id === entry.block.id
                ? 'cursor-grabbing shadow-lg'
                : 'cursor-grab',
          ]"
          :style="blockStyle(entry)"
          :title="
            entry.block.projected
              ? entry.task.title
              : `${entry.task.title} · ${$t(STATUS_I18N_KEYS[entry.task.status])}`
          "
          @pointerdown="emit('block-pointerdown', $event, entry, 'move')"
          @click="emit('block-click', $event, entry)"
          @dblclick="emit('block-dblclick', $event, entry)"
        >
          <!-- Resize handle (top) -- hidden for projections. -->
          <span
            v-if="!entry.block.projected"
            class="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity"
            aria-hidden="true"
            @pointerdown="
              emit('block-pointerdown', $event, entry, 'resize-top')
            "
            @click.stop
          />

          <div class="flex items-center gap-1">
            <span
              class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
              :class="STATUS_DOTS[entry.task.status]"
            />
            <div class="truncate font-semibold">
              {{ entry.task.title }}
            </div>
            <svg
              v-if="entry.block.projected"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="w-3 h-3 shrink-0 opacity-70"
              aria-hidden="true"
            >
              <path
                d="M3 12a9 9 0 1 0 3-6.7L3 8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M3 3v5h5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>
          <div class="text-[10px] opacity-80 tabular-nums">
            <template v-if="drag && drag.entry.block.id === entry.block.id">
              {{ dragLabel }}
            </template>
            <template v-else>
              {{ formatTime(dayjs(entry.block.start)) }} -
              {{ formatTime(dayjs(entry.block.end)) }}
              <span v-if="entry.block.projected" class="ml-1 italic opacity-80">
                · {{ $t("calendar.recurring") }}
              </span>
              <span
                v-else-if="typeof entry.block.spentHours === 'number'"
                class="ml-1"
              >
                · {{ entry.block.spentHours }}h
              </span>
            </template>
          </div>

          <!-- Resize handle (bottom) -- hidden for projections. -->
          <span
            v-if="!entry.block.projected"
            class="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity"
            aria-hidden="true"
            @pointerdown="
              emit('block-pointerdown', $event, entry, 'resize-bottom')
            "
            @click.stop
          />
        </button>
      </div>
    </div>
  </div>
</template>
