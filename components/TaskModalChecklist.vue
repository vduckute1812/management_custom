<script setup lang="ts">
import type { ChecklistItem } from "~/types/task";
import { newClientId } from "~/utils/clientId";

const props = defineProps<{
  modelValue: ChecklistItem[];
  addInputId: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: ChecklistItem[]): void;
}>();

const newChecklistItem = ref("");

const checklistSummary = computed(() => {
  const total = props.modelValue.length;
  if (total === 0) return null;
  const done = props.modelValue.filter((c) => c.done).length;
  return { done, total, percent: Math.round((done / total) * 100) };
});

function updateChecklist(items: ChecklistItem[]) {
  emit("update:modelValue", items);
}

function addChecklistItem() {
  const text = newChecklistItem.value.trim();
  if (!text) return;
  updateChecklist([
    ...props.modelValue,
    {
      id: newClientId("chk"),
      text,
      done: false,
    },
  ]);
  newChecklistItem.value = "";
}

function toggleChecklistItem(index: number) {
  updateChecklist(
    props.modelValue.map((item, idx) =>
      idx === index ? { ...item, done: !item.done } : item,
    ),
  );
}

function updateChecklistItemText(index: number, text: string) {
  updateChecklist(
    props.modelValue.map((item, idx) =>
      idx === index ? { ...item, text } : item,
    ),
  );
}

function removeChecklistItem(index: number) {
  updateChecklist(props.modelValue.filter((_, idx) => idx !== index));
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-2">
      <label class="text-xs font-medium text-slate-600" :for="addInputId">
        {{ $t("tasks.modal.checklist") }}
      </label>
      <p
        v-if="checklistSummary"
        class="text-[11px] text-slate-500 tabular-nums"
      >
        {{
          $t("tasks.modal.checklistSummary", {
            done: checklistSummary.done,
            total: checklistSummary.total,
            percent: checklistSummary.percent,
          })
        }}
      </p>
      <p v-else class="text-[11px] text-slate-500">
        {{ $t("tasks.modal.checklistHint") }}
      </p>
    </div>

    <ul
      v-if="modelValue.length"
      class="rounded-lg border border-slate-200 divide-y divide-slate-100 mb-2 overflow-hidden"
    >
      <li
        v-for="(item, idx) in modelValue"
        :key="item.id"
        class="flex items-center gap-2 px-3 py-1.5 group hover:bg-slate-50"
      >
        <input
          type="checkbox"
          :checked="item.done"
          class="accent-brand-600 w-4 h-4 shrink-0"
          :aria-label="$t('tasks.modal.toggleItem', { text: item.text })"
          @change="toggleChecklistItem(idx)"
        />
        <input
          :value="item.text"
          type="text"
          class="flex-1 bg-transparent text-sm outline-none border-none px-0 py-0"
          :class="item.done ? 'line-through text-slate-400' : 'text-slate-800'"
          @input="
            updateChecklistItemText(
              idx,
              ($event.target as HTMLInputElement).value,
            )
          "
        />
        <button
          type="button"
          class="text-slate-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity"
          :aria-label="$t('tasks.modal.removeItem', { text: item.text })"
          @click="removeChecklistItem(idx)"
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
      </li>
    </ul>

    <div class="flex items-center gap-2">
      <input
        :id="addInputId"
        v-model="newChecklistItem"
        type="text"
        :placeholder="$t('tasks.modal.addSubStep')"
        class="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
        @keydown.enter.prevent="addChecklistItem"
      />
      <button
        type="button"
        class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition disabled:opacity-50"
        :disabled="!newChecklistItem.trim()"
        @click="addChecklistItem"
      >
        {{ $t("tasks.modal.add") }}
      </button>
    </div>
  </div>
</template>
