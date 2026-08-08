import { epicColorOf, STATUS_DOTS, type Epic, type Task } from "~/types/task";

export interface CommandPaletteItem {
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

export function matchesPaletteItem(
  item: CommandPaletteItem,
  q: string,
): boolean {
  if (item.title.toLowerCase().includes(q)) return true;
  if (item.subtitle?.toLowerCase().includes(q)) return true;
  if (item.searchExtra?.toLowerCase().includes(q)) return true;
  return false;
}

export function useCommandPaletteItems() {
  const { t } = useI18n();
  const { paletteOpen, quickCaptureOpen, requestFocusTask } = useUiOverlays();
  const { epics } = useEpics();
  const { tasks } = useTasks();
  const router = useRouter();

  const allItems = computed<CommandPaletteItem[]>(() => {
    const items: CommandPaletteItem[] = [
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
        id: "view:friends",
        kind: "view",
        title: t("commandPalette.goFriends"),
        subtitle: t("commandPalette.goFriendsSub"),
        icon: "bolt",
        shortcut: "g r",
        run: () => {
          router.push("/friends");
        },
      },
      {
        id: "view:money",
        kind: "view",
        title: t("commandPalette.goMoney"),
        subtitle: t("commandPalette.goMoneySub"),
        icon: "bolt",
        shortcut: "g m",
        run: () => {
          router.push("/money");
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
          if (!router.currentRoute.value.path.startsWith("/tasks")) {
            await router.push("/tasks");
          }
        },
      });
    }

    return items;
  });

  return { allItems };
}
