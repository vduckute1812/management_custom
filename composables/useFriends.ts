import type { FriendshipRow } from "~/types/friendship";

export function useFriends() {
  const { apiFetch } = useApi();
  const friends = useState<FriendshipRow[]>("friends:list", () => []);
  const incoming = useState<FriendshipRow[]>("friends:incoming", () => []);
  const outgoing = useState<FriendshipRow[]>("friends:outgoing", () => []);
  const loading = useState<boolean>("friends:loading", () => false);

  async function refresh() {
    loading.value = true;
    try {
      const res = await apiFetch<{
        friends: FriendshipRow[];
        incoming: FriendshipRow[];
        outgoing: FriendshipRow[];
      }>("/api/friends");
      friends.value = res.friends;
      incoming.value = res.incoming;
      outgoing.value = res.outgoing;
    } finally {
      loading.value = false;
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
    loading,
    refresh,
    request,
    accept,
    remove,
  };
}
