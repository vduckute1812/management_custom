import type { PostAuthor } from "~/types/post";

export const useUserDirectory = () => {
  const { apiFetch } = useApi();
  const results = useState<PostAuthor[]>("feed:userDirectory", () => []);
  const loading = useState<boolean>("feed:userDirectoryLoading", () => false);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  async function search(q: string) {
    const term = q.trim();
    if (term.length < 1) {
      results.value = [];
      return;
    }
    loading.value = true;
    try {
      const res = await apiFetch<{ users: PostAuthor[] }>(
        "/api/users/directory",
        { query: { q: term, limit: 20 } }
      );
      results.value = res.users;
    } finally {
      loading.value = false;
    }
  }

  function searchDebounced(q: string, ms = 250) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void search(q);
    }, ms);
  }

  onBeforeUnmount(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  return { results, loading, search, searchDebounced };
};
