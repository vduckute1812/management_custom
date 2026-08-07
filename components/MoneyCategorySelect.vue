<script setup lang="ts">
import {
  MONEY_CATEGORIES,
  MONEY_CATEGORY_COLORS,
  MONEY_CATEGORY_EMOJI,
  MONEY_CATEGORY_I18N_KEYS,
  MONEY_EXPENSE_CATEGORIES,
  MoneyCategory,
  MoneyDirection,
  coerceCategoryPickForDirection,
  defaultCategoryPickForDirection,
  moneyCategoryKey,
  parseMoneyCategoryKey,
  type MoneyCategoryPick,
  type MoneyUserCategory,
} from "~/types/money";

export type MoneyCategorySelectValue = MoneyCategoryPick | null;

const props = withDefaults(
  defineProps<{
    modelValue: MoneyCategorySelectValue;
    id?: string;
    disabled?: boolean;
    /**
     * `all` — every built-in.
     * `expense` — excludes Income.
     * `direction` — options for In/Out (needs `direction`).
     */
    mode?: "all" | "expense" | "direction";
    direction?: MoneyDirection;
    allowNull?: boolean;
    nullLabel?: string;
    size?: "sm" | "md";
    /** Show "Add category" footer (create flow). */
    allowCreate?: boolean;
  }>(),
  {
    id: undefined,
    mode: "all",
    direction: undefined,
    allowNull: false,
    nullLabel: undefined,
    size: "md",
    allowCreate: true,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: MoneyCategorySelectValue];
}>();

const { t } = useI18n();
const { categories: userCategories, fetchCategories } = useMoneyCategories();

const open = ref(false);
const creating = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const triggerEl = ref<HTMLButtonElement | null>(null);
const menuEl = ref<HTMLElement | null>(null);
const menuStyle = ref<Record<string, string>>({});
const activeIndex = ref(0);

onMounted(() => {
  void fetchCategories();
});

const createDirection = computed(() => {
  if (props.mode === "direction" && props.direction != null) {
    return props.direction;
  }
  if (props.mode === "expense") return MoneyDirection.Out;
  return props.direction ?? MoneyDirection.Out;
});

const builtinOptions = computed((): MoneyCategory[] => {
  if (props.mode === "expense") return [...MONEY_EXPENSE_CATEGORIES];
  if (props.mode === "direction") {
    if (props.direction === MoneyDirection.In) {
      return [
        MoneyCategory.Income,
        MoneyCategory.Transfer,
        MoneyCategory.Other,
      ];
    }
    return [...MONEY_EXPENSE_CATEGORIES];
  }
  return [...MONEY_CATEGORIES];
});

const customOptions = computed((): MoneyUserCategory[] => {
  const dir = createDirection.value;
  if (props.mode === "all") {
    return userCategories.value;
  }
  return userCategories.value.filter((c) => c.direction === dir);
});

interface OptionRow {
  key: string;
  pick: MoneyCategoryPick | null;
  label: string;
  emoji: string;
  color: string;
}

const options = computed((): OptionRow[] => {
  const rows: OptionRow[] = [];
  if (props.allowNull) {
    rows.push({
      key: "",
      pick: null,
      label: props.nullLabel || t("money.filterAllCategories"),
      emoji: "🏷️",
      color: "#94a3b8",
    });
  }
  for (const cat of builtinOptions.value) {
    const pick: MoneyCategoryPick = { kind: "builtin", category: cat };
    rows.push({
      key: moneyCategoryKey(pick),
      pick,
      label: t(MONEY_CATEGORY_I18N_KEYS[cat]),
      emoji: MONEY_CATEGORY_EMOJI[cat],
      color: MONEY_CATEGORY_COLORS[cat],
    });
  }
  for (const custom of customOptions.value) {
    const pick: MoneyCategoryPick = {
      kind: "custom",
      userCategoryId: custom.id,
    };
    rows.push({
      key: moneyCategoryKey(pick),
      pick,
      label: custom.name,
      emoji: custom.emoji,
      color: custom.color,
    });
  }
  return rows;
});

const selectedRow = computed(() => {
  if (props.modelValue == null) {
    return props.allowNull
      ? options.value.find((o) => o.pick == null)
      : undefined;
  }
  const key = moneyCategoryKey(props.modelValue);
  return options.value.find((o) => o.key === key);
});

const triggerClass = computed(() =>
  props.size === "sm"
    ? "min-h-9 px-2.5 py-1.5 text-xs"
    : "min-h-10 px-3 py-2 text-sm",
);

function positionMenu() {
  const el = triggerEl.value;
  if (!el || !import.meta.client) return;
  const rect = el.getBoundingClientRect();
  const width = Math.max(rect.width, 220);
  const left = Math.min(rect.left, window.innerWidth - width - 8);
  const estimatedHeight = 280;
  const spaceBelow = window.innerHeight - rect.bottom - 12;
  const openUp = spaceBelow < estimatedHeight && rect.top > spaceBelow;
  menuStyle.value = {
    position: "fixed",
    ...(openUp
      ? { bottom: `${window.innerHeight - rect.top + 6}px`, top: "auto" }
      : { top: `${rect.bottom + 6}px`, bottom: "auto" }),
    left: `${Math.max(8, left)}px`,
    width: `${width}px`,
    zIndex: "80",
    maxHeight: `${Math.min(320, openUp ? rect.top - 16 : spaceBelow)}px`,
  };
}

function openMenu() {
  if (props.disabled) return;
  creating.value = false;
  open.value = true;
  const idx = Math.max(
    0,
    options.value.findIndex((o) =>
      props.modelValue == null
        ? o.pick == null
        : o.key === moneyCategoryKey(props.modelValue!),
    ),
  );
  activeIndex.value = idx;
  nextTick(() => {
    positionMenu();
    menuEl.value?.focus();
  });
}

function closeMenu() {
  open.value = false;
  creating.value = false;
}

function selectRow(row: OptionRow) {
  emit("update:modelValue", row.pick);
  closeMenu();
}

function onDocPointer(e: MouseEvent) {
  if (!open.value) return;
  const target = e.target as Node;
  if (rootEl.value?.contains(target) || menuEl.value?.contains(target)) return;
  closeMenu();
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value) {
    if (
      (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") &&
      document.activeElement === triggerEl.value
    ) {
      e.preventDefault();
      openMenu();
    }
    return;
  }
  if (creating.value) {
    return;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    closeMenu();
    triggerEl.value?.focus();
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIndex.value = (activeIndex.value + 1) % options.value.length;
    return;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIndex.value =
      (activeIndex.value - 1 + options.value.length) % options.value.length;
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    const row = options.value[activeIndex.value];
    if (row) selectRow(row);
  }
}

function onWindowChange() {
  if (open.value) positionMenu();
}

onMounted(() => {
  document.addEventListener("mousedown", onDocPointer);
  window.addEventListener("resize", onWindowChange);
  window.addEventListener("scroll", onWindowChange, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDocPointer);
  window.removeEventListener("resize", onWindowChange);
  window.removeEventListener("scroll", onWindowChange, true);
});

watch(
  () => [props.direction, props.mode] as const,
  () => {
    if (!props.modelValue || props.modelValue.kind !== "builtin") return;
    const next = coerceCategoryPickForDirection(
      props.modelValue,
      props.direction ?? MoneyDirection.Out,
    );
    if (
      next.kind !== props.modelValue.kind ||
      (next.kind === "builtin" &&
        props.modelValue.kind === "builtin" &&
        next.category !== props.modelValue.category)
    ) {
      emit("update:modelValue", next);
    }
  },
);

function startCreate() {
  creating.value = true;
  open.value = false;
}

function cancelCreate() {
  creating.value = false;
}

function onCategoryCreated(saved: MoneyUserCategory) {
  emit("update:modelValue", {
    kind: "custom",
    userCategoryId: saved.id,
  });
  closeMenu();
}

function ensureValue() {
  if (props.modelValue != null || props.allowNull) return;
  emit(
    "update:modelValue",
    defaultCategoryPickForDirection(props.direction ?? MoneyDirection.Out),
  );
}

onMounted(ensureValue);

// keep parse helper referenced for consumers debugging keys
void parseMoneyCategoryKey;
</script>

<template>
  <div ref="rootEl" class="relative">
    <button
      :id="id"
      ref="triggerEl"
      type="button"
      class="flex w-full items-center gap-2 rounded-lg border border-slate-300 bg-white text-left font-medium text-slate-800 outline-none transition hover:border-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60"
      :class="triggerClass"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="open ? closeMenu() : openMenu()"
      @keydown="onKeydown"
    >
      <span class="text-base leading-none" aria-hidden="true">
        {{ selectedRow?.emoji || "🏷️" }}
      </span>
      <span
        class="h-2 w-2 shrink-0 rounded-full"
        :style="{ backgroundColor: selectedRow?.color || '#94a3b8' }"
        aria-hidden="true"
      />
      <span class="min-w-0 flex-1 truncate">
        {{ selectedRow?.label || t("money.modal.category") }}
      </span>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="h-4 w-4 shrink-0 text-slate-400 transition"
        :class="open ? 'rotate-180' : ''"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="menuEl"
        class="flex flex-col overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200"
        :style="menuStyle"
        role="listbox"
        tabindex="-1"
        :aria-activedescendant="
          options[activeIndex] ? `money-cat-opt-${activeIndex}` : undefined
        "
        @keydown="onKeydown"
      >
        <div class="min-h-0 flex-1 overflow-y-auto py-1 scrollbar-thin">
          <button
            v-for="(row, idx) in options"
            :id="`money-cat-opt-${idx}`"
            :key="row.key || 'null'"
            type="button"
            role="option"
            class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition"
            :class="
              idx === activeIndex
                ? 'bg-brand-50 text-slate-900'
                : 'text-slate-700 hover:bg-slate-50'
            "
            :aria-selected="
              modelValue == null
                ? row.pick == null
                : row.key === moneyCategoryKey(modelValue)
            "
            @mouseenter="activeIndex = idx"
            @click="selectRow(row)"
          >
            <span class="text-base leading-none" aria-hidden="true">{{
              row.emoji
            }}</span>
            <span
              class="h-2 w-2 shrink-0 rounded-full"
              :style="{ backgroundColor: row.color }"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1 truncate font-medium">{{
              row.label
            }}</span>
          </button>
        </div>

        <div
          v-if="allowCreate"
          class="shrink-0 border-t border-slate-100 bg-slate-50/80"
        >
          <div class="p-1.5">
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-brand-700 transition hover:bg-white"
              @click="startCreate"
            >
              <span aria-hidden="true">＋</span>
              {{ $t("money.categoriesAdd.action") }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <MoneyCategoryCreatorPanel
      :open="creating"
      :direction="createDirection"
      :color-index="userCategories.length"
      @close="cancelCreate"
      @created="onCategoryCreated"
    />
  </div>
</template>
