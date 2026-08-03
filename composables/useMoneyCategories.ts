import { MoneyDirection, type MoneyUserCategory } from "~/types/money";

interface ListResponse {
  categories: MoneyUserCategory[];
}

interface SaveResponse {
  category: MoneyUserCategory;
  created: boolean;
}

export const useMoneyCategories = () => {
  const categories = useState<MoneyUserCategory[]>(
    "money:userCategories",
    () => [],
  );
  const isLoading = useState<boolean>(
    "money:userCategories:loading",
    () => false,
  );
  const error = useState<string | null>(
    "money:userCategories:error",
    () => null,
  );
  const { apiFetch } = useApi();
  const { t } = useI18n();

  async function fetchCategories() {
    isLoading.value = true;
    error.value = null;
    try {
      const data = await apiFetch<ListResponse>("/api/money/categories");
      categories.value = data.categories ?? [];
    } catch (err: unknown) {
      error.value =
        err instanceof Error
          ? err.message
          : t("toasts.failedToLoadMoneyCategories");
    } finally {
      isLoading.value = false;
    }
  }

  async function saveCategory(payload: {
    id?: string;
    name: string;
    emoji: string;
    color: string;
    direction: MoneyDirection;
  }) {
    const data = await apiFetch<SaveResponse>("/api/money/categories", {
      method: "POST",
      body: payload,
    });
    await fetchCategories();
    return data.category;
  }

  async function archiveCategory(id: string) {
    await apiFetch(`/api/money/categories/${id}`, { method: "DELETE" });
    await fetchCategories();
  }

  function categoriesForDirection(direction: MoneyDirection) {
    return categories.value.filter((c) => c.direction === direction);
  }

  return {
    categories,
    isLoading,
    error,
    fetchCategories,
    saveCategory,
    archiveCategory,
    categoriesForDirection,
  };
};
