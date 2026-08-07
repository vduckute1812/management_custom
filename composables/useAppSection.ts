import type { AppIconName } from "~/components/AppIcon.vue";

export type AppSection = "tasks" | "feed" | "money" | "other";

export interface ModuleNavItem {
  to: string;
  labelKey: string;
  icon: AppIconName;
}

/** Sticky across shared routes (Settings / Admin) so those don't bounce the tab. */
export function useAppSection() {
  const route = useRoute();
  const { t } = useI18n();
  const auth = useAuth();

  const activeSection = useState<AppSection>("app:section", () => "other");

  watch(
    () => route.path,
    (path) => {
      if (
        path === "/feed" ||
        path.startsWith("/feed/") ||
        path === "/friends" ||
        path.startsWith("/friends/") ||
        path === "/chat" ||
        path.startsWith("/chat/")
      ) {
        activeSection.value = "feed";
        return;
      }
      if (path === "/money" || path.startsWith("/money/")) {
        activeSection.value = "money";
        return;
      }
      if (
        path === "/tasks" ||
        path.startsWith("/tasks/") ||
        path.startsWith("/epics") ||
        path.startsWith("/analytics")
      ) {
        activeSection.value = "tasks";
        return;
      }
      // Home / profile / legal: leave modules; Settings / Admin keep last sticky
      // section.
      if (
        path === "/" ||
        path === "/profile" ||
        path.startsWith("/profile/") ||
        path.startsWith("/login") ||
        path.startsWith("/signup") ||
        path === "/privacy" ||
        path === "/terms"
      ) {
        activeSection.value = "other";
      }
    },
    { immediate: true },
  );

  const isFeedSection = computed(() => activeSection.value === "feed");
  const isTasksSection = computed(() => activeSection.value === "tasks");
  const isMoneySection = computed(() => activeSection.value === "money");

  const navItems = computed<ModuleNavItem[]>(() => {
    if (isFeedSection.value) {
      const feedNav: ModuleNavItem[] = [
        { to: "/feed", labelKey: "nav.feed", icon: "feed" },
        { to: "/chat", labelKey: "nav.chat", icon: "chat" },
        { to: "/friends", labelKey: "nav.friends", icon: "users" },
        { to: "/settings", labelKey: "nav.settings", icon: "cog" },
      ];
      if (auth.isAdminUi.value) {
        feedNav.splice(3, 0, {
          to: "/admin",
          labelKey: "nav.admin",
          icon: "shield",
        });
      }
      return feedNav;
    }

    if (isMoneySection.value) {
      const moneyNav: ModuleNavItem[] = [
        { to: "/money", labelKey: "nav.moneyLedger", icon: "wallet" },
        { to: "/money/savings", labelKey: "nav.moneySavings", icon: "goal" },
        { to: "/money/budgets", labelKey: "nav.moneyBudgets", icon: "chart" },
        { to: "/settings", labelKey: "nav.settings", icon: "cog" },
      ];
      if (auth.isAdminUi.value) {
        moneyNav.splice(3, 0, {
          to: "/admin",
          labelKey: "nav.admin",
          icon: "shield",
        });
      }
      return moneyNav;
    }

    if (isTasksSection.value) {
      const base: ModuleNavItem[] = [
        { to: "/tasks", labelKey: "nav.dashboard", icon: "calendar" },
        { to: "/epics", labelKey: "nav.epics", icon: "layers" },
        { to: "/analytics", labelKey: "nav.analytics", icon: "chart" },
        { to: "/settings", labelKey: "nav.settings", icon: "cog" },
      ];
      if (auth.isAdminUi.value) {
        base.splice(3, 0, {
          to: "/admin",
          labelKey: "nav.admin",
          icon: "shield",
        });
      }
      return base;
    }

    return [];
  });

  const sectionLabel = computed(() => {
    if (isFeedSection.value) return t("nav.sectionFeed");
    if (isMoneySection.value) return t("nav.sectionMoney");
    if (isTasksSection.value) return t("nav.sectionTime");
    return t("nav.sectionDefault");
  });

  function isModuleNavActive(to: string) {
    if (to === "/tasks") {
      return route.path === "/tasks" || route.path.startsWith("/tasks/");
    }
    // Ledger lives at /money; /money/savings is a sibling module page.
    if (to === "/money") {
      return route.path === "/money";
    }
    return route.path === to || route.path.startsWith(`${to}/`);
  }

  return {
    activeSection,
    isFeedSection,
    isTasksSection,
    isMoneySection,
    navItems,
    sectionLabel,
    isModuleNavActive,
  };
}
