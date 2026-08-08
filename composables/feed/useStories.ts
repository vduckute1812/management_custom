import type { PostReactionType } from "~/types/post";
import type { StoriesTray, Story, StoryInsights } from "~/types/story";

function patchStoryInTray(
  tray: StoriesTray,
  id: string,
  next: Story,
): StoriesTray {
  return {
    groups: tray.groups.map((g) => ({
      ...g,
      stories: g.stories.map((s) => (s.id === id ? next : s)),
      hasUnseen: g.stories.some((s) =>
        s.id === id ? !next.viewedByMe : !s.viewedByMe,
      ),
    })),
  };
}

export const useStories = () => {
  const { t } = useI18n();
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
    pushToast(t("toasts.storyPosted"), { tone: "success", duration: 2500 });
    return res.story;
  }

  async function markViewed(id: string) {
    await apiFetch(`/api/stories/${id}/view`, { method: "POST" });
    tray.value = {
      groups: tray.value.groups.map((g) => ({
        ...g,
        stories: g.stories.map((s) =>
          s.id === id ? { ...s, viewedByMe: true } : s,
        ),
        hasUnseen: g.stories.some((s) => s.id !== id && !s.viewedByMe),
      })),
    };
  }

  async function removeStory(id: string) {
    await apiFetch(`/api/stories/${id}`, { method: "DELETE" });
    await refresh();
    pushToast(t("toasts.storyDeleted"), { tone: "info", duration: 2500 });
  }

  async function setReaction(
    id: string,
    reaction: PostReactionType,
  ): Promise<Story> {
    const res = await apiFetch<{ story: Story }>(
      `/api/stories/${id}/reactions`,
      { method: "POST", body: { reaction } },
    );
    tray.value = patchStoryInTray(tray.value, id, res.story);
    return res.story;
  }

  async function clearReaction(id: string): Promise<Story> {
    const res = await apiFetch<{ story: Story }>(
      `/api/stories/${id}/reactions`,
      { method: "DELETE" },
    );
    tray.value = patchStoryInTray(tray.value, id, res.story);
    return res.story;
  }

  async function fetchInsights(id: string): Promise<StoryInsights> {
    const res = await apiFetch<{ insights: StoryInsights }>(
      `/api/stories/${id}/insights`,
    );
    return res.insights;
  }

  return {
    tray,
    loading,
    refresh,
    createStory,
    markViewed,
    removeStory,
    setReaction,
    clearReaction,
    fetchInsights,
  };
};
