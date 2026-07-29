/**
 * Background chat inbox pulse for signed-in users.
 *
 * Polls `/api/chat/unread` so the nav badge stays fresh outside `/chat`,
 * and fires an in-app toast (+ optional desktop notification) when new
 * unread messages arrive while the user is not already looking at that thread.
 */
export default defineNuxtPlugin(() => {
  if (!import.meta.client) return;

  const auth = useAuth();
  const route = useRoute();
  const router = useRouter();
  const { t } = useSafeI18n();
  const { pushToast } = useToasts();
  const chat = useChat();
  const { apiFetch } = useApi();

  const POLL_MS = 10_000;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastNotifiedKey: string | null = null;
  let primed = false;

  type UnreadPayload = {
    unreadTotal: number;
    latest: {
      conversationId: string;
      peerName: string | null;
      peerEmail: string;
      preview: string;
      createdAt: string;
    } | null;
  };

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function peerLabel(latest: NonNullable<UnreadPayload["latest"]>) {
    return latest.peerName?.trim() || latest.peerEmail;
  }

  function fireDesktop(title: string, body: string, tag: string) {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (window.Notification.permission !== "granted") return;
    try {
      const n = new window.Notification(title, {
        body,
        tag,
        silent: false,
        icon: "/favicon.png",
      });
      n.onclick = () => {
        window.focus();
        void openThread(tag.replace(/^chat:/, ""));
        n.close();
      };
    } catch {
      // ignore non-secure / blocked contexts
    }
  }

  async function openThread(conversationId: string) {
    if (route.path !== "/chat") {
      await router.push("/chat");
    }
    await chat.refreshConversations();
    await chat.openConversation(conversationId);
  }

  function notify(payload: UnreadPayload) {
    const latest = payload.latest;
    if (!latest || payload.unreadTotal <= 0) return;

    const onChat = route.path === "/chat" || route.path.startsWith("/chat/");
    if (onChat && chat.activeId.value === latest.conversationId) return;

    const key = `${latest.conversationId}:${latest.createdAt}`;
    if (key === lastNotifiedKey) return;
    lastNotifiedKey = key;

    const from = peerLabel(latest);
    const title = t("chat.newMessageTitle", { name: from });
    const body =
      latest.preview ||
      t("chat.newMessageBodyFallback", { count: payload.unreadTotal });

    pushToast(`${title}: ${body}`, {
      tone: "info",
      duration: 6500,
      actionLabel: t("chat.openChat"),
      onAction: () => openThread(latest.conversationId),
    });

    fireDesktop(title, body, `chat:${latest.conversationId}`);
  }

  async function tick() {
    if (!auth.isAuthenticated.value) return;
    try {
      const res = await apiFetch<UnreadPayload>("/api/chat/unread");
      const prev = chat.unreadTotal.value;
      chat.unreadTotal.value = res.unreadTotal;
      if (primed && res.unreadTotal > prev) {
        notify(res);
      }
      primed = true;
    } catch {
      // Session may be mid-refresh; ignore.
    }
  }

  function start() {
    stop();
    if (!auth.isAuthenticated.value) return;
    void tick();
    timer = setInterval(() => {
      void tick();
    }, POLL_MS);
  }

  watch(
    () => auth.isAuthenticated.value,
    (ok) => {
      if (ok) {
        primed = false;
        lastNotifiedKey = null;
        start();
      } else {
        stop();
        chat.unreadTotal.value = 0;
        primed = false;
        lastNotifiedKey = null;
      }
    },
    { immediate: true },
  );

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && auth.isAuthenticated.value) {
      void tick();
    }
  });
});
