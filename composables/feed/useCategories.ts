import type { PostCategory } from "~/types/post";

export const useCategories = () => {
  const { apiFetch } = useApi();

  const categories = useState<PostCategory[]>("feed:categories", () => []);
  const loading = useState<boolean>("feed:categoriesLoading", () => false);

  async function refresh() {
    loading.value = true;
    try {
      const res = await apiFetch<{ categories: PostCategory[] }>(
        "/api/categories",
      );
      categories.value = res.categories;
    } finally {
      loading.value = false;
    }
  }

  // ---- Admin-only directory management (server enforces the role) ----

  async function createCategory(args: {
    name: string;
    slug?: string;
    sortOrder?: number;
  }): Promise<PostCategory> {
    const res = await apiFetch<{ category: PostCategory }>("/api/categories", {
      method: "POST",
      body: args,
    });
    await refresh();
    return res.category;
  }

  async function updateCategory(
    id: string,
    args: { name?: string; sortOrder?: number },
  ): Promise<PostCategory> {
    const res = await apiFetch<{ category: PostCategory }>(
      `/api/categories/${id}`,
      { method: "PATCH", body: args },
    );
    await refresh();
    return res.category;
  }

  async function removeCategory(id: string): Promise<void> {
    await apiFetch(`/api/categories/${id}`, { method: "DELETE" });
    categories.value = categories.value.filter((c) => c.id !== id);
  }

  return {
    categories,
    loading,
    refresh,
    createCategory,
    updateCategory,
    removeCategory,
  };
};
