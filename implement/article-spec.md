# Feature spec — Article content pipeline

**Status:** Implemented (as-built across `articleFetcher.ts`, `articleRewriter.ts`,
`articleService.ts`, admin UI, and related ops scripts).

## Flow

1. Daily (or manual Admin “Fetch now”) `articles.fetch` → RSS/ArXiv → length-ranked
   candidates → `pending_articles` **Draft**
2. If LLM configured (`GEMINI_API_KEY` or `OPENAI_API_KEY`) → staggered
   `articles.rewrite` → **PendingApproval** + excerpt
3. Admin edits / regenerates at `/admin/articles/pending/:id`
4. Approve → public `PostFormat.Manuscript` post + idempotent `**Source:**` footer

Without an LLM key, fetch still inserts Drafts (`rewriteQueued=0`); admins can
approve raw content or regenerate after configuring Gemini
(`docker/configure-gemini.sh`).

## LLM

- Default provider: Gemini (`GEMINI_MODEL=gemini-flash-latest`)
- Target length: `ARTICLES_READ_MINUTES_MIN`–`MAX` (default 5–10 min at ~220 wpm)
- Voice: narrator / storyteller; no invented facts; no LLM-authored source footer
  (footer is always applied in `utils/articleAttribution.ts`)

## Jobs

| Type               | Payload               | Notes                                                 |
| ------------------ | --------------------- | ----------------------------------------------------- |
| `articles.fetch`   | `{ force?: boolean }` | `maxAttempts: 3`; daily via `ARTICLES_FETCH_HOUR_UTC` |
| `articles.rewrite` | `{ articleId }`       | `maxAttempts: 4`; 2s stagger per item in a fetch run  |

Non-article jobs are claimed ahead of `articles.*` (see [`cache-queue.md`](./cache-queue.md)).

## Ops

- Env table: [`cache-queue.md`](./cache-queue.md#article-pipeline--llm) and `.env.example`
- Pi secrets: `docker/configure-gemini.sh` — [`ci-cd.md`](./ci-cd.md#configure-gemini-on-the-pi-configure-geminish)
- Deploy resilience: `docker/watch-deploy-actions.sh` — [`ci-cd.md`](./ci-cd.md#deploy-watch-pi-timer--heal-runner--re-run-failures)
- Admin API: [`api.md`](./api.md)
- Schema: [`database.md`](./database.md#pending-articles-migration-0031)
