import type { PostCategory } from "~/types/post";

export const useCategories = () => {
  const { apiFetch } = useApi();

  const categories = useState<PostCategory[]>("feed:categories", () => []);
  const loading = useState<boolean>("feed:categoriesLoading", () => false);

  async function refresh() {
    loading.value = true;
    try {
      const res = await apiFetch<{ categories: PostCategory[] }>(
        "/api/categories"
      );
      categories.value = res.categories;
    } finally {
      loading.value = false;
    }
  }

  return { categories, loading, refresh };
};
