<script setup lang="ts">
import dayjs from "dayjs";
import type { TimeBlock } from "~/types/task";

const props = defineProps<{
  modelValue: TimeBlock[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: TimeBlock[]): void;
}>();

interface DraftBlock {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  spentHours: string;
}

function tempId() {
  return `block_${Math.random().toString(16).slice(2, 10)}`;
}

function blockToDraft(b: TimeBlock): DraftBlock {
  const start = dayjs(b.start);
  const end = dayjs(b.end);
  return {
    id: b.id,
    date: start.isValid() ? start.format("YYYY-MM-DD") : "",
    startTime: start.isValid() ? start.format("HH:mm") : "",
    endTime: end.isValid() ? end.format("HH:mm") : "",
    spentHours: typeof b.spentHours === "number" ? String(b.spentHours) : "",
  };
}

function draftToBlock(d: DraftBlock): TimeBlock | null {
  if (!d.date || !d.startTime || !d.endTime) return null;
  const start = dayjs(`${d.date}T${d.startTime}`);
  const end = dayjs(`${d.date}T${d.endTime}`);
  if (!start.isValid() || !end.isValid()) return null;
  const spent =
    d.spentHours !== "" && !Number.isNaN(Number(d.spentHours))
      ? Math.max(0, Number(d.spentHours))
      : undefined;
  return {
    id: d.id,
    start: start.toISOString(),
    end: end.toISOString(),
    spentHours: spent,
  };
}

const drafts = ref<DraftBlock[]>(props.modelValue.map(blockToDraft));

watch(
  () => props.modelValue,
  (next) => {
    // Avoid clobbering local edits the user hasn't synced yet. We compare
    // incoming IDs against the IDs of our *persistable* drafts only — any
    // locally-added row that still has an empty time field won't be in the
    // emitted model, but it must survive the watcher's echo of our own emit.
    const incomingIds = next.map((b) => b.id).join("|");
    const persistableIds = drafts.value
      .filter((d) => draftToBlock(d) !== null)
      .map((d) => d.id)
      .join("|");
    if (incomingIds !== persistableIds) {
      drafts.value = next.map(blockToDraft);
    }
  }
);

function pushUp() {
  const blocks = drafts.value
    .map(draftToBlock)
    .filter((b): b is TimeBlock => b !== null);
  emit("update:modelValue", blocks);
}

function addHour(time: string): string {
  // "HH:mm" → "HH:mm" + 1 hour (wraps at midnight back to 23:00 so the block
  // stays inside the same day, matching the day-bound editor UI).
  if (!/^\d{2}:\d{2}$/.test(time)) return "10:00";
  const [hh, mm] = time.split(":").map(Number);
  const next = (hh + 1) % 24;
  return `${String(next).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function addBlock() {
  const last = drafts.value[drafts.value.length - 1];
  const defaultDate = last?.date || dayjs().format("YYYY-MM-DD");
  const startTime = last?.endTime || "09:00";
  drafts.value.push({
    id: tempId(),
    date: defaultDate,
    startTime,
    // Seed a 1-hour block so the row is immediately persistable. Without an
    // end time `pushUp()` would filter the draft out, and the watcher's echo
    // would then wipe it from local state — making the click look like a no-op.
    endTime: addHour(startTime),
    spentHours: "",
  });
  pushUp();
}

function removeBlock(idx: number) {
  drafts.value.splice(idx, 1);
  pushUp();
}

function autoFillSpent(idx: number) {
  const d = drafts.value[idx];
  if (!d.date || !d.startTime || !d.endTime) return;
  const start = dayjs(`${d.date}T${d.startTime}`);
  const end = dayjs(`${d.date}T${d.endTime}`);
  if (!start.isValid() || !end.isValid() || end.isBefore(start)) return;
  const hours = end.diff(start, "minute") / 60;
  d.spentHours = String(Math.round(hours * 100) / 100);
  pushUp();
}

const totals = computed(() => {
  let scheduled = 0;
  let spent = 0;
  for (const d of drafts.value) {
    const b = draftToBlock(d);
    if (b) {
      const s = dayjs(b.start);
      const e = dayjs(b.end);
      if (s.isValid() && e.isValid() && e.isAfter(s)) {
        scheduled += e.diff(s, "minute") / 60;
      }
      if (typeof b.spentHours === "number") spent += b.spentHours;
    }
  }
  return {
    scheduled: Math.round(scheduled * 100) / 100,
    spent: Math.round(spent * 100) / 100,
  };
});
</script>

<template>
  <div class="space-y-2">
    <div
      v-if="drafts.length === 0"
      class="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center"
    >
      <p class="text-xs text-slate-500">
        No time blocks yet. Add one to schedule this task on the calendar.
      </p>
      <button
        type="button"
        class="mt-2 text-xs font-medium text-brand-700 hover:text-brand-800"
        @click="addBlock"
      >
        + Add first time block
      </button>
    </div>

    <ul v-else class="space-y-2">
      <li
        v-for="(d, idx) in drafts"
        :key="d.id"
        class="rounded-lg ring-1 ring-slate-200 bg-slate-50/60 p-3"
      >
        <div class="grid grid-cols-12 gap-2 items-end">
          <div class="col-span-4">
            <label class="block text-[10px] uppercase tracking-wide font-medium text-slate-500 mb-1">
              Date
            </label>
            <input
              v-model="d.date"
              type="date"
              class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
              @change="pushUp"
            />
          </div>
          <div class="col-span-2">
            <label class="block text-[10px] uppercase tracking-wide font-medium text-slate-500 mb-1">
              Start
            </label>
            <input
              v-model="d.startTime"
              type="time"
              class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs tabular-nums focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
              @change="pushUp"
            />
          </div>
          <div class="col-span-2">
            <label class="block text-[10px] uppercase tracking-wide font-medium text-slate-500 mb-1">
              End
            </label>
            <input
              v-model="d.endTime"
              type="time"
              class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs tabular-nums focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
              @change="pushUp"
            />
          </div>
          <div class="col-span-3">
            <label class="block text-[10px] uppercase tracking-wide font-medium text-slate-500 mb-1">
              Spent (h)
            </label>
            <div class="flex items-center gap-1">
              <input
                v-model="d.spentHours"
                type="number"
                min="0"
                step="0.25"
                placeholder="0.0"
                class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs tabular-nums focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
                @input="pushUp"
              />
              <button
                type="button"
                title="Set to block duration"
                class="text-[10px] text-brand-700 hover:text-brand-800 px-1"
                @click="autoFillSpent(idx)"
              >
                auto
              </button>
            </div>
          </div>
          <div class="col-span-1 flex justify-end">
            <button
              type="button"
              class="text-slate-400 hover:text-rose-600 p-1"
              aria-label="Remove time block"
              @click="removeBlock(idx)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="w-4 h-4"
              >
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </li>
    </ul>

    <div class="flex items-center justify-between pt-1">
      <button
        v-if="drafts.length > 0"
        type="button"
        class="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
        @click="addBlock"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          class="w-3.5 h-3.5"
        >
          <path d="M12 5v14M5 12h14" stroke-linecap="round" />
        </svg>
        Add another block
      </button>
      <p
        v-if="drafts.length > 0"
        class="text-[11px] text-slate-500 tabular-nums"
      >
        {{ totals.scheduled }}h scheduled · {{ totals.spent }}h logged
      </p>
    </div>
  </div>
</template>
