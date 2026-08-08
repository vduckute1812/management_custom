/**
 * Orchestrates the automated article pipeline:
 * fetch → insert draft → AI rewrite → admin review → publish as manuscript.
 *
 * Implementation is split across sibling modules; this file re-exports the
 * public API so existing imports of `articleService` stay stable.
 */

export {
  enqueueArticleRewrite,
  enqueueArticleFetch,
  maybeScheduleDailyArticleFetch,
  getArticlePipelineSettings,
  updateArticlePipelineSettings,
  runArticleFetchJob,
  runArticleRewriteJob,
} from "./articlePipelineJobs";

export {
  listArticlesForAdmin,
  getArticleForAdmin,
  updateArticleForAdmin,
} from "./articleAdminCrud";

export { approveAndPublishArticle } from "./articlePublish";

export {
  deleteArticle,
  deleteArticles,
  rejectArticle,
  regenerateArticle,
} from "./articleLifecycle";
