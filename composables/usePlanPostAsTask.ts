/**
 * Feed → Time Management seam.
 *
 * Keep PostCard free of task persistence details: this composable owns
 * creating a research task from a post and the success/failure toasts.
 */
import type { Post } from "~/types/post";
import { TaskStatus } from "~/types/task";

function authorLabel(name: string | null | undefined, email: string): string {
  const n = name?.trim();
  return n || email;
}

export function usePlanPostAsTask() {
  const { t } = useI18n();
  const auth = useAuth();
  const { saveTask } = useTasks();
  const { pushToast } = useToasts();
  const planBusy = ref(false);

  async function planPostAsTask(post: Post): Promise<boolean> {
    if (!auth.isAuthenticated.value) {
      await navigateTo({ path: "/login", query: { redirect: "/feed" } });
      return false;
    }
    if (planBusy.value) return false;
    planBusy.value = true;
    try {
      const excerpt =
        post.title?.trim() ||
        (post.body || "").replace(/\s+/g, " ").trim().slice(0, 80) ||
        t("feed.post.planUntitled");
      const tags = [post.format === "manuscript" ? "manuscript" : "article"];
      if (post.category?.slug) tags.push(post.category.slug);
      await saveTask({
        title: t("feed.post.planTaskTitle", { title: excerpt }),
        notes: t("feed.post.planTaskNotes", {
          author: authorLabel(post.author.name, post.author.email),
          date: new Date(post.createdAt).toLocaleString(),
          id: post.id,
        }),
        status: TaskStatus.Todo,
        tags,
      });
      pushToast(t("feed.post.planTaskCreated"), {
        tone: "success",
        actionLabel: t("feed.post.planTaskOpen"),
        onAction: async () => {
          await navigateTo("/tasks");
        },
      });
      return true;
    } catch {
      pushToast(t("feed.post.planTaskFailed"), { tone: "danger" });
      return false;
    } finally {
      planBusy.value = false;
    }
  }

  return { planBusy, planPostAsTask };
}
