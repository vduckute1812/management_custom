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

const { paletteOpen, quickCaptureOpen, requestFocusTask } = useUiOverlays();
const { epics } = useEpics();
const { tasks } = useTasks();
const router = useRouter();

const query = ref("");
const cursor = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);

watch(paletteOpen, async (open) => {
  if (open) {
    query.value = "";
    cursor.value = 0;
    await nextTick();
    inputEl.value?.focus();
  }
});

const allItems = computed<PaletteItem[]>(() => {
  const items: PaletteItem[] = [
    {
      id: "view:dashboard",
      kind: "view",
      title: "Go to Dashboard",
      subtitle: "Calendar + Up next",
      icon: "calendar",
      shortcut: "g d",
      run: () => {
        router.push("/");
      },
    },
    {
      id: "view:epics",
      kind: "view",
      title: "Go to Epics",
      subtitle: "Project groupings",
      icon: "layers",
      shortcut: "g e",
      run: () => {
        router.push("/epics");
      },
    },
    {
      id: "view:analytics",
      kind: "view",
      title: "Go to Analytics",
      subtitle: "Velocity, completion, variance",
      icon: "chart",
      shortcut: "g a",
      run: () => {
        router.push("/analytics");
      },
    },
    {
      id: "action:quick-capture",
      kind: "action",
      title: "Quick capture task",
      subtitle: "Single-line input",
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
      (epic.tags ?? []).map((t) => `#${t}`).join(" "),
    ]
      .filter(Boolean)
      .join(" ");
    items.push({
      id: `epic:${epic.id}`,
      kind: "epic",
      title: epic.title,
      subtitle: `Epic · ${epic.taskCount ?? 0} tasks · ${epic.spentHours ?? 0}h / ${epic.estimatedHours ?? 0}h`,
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
      (task.tags ?? []).map((t) => `#${t}`).join(" "),
      parent?.title,
    ]
      .filter(Boolean)
      .join(" ");
    items.push({
      id: `task:${task.id}`,
      kind: "task",
      title: task.title,
      subtitle: `Task${parent ? ` · ${parent.title}` : ""}`,
      searchExtra: extras || undefined,
      accentClass: STATUS_DOTS[task.status],
      icon: "dot",
      run: async () => {
        paletteOpen.value = false;
        requestFocusTask(task.id);
        if (router.currentRoute.value.path !== "/") {
          await router.push("/");
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
        class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 backdrop-blur-sm pt-24 px-4"
        @mousedown="onBackdrop"
      >
        <div
          class="w-full max-w-xl bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden flex flex-col"
        >
          <div class="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
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
              placeholder="Jump to an epic, task, or view…"
              class="flex-1 text-sm outline-none bg-transparent"
              aria-label="Command palette search"
              @keydown="onKey"
            />
            <kbd class="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 font-mono">
              Esc
            </kbd>
          </div>

          <ul
            class="max-h-80 overflow-y-auto scrollbar-thin"
            role="listbox"
            aria-label="Command palette results"
          >
            <li
              v-if="filtered.length === 0"
              class="px-4 py-6 text-sm text-slate-400 italic text-center"
            >
              No matches.
            </li>
            <li
              v-for="(item, idx) in filtered"
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
                <polygon points="12 2 2 7 12 12 22 7 12 2" stroke-linejoin="round" />
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
                <path d="M7 14l4-4 4 4 5-7" stroke-linecap="round" stroke-linejoin="round" />
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
                <p v-if="item.subtitle" class="text-[11px] text-slate-500 truncate">
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

          <div class="px-3 py-2 border-t border-slate-100 flex items-center gap-3 text-[11px] text-slate-400">
            <span>
              <kbd class="px-1 bg-slate-100 rounded text-slate-600 font-mono">↑↓</kbd>
              navigate
            </span>
            <span>
              <kbd class="px-1 bg-slate-100 rounded text-slate-600 font-mono">↵</kbd>
              open
            </span>
            <span class="ml-auto">
              {{ filtered.length }} of {{ allItems.length }}
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
