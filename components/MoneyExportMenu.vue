<script setup lang="ts">
const props = defineProps<{
  disabled?: boolean;
}>();

const emit = defineEmits<{
  csv: [];
  json: [];
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

function toggle() {
  if (props.disabled) return;
  open.value = !open.value;
}

function pick(kind: "csv" | "json") {
  open.value = false;
  if (kind === "csv") emit("csv");
  else emit("json");
}

function onDocClick(e: MouseEvent) {
  if (!open.value || !root.value) return;
  if (!root.value.contains(e.target as Node)) open.value = false;
}

function onDocKeydown(e: KeyboardEvent) {
  if (!open.value) return;
  if (e.key === "Escape") {
    e.preventDefault();
    open.value = false;
  }
}

onMounted(() => {
  document.addEventListener("click", onDocClick);
  document.addEventListener("keydown", onDocKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener("click", onDocClick);
  document.removeEventListener("keydown", onDocKeydown);
});
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="toggle"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="h-3.5 w-3.5"
      >
        <path
          d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      {{ $t("money.export.label") }}
    </button>
    <div
      v-if="open"
      role="menu"
      class="absolute right-0 z-20 mt-1 min-w-[9rem] overflow-hidden rounded-lg bg-white py-1 shadow-lg ring-1 ring-slate-200"
    >
      <button
        type="button"
        role="menuitem"
        class="block w-full px-3 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
        @click="pick('csv')"
      >
        {{ $t("money.export.csv") }}
      </button>
      <button
        type="button"
        role="menuitem"
        class="block w-full px-3 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
        @click="pick('json')"
      >
        {{ $t("money.export.json") }}
      </button>
    </div>
  </div>
</template>
