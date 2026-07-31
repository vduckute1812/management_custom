import type { Ref } from "vue";
import type { PostAuthor } from "~/types/post";
import { PostVisibility } from "~/types/post";

/**
 * Shared-visibility audience search/select for post composers.
 * Owns selected authors, the search query, and directory lookup when
 * visibility is Shared.
 */
export function useAudiencePicker(
  visibility: Ref<PostVisibility>,
  initial?: PostAuthor[],
) {
  const { results, loading: searching, searchDebounced } = useUserDirectory();

  const audience = ref<PostAuthor[]>([...(initial ?? [])]);
  const audienceQuery = ref("");

  watch(audienceQuery, (q) => {
    if (visibility.value === PostVisibility.Shared) searchDebounced(q);
  });

  function pickAudience(user: PostAuthor) {
    if (audience.value.some((u) => u.id === user.id)) return;
    audience.value = [...audience.value, user];
    audienceQuery.value = "";
  }

  function removeAudience(id: string) {
    audience.value = audience.value.filter((u) => u.id !== id);
  }

  function clearAudience() {
    audience.value = [];
    audienceQuery.value = "";
  }

  return {
    audience,
    audienceQuery,
    results,
    searching,
    pickAudience,
    removeAudience,
    clearAudience,
  };
}
