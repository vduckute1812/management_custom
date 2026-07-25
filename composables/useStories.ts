import type { StoriesTray, Story } from "~/types/story";

export const useStories = () => {
  const { apiFetch } = useApi();
  const { pushToast } = useToasts();

  const tray = useState<StoriesTray>("feed:storiesTray", () => ({
    groups: [],
  }));
  const loading = useState<boolean>("feed:storiesLoading", () => false);

  async function refresh() {
    loading.value = true;
    try {
      tray.value = await apiFetch<StoriesTray>("/api/stories");
    } finally {
      loading.value = false;
    }
  }

  async function createStory(args: {
    body?: string | null;
    uploadId?: string | null;
  }): Promise<Story> {
    const res = await apiFetch<{ story: Story }>("/api/stories", {
      method: "POST",
      body: args,
    });
    await refresh();
    pushToast("Story posted", { tone: "success", duration: 2500 });
    return res.story;
  }

  async function markViewed(id: string) {
    await apiFetch(`/api/stories/${id}/view`, { method: "POST" });
    // Optimistic local mark
    tray.value = {
      groups: tray.value.groups.map((g) => ({
        ...g,
        stories: g.stories.map((s) =>
          s.id === id ? { ...s, viewedByMe: true } : s
        ),
        hasUnseen: g.stories.some((s) => s.id !== id && !s.viewedByMe),
      })),
    };
  }

  async function removeStory(id: string) {
    await apiFetch(`/api/stories/${id}`, { method: "DELETE" });
    await refresh();
    pushToast("Story deleted", { tone: "info", duration: 2500 });
  }

  return {
    tray,
    loading,
    refresh,
    createStory,
    markViewed,
    removeStory,
  };
};
