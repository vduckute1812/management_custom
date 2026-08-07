import type { FriendshipRow } from "~/types/friendship";

interface FriendshipOverviewResponse {
  friends: FriendshipRow[];
  incoming: FriendshipRow[];
  outgoing: FriendshipRow[];
  incomingTotal: number;
  nextCursors: {
    friends: string | null;
    incoming: string | null;
    outgoing: string | null;
  };
}

function appendUnique(
  current: FriendshipRow[],
  incoming: FriendshipRow[],
): FriendshipRow[] {
  const seen = new Set(current.map((row) => row.id));
  return [...current, ...incoming.filter((row) => !seen.has(row.id))];
}

export function useFriends() {
  const { apiFetch } = useApi();
  const friends = useState<FriendshipRow[]>("friends:list", () => []);
  const incoming = useState<FriendshipRow[]>("friends:incoming", () => []);
  const outgoing = useState<FriendshipRow[]>("friends:outgoing", () => []);
  const incomingCount = useState<number>("friends:incomingCount", () => 0);
  const loading = useState<boolean>("friends:loading", () => false);
  const friendsNextCursor = useState<string | null>(
    "friends:friendsNextCursor",
    () => null,
  );
  const incomingNextCursor = useState<string | null>(
    "friends:incomingNextCursor",
    () => null,
  );
  const outgoingNextCursor = useState<string | null>(
    "friends:outgoingNextCursor",
    () => null,
  );
  const loadingMoreFriends = useState<boolean>(
    "friends:loadingMoreFriends",
    () => false,
  );
  const loadingMoreIncoming = useState<boolean>(
    "friends:loadingMoreIncoming",
    () => false,
  );
  const loadingMoreOutgoing = useState<boolean>(
    "friends:loadingMoreOutgoing",
    () => false,
  );

  async function refreshBadge() {
    const res = await apiFetch<{ count: number }>(
      "/api/friends/incoming-count",
    );
    incomingCount.value = res.count;
  }

  async function refresh() {
    loading.value = true;
    try {
      const res = await apiFetch<FriendshipOverviewResponse>("/api/friends", {
        query: { limit: 50 },
      });
      friends.value = res.friends;
      incoming.value = res.incoming;
      outgoing.value = res.outgoing;
      incomingCount.value = res.incomingTotal;
      friendsNextCursor.value = res.nextCursors.friends;
      incomingNextCursor.value = res.nextCursors.incoming;
      outgoingNextCursor.value = res.nextCursors.outgoing;
    } finally {
      loading.value = false;
    }
  }

  async function loadMoreFriends() {
    if (!friendsNextCursor.value || loadingMoreFriends.value) return;
    loadingMoreFriends.value = true;
    try {
      const res = await apiFetch<FriendshipOverviewResponse>("/api/friends", {
        query: { limit: 50, friendsCursor: friendsNextCursor.value },
      });
      friends.value = appendUnique(friends.value, res.friends);
      friendsNextCursor.value = res.nextCursors.friends;
    } finally {
      loadingMoreFriends.value = false;
    }
  }

  async function loadMoreIncoming() {
    if (!incomingNextCursor.value || loadingMoreIncoming.value) return;
    loadingMoreIncoming.value = true;
    try {
      const res = await apiFetch<FriendshipOverviewResponse>("/api/friends", {
        query: { limit: 50, incomingCursor: incomingNextCursor.value },
      });
      incoming.value = appendUnique(incoming.value, res.incoming);
      incomingNextCursor.value = res.nextCursors.incoming;
    } finally {
      loadingMoreIncoming.value = false;
    }
  }

  async function loadMoreOutgoing() {
    if (!outgoingNextCursor.value || loadingMoreOutgoing.value) return;
    loadingMoreOutgoing.value = true;
    try {
      const res = await apiFetch<FriendshipOverviewResponse>("/api/friends", {
        query: { limit: 50, outgoingCursor: outgoingNextCursor.value },
      });
      outgoing.value = appendUnique(outgoing.value, res.outgoing);
      outgoingNextCursor.value = res.nextCursors.outgoing;
    } finally {
      loadingMoreOutgoing.value = false;
    }
  }

  async function request(userId: string) {
    const res = await apiFetch<{ friendship: FriendshipRow }>("/api/friends", {
      method: "POST",
      body: { userId },
    });
    await refresh();
    return res.friendship;
  }

  async function accept(id: string) {
    const res = await apiFetch<{ friendship: FriendshipRow }>(
      `/api/friends/${id}/accept`,
      { method: "POST" },
    );
    await refresh();
    return res.friendship;
  }

  async function remove(id: string) {
    await apiFetch<{ ok: boolean }>(`/api/friends/${id}`, {
      method: "DELETE",
    });
    await refresh();
  }

  return {
    friends,
    incoming,
    outgoing,
    incomingCount,
    loading,
    friendsNextCursor,
    incomingNextCursor,
    outgoingNextCursor,
    loadingMoreFriends,
    loadingMoreIncoming,
    loadingMoreOutgoing,
    refresh,
    refreshBadge,
    loadMoreFriends,
    loadMoreIncoming,
    loadMoreOutgoing,
    request,
    accept,
    remove,
  };
}
