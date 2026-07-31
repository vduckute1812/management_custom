/**
 * Background chat inbox stream for signed-in users.
 *
 * Opens an SSE connection to `/api/chat/inbox/stream` so the nav badge stays
 * fresh outside `/chat`, and fires an in-app toast (+ optional desktop
 * notification) when new unread messages arrive. Auth uses the HttpOnly
 * access cookie (EventSource cannot set Authorization).
 *
 * Connection is deferred slightly after sign-in so Feed / other page APIs
 * win the first-paint race instead of competing with an unread COUNT query.
 */
export default defineNuxtPlugin(() => {
  if (!import.meta.client) return;

  const auth = useAuth();
  const route = useRoute();
  const router = useRouter();
  const { t } = useSafeI18n();
  const { pushToast } = useToasts();
  const chat = useChat();

  const STREAM_URL = "/api/chat/inbox/stream";
  const START_DELAY_MS = 400;
  const RECONNECT_MS = 5_000;

  let source: EventSource | null = null;
  let startTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let lastNotifiedKey: string | null = null;
  let primed = false;
  let intentionalClose = false;

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

  function clearTimers() {
    if (startTimer) {
      clearTimeout(startTimer);
      startTimer = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function stop() {
    intentionalClose = true;
    clearTimers();
    if (source) {
      source.close();
      source = null;
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

  function applyInbox(payload: UnreadPayload) {
    const prev = chat.unreadTotal.value;
    chat.unreadTotal.value = payload.unreadTotal;
    if (primed && payload.unreadTotal > prev) {
      notify(payload);
    }
    primed = true;
  }

  function scheduleReconnect() {
    if (!auth.isAuthenticated.value || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, RECONNECT_MS);
  }

  async function connect() {
    if (!auth.isAuthenticated.value) return;
    if (
      source &&
      (source.readyState === EventSource.OPEN ||
        source.readyState === EventSource.CONNECTING)
    ) {
      return;
    }

    intentionalClose = false;
    if (source) {
      source.close();
      source = null;
    }

    // Refresh access cookie before opening the stream — EventSource cannot
    // send Authorization and will 401 if mgmt_at is stale.
    try {
      if (auth.hasRefreshSession.value) {
        const expiresAt = auth.accessExpiresAt.value
          ? new Date(auth.accessExpiresAt.value).getTime()
          : 0;
        if (!expiresAt || expiresAt - Date.now() < 60_000) {
          await auth.refresh();
        }
      }
    } catch {
      // Connect anyway; cookie may still be valid.
    }

    const es = new EventSource(STREAM_URL);
    source = es;

    es.addEventListener("inbox", (ev) => {
      try {
        const payload = JSON.parse((ev as MessageEvent).data) as UnreadPayload;
        applyInbox(payload);
      } catch {
        // ignore malformed frames
      }
    });

    es.addEventListener("ping", () => {
      // heartbeat — no-op; keeps the connection marked active
    });

    es.onerror = () => {
      if (intentionalClose) return;
      es.close();
      if (source === es) source = null;
      scheduleReconnect();
    };
  }

  function start() {
    stop();
    intentionalClose = false;
    if (!auth.isAuthenticated.value) return;
    // Defer so Feed categories/posts (and other page APIs) go first.
    startTimer = setTimeout(() => {
      startTimer = null;
      void connect();
    }, START_DELAY_MS);
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
    if (document.visibilityState !== "visible") return;
    if (!auth.isAuthenticated.value) return;
    if (!source || source.readyState === EventSource.CLOSED) {
      void connect();
    }
  });
});
