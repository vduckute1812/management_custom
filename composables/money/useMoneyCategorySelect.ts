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

export interface MoneyCategoryOptionRow {
  key: string;
  pick: MoneyCategoryPick | null;
  label: string;
  emoji: string;
  color: string;
}

export function useMoneyCategorySelect(
  props: {
    modelValue: MoneyCategorySelectValue;
    mode: "all" | "expense" | "direction";
    direction: MoneyDirection | undefined;
    allowNull: boolean;
    nullLabel: string | undefined;
    size: "sm" | "md";
    disabled: boolean | undefined;
  },
  emit: (value: MoneyCategorySelectValue) => void,
  menuHooks?: {
    getMenuEl?: () => HTMLElement | null;
  },
) {
  const { t } = useI18n();
  const { categories: userCategories, fetchCategories } = useMoneyCategories();

  const open = ref(false);
  const creating = ref(false);
  const rootEl = ref<HTMLElement | null>(null);
  const triggerEl = ref<HTMLButtonElement | null>(null);
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

  const options = computed((): MoneyCategoryOptionRow[] => {
    const rows: MoneyCategoryOptionRow[] = [];
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
      menuHooks?.getMenuEl?.()?.focus();
    });
  }

  function closeMenu() {
    open.value = false;
    creating.value = false;
  }

  function selectRow(row: MoneyCategoryOptionRow) {
    emit(row.pick);
    closeMenu();
  }

  function onDocPointer(e: MouseEvent) {
    if (!open.value) return;
    const target = e.target as Node;
    const menu = menuHooks?.getMenuEl?.();
    if (rootEl.value?.contains(target) || menu?.contains(target)) return;
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
        emit(next);
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
    emit({
      kind: "custom",
      userCategoryId: saved.id,
    });
    closeMenu();
  }

  function ensureValue() {
    if (props.modelValue != null || props.allowNull) return;
    emit(
      defaultCategoryPickForDirection(props.direction ?? MoneyDirection.Out),
    );
  }

  onMounted(ensureValue);

  void parseMoneyCategoryKey;

  return {
    userCategories,
    open,
    creating,
    rootEl,
    triggerEl,
    menuStyle,
    activeIndex,
    createDirection,
    options,
    selectedRow,
    triggerClass,
    openMenu,
    closeMenu,
    selectRow,
    onKeydown,
    startCreate,
    cancelCreate,
    onCategoryCreated,
  };
}
