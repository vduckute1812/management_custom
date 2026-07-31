<script setup lang="ts">
import { epicColorOf, STATUS_DOTS, type Epic, type Task } from "~/types/task";

interface PaletteItem {
  id: string;
  kind: "view" | "epic" | "task" | "action";
  title: string;
  subtitle?: string;
  /** Extra text included in fuzzy matching but not shown in the row. */
  searchExtra?: string;
  icon?: "calendar" | "layers" | "chart" | "dot" | "bolt";
  accentClass?: string;
  shortcut?: string;
  run: () => void | Promise<void>;
}

const { t } = useI18n();
const { paletteOpen, quickCaptureOpen, requestFocusTask } = useUiOverlays();
const { epics } = useEpics();
const { tasks } = useTasks();
const router = useRouter();

const query = ref("");
const cursor = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);
const rootEl = ref<HTMLElement | null>(null);
const listId = useId();

useModal(paletteOpen, {
  container: rootEl,
  initialFocus: inputEl,
  onClose: () => {
    paletteOpen.value = false;
  },
});

watch(paletteOpen, (open) => {
  if (open) {
    query.value = "";
    cursor.value = 0;
  }
});

const allItems = computed<PaletteItem[]>(() => {
  const items: PaletteItem[] = [
    {
      id: "view:home",
      kind: "view",
      title: t("commandPalette.goHome"),
      subtitle: t("commandPalette.goHomeSub"),
      icon: "bolt",
      shortcut: "g h",
      run: () => {
        router.push("/");
      },
    },
    {
      id: "view:dashboard",
      kind: "view",
      title: t("commandPalette.goTime"),
      subtitle: t("commandPalette.goTimeSub"),
      icon: "calendar",
      shortcut: "g d",
      run: () => {
        router.push("/tasks");
      },
    },
    {
      id: "view:epics",
      kind: "view",
      title: t("commandPalette.goEpics"),
      subtitle: t("commandPalette.goEpicsSub"),
      icon: "layers",
      shortcut: "g e",
      run: () => {
        router.push("/epics");
      },
    },
    {
      id: "view:analytics",
      kind: "view",
      title: t("commandPalette.goAnalytics"),
      subtitle: t("commandPalette.goAnalyticsSub"),
      icon: "chart",
      shortcut: "g a",
      run: () => {
        router.push("/analytics");
      },
    },
    {
      id: "view:feed",
      kind: "view",
      title: t("commandPalette.goFeed"),
      subtitle: t("commandPalette.goFeedSub"),
      icon: "bolt",
      shortcut: "g f",
      run: () => {
        router.push("/feed");
      },
    },
    {
      id: "view:chat",
      kind: "view",
      title: t("commandPalette.goChat"),
      subtitle: t("commandPalette.goChatSub"),
      icon: "bolt",
      shortcut: "g c",
      run: () => {
        router.push("/chat");
      },
    },
    {
      id: "view:profile",
      kind: "view",
      title: t("commandPalette.goProfile"),
      subtitle: t("commandPalette.goProfileSub"),
      icon: "bolt",
      run: () => {
        router.push("/profile");
      },
    },
    {
      id: "action:quick-capture",
      kind: "action",
      title: t("commandPalette.quickCapture"),
      subtitle: t("commandPalette.quickCaptureSub"),
      icon: "bolt",
      shortcut: "n",
      run: () => {
        paletteOpen.value = false;
        quickCaptureOpen.value = true;
      },
    },
  ];

  for (const epic of epics.value as Epic[]) {
    const extras = [
      epic.description,
      (epic.tags ?? []).map((tag) => `#${tag}`).join(" "),
    ]
      .filter(Boolean)
      .join(" ");
    items.push({
      id: `epic:${epic.id}`,
      kind: "epic",
      title: epic.title,
      subtitle: t("commandPalette.epicSubtitle", {
        taskCount: epic.taskCount ?? 0,
        spent: epic.spentHours ?? 0,
        estimated: epic.estimatedHours ?? 0,
      }),
      searchExtra: extras || undefined,
      icon: "dot",
      accentClass: epicColorOf(epic.color).solid,
      run: () => {
        router.push(`/epics/${epic.id}`);
      },
    });
  }

  for (const task of tasks.value as Task[]) {
    const parent = task.epicId
      ? (epics.value as Epic[]).find((e) => e.id === task.epicId)
      : undefined;
    const extras = [
      task.notes,
      (task.tags ?? []).map((tag) => `#${tag}`).join(" "),
      parent?.title,
    ]
      .filter(Boolean)
      .join(" ");
    items.push({
      id: `task:${task.id}`,
      kind: "task",
      title: task.title,
      subtitle: parent
        ? t("commandPalette.taskSubtitleWithEpic", { epic: parent.title })
        : t("commandPalette.taskSubtitle"),
      searchExtra: extras || undefined,
      accentClass: STATUS_DOTS[task.status],
      icon: "dot",
      run: async () => {
        paletteOpen.value = false;
        requestFocusTask(task.id);
        // Always land on the tasks dashboard so the focus watcher can open
        // the modal (home hub at `/` does not mount TaskModal).
        if (!router.currentRoute.value.path.startsWith("/tasks")) {
          await router.push("/tasks");
        }
      },
    });
  }

  return items;
});

function matches(item: PaletteItem, q: string): boolean {
  if (item.title.toLowerCase().includes(q)) return true;
  if (item.subtitle?.toLowerCase().includes(q)) return true;
  if (item.searchExtra?.toLowerCase().includes(q)) return true;
  return false;
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return allItems.value.slice(0, 30);
  return allItems.value.filter((it) => matches(it, q)).slice(0, 30);
});

const activeOptionId = computed(() => {
  const item = filtered.value[cursor.value];
  return item ? `${listId}-opt-${item.id}` : undefined;
});

watch(filtered, () => {
  cursor.value = 0;
});

function runActive() {
  const item = filtered.value[cursor.value];
  if (item) {
    paletteOpen.value = false;
    item.run();
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    cursor.value = Math.min(cursor.value + 1, filtered.value.length - 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    cursor.value = Math.max(cursor.value - 1, 0);
  } else if (e.key === "Enter") {
    e.preventDefault();
    runActive();
  }
}

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) paletteOpen.value = false;
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="paletteOpen"
        ref="rootEl"
        class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 backdrop-blur-sm pt-24 px-4"
        role="dialog"
        aria-modal="true"
        :aria-label="$t('commandPalette.aria')"
        @mousedown="onBackdrop"
      >
        <div
          class="w-full max-w-xl bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden flex flex-col"
          @mousedown.stop
        >
          <div
            class="px-4 py-3 border-b border-slate-200 flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="w-4 h-4 text-slate-400"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35" stroke-linecap="round" />
            </svg>
            <input
              ref="inputEl"
              v-model="query"
              type="text"
              :placeholder="$t('commandPalette.placeholder')"
              class="flex-1 text-sm outline-none bg-transparent"
              role="combobox"
              aria-autocomplete="list"
              :aria-controls="listId"
              :aria-expanded="true"
              :aria-activedescendant="activeOptionId"
              :aria-label="$t('commandPalette.searchAria')"
              @keydown="onKey"
            />
            <kbd
              class="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 font-mono"
            >
              Esc
            </kbd>
          </div>

          <ul
            :id="listId"
            class="max-h-80 overflow-y-auto scrollbar-thin"
            role="listbox"
            :aria-label="$t('commandPalette.resultsAria')"
          >
            <li
              v-if="filtered.length === 0"
              class="px-4 py-6 text-sm text-slate-400 italic text-center"
            >
              {{ $t("commandPalette.noMatches") }}
            </li>
            <li
              v-for="(item, idx) in filtered"
              :id="`${listId}-opt-${item.id}`"
              :key="item.id"
              :class="[
                'px-4 py-2 flex items-center gap-3 cursor-pointer',
                idx === cursor ? 'bg-brand-50' : 'hover:bg-slate-50',
              ]"
              role="option"
              :aria-selected="idx === cursor"
              @mouseenter="cursor = idx"
              @click="runActive"
            >
              <span
                v-if="item.icon === 'dot'"
                class="w-2 h-2 rounded-full shrink-0"
                :class="item.accentClass ?? 'bg-slate-400'"
              />
              <svg
                v-else-if="item.icon === 'calendar'"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="w-4 h-4 text-slate-500 shrink-0"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <svg
                v-else-if="item.icon === 'layers'"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="w-4 h-4 text-slate-500 shrink-0"
              >
                <polygon
                  points="12 2 2 7 12 12 22 7 12 2"
                  stroke-linejoin="round"
                />
                <polyline points="2 17 12 22 22 17" stroke-linejoin="round" />
                <polyline points="2 12 12 17 22 12" stroke-linejoin="round" />
              </svg>
              <svg
                v-else-if="item.icon === 'chart'"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="w-4 h-4 text-slate-500 shrink-0"
              >
                <path d="M3 3v18h18" stroke-linecap="round" />
                <path
                  d="M7 14l4-4 4 4 5-7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <svg
                v-else-if="item.icon === 'bolt'"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                class="w-4 h-4 text-amber-500 shrink-0"
              >
                <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
              </svg>

              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-slate-800 truncate">
                  {{ item.title }}
                </p>
                <p
                  v-if="item.subtitle"
                  class="text-[11px] text-slate-500 truncate"
                >
                  {{ item.subtitle }}
                </p>
              </div>
              <kbd
                v-if="item.shortcut"
                class="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 font-mono"
              >
                {{ item.shortcut }}
              </kbd>
            </li>
          </ul>

          <div
            class="px-3 py-2 border-t border-slate-100 flex items-center gap-3 text-[11px] text-slate-400"
          >
            <span>
              <kbd class="px-1 bg-slate-100 rounded text-slate-600 font-mono"
                >↑↓</kbd
              >
              {{ $t("commandPalette.navigate") }}
            </span>
            <span>
              <kbd class="px-1 bg-slate-100 rounded text-slate-600 font-mono"
                >↵</kbd
              >
              {{ $t("commandPalette.open") }}
            </span>
            <span class="ml-auto">
              {{
                $t("commandPalette.countOf", {
                  filtered: filtered.length,
                  total: allItems.length,
                })
              }}
            </span>
          </div>
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
