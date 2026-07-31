import type { PostAuthor } from "~/types/post";

/**
 * Module-scoped generation so concurrent searches from any `useUserDirectory()`
 * caller cannot let a slower older response overwrite a newer one in the
 * shared `useState` results.
 */
let directorySearchGeneration = 0;

export const useUserDirectory = () => {
  const { apiFetch } = useApi();
  const results = useState<PostAuthor[]>("feed:userDirectory", () => []);
  const loading = useState<boolean>("feed:userDirectoryLoading", () => false);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  async function search(q: string) {
    const term = q.trim();
    const generation = ++directorySearchGeneration;
    if (term.length < 1) {
      if (generation === directorySearchGeneration) {
        results.value = [];
        loading.value = false;
      }
      return;
    }
    loading.value = true;
    try {
      const res = await apiFetch<{ users: PostAuthor[] }>(
        "/api/users/directory",
        { query: { q: term, limit: 20 } },
      );
      if (generation !== directorySearchGeneration) return;
      results.value = res.users;
    } finally {
      if (generation === directorySearchGeneration) {
        loading.value = false;
      }
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
