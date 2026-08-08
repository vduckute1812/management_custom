# Cache & Queue — System Design

As-built design for **read caching** and **background jobs** in this install.
Pairs with [`architecture.md`](./architecture.md), [`database.md`](./database.md),
and [`api.md`](./api.md). The original ask is captured in
[`cache-queue-spec.md`](./cache-queue-spec.md).

---

## Design goals

| Goal                               | Decision                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| Pi / single-node first             | Queue is **MySQL-backed**; Redis runs in **production** for shared cache (optional locally) |
| Never block user mutations on SMTP | Verification mail is **enqueued**, not sent inline                                          |
| Fail open                          | Redis outages fall back to memory; cache misses hit MySQL                                   |
| No new mandatory service locally   | App boots with zero Redis in dev; worker runs inside Nitro                                  |
| Safe ACL                           | Only **anonymous public** feed pages are cached — never per-user feeds                      |

Negative goals: no distributed locks beyond MySQL `SKIP LOCKED`, no separate
worker container (yet), no cache of authenticated feed timelines.

---

## Topology

```
Browser / SPA
    │
    ▼
Nitro API routes
    │
    ├── Cache facade (server/utils/cache.ts)
    │     ├── memory driver  (default, process-local)
    │     └── redis driver   (when REDIS_URL is set)
    │
    ├── Domain SQL (server/db/*)  ←→  MySQL 8
    │     including table `jobs`
    │
    └── Job worker plugin (server/plugins/job-worker.ts)
          claims rows from `jobs` → handlers in server/utils/queue.ts
                └── email.* → server/utils/mailer.ts → SMTP / dry-run
```

---

## Cache

### Abstraction

`server/utils/cache.ts` exposes:

| API                                                     | Role                        |
| ------------------------------------------------------- | --------------------------- |
| `cacheGet` / `cacheSet` / `cacheDel` / `cacheDelPrefix` | Primitive ops               |
| `cacheGetOrSet(key, ttl, loader)`                       | Read-through                |
| `CacheKeys.*`                                           | Canonical key builders      |
| `CacheTTL.*`                                            | Default TTLs (seconds)      |
| `cacheDriverName()`                                     | `memory` \| `redis` for ops |

### Drivers

1. **Memory (default locally)** — `Map` with TTL + crude LRU eviction (`CACHE_MEMORY_MAX`, default 500). Used when `REDIS_URL` is unset.
2. **Redis (production)** — `docker-compose.prod.yml` runs `mgmt-redis-prod` and sets `REDIS_URL` + `CACHE_DRIVER=redis` to the Pi LAN bind (no compose DNS on this Podman network). Uses `ioredis`. On connect/ping failure, **falls back to memory** and logs a warning. Keys are prefixed `mgmt:{CACHE_NAMESPACE|DB_NAME}:`. Cache-only Redis: no RDB/AOF, `maxmemory 128mb`, `allkeys-lru`.

### What we cache today

| Key                  | TTL | Source                            | Invalidation                                                     |
| -------------------- | --- | --------------------------------- | ---------------------------------------------------------------- |
| `categories:list`    | 60s | `GET /api/categories`             | Admin category create / patch / delete                           |
| `feed:public:{hash}` | 20s | `GET /api/posts` **without** auth | Public post create / share / update / delete; category mutations |

Authenticated feed reads **bypass** the cache entirely (viewer ACL is personal).

Helpers: `server/utils/cacheInvalidate.ts`
(`invalidateCategoryCaches`, `invalidatePublicFeedCaches`).

### Process-local ACL helpers (not Redis)

Separate from the cache facade — short TTL `Map`s inside the Nitro process:

| Map                                     | TTL | Purpose                                                                                                                                                                           | Invalidation                                                                                                                |
| --------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Accepted friend ids (`friendshipCache`) | 60s | Feed/story/upload ACL `IN (…)` lists                                                                                                                                              | Bust on accept / unfriend                                                                                                   |
| Upload ACL allow + row (`uploadAccess`) | 10s | `/api/uploads/:id` hot path — positive row cache on allow; authenticated miss uses cheap own/avatar probe before full post/story/chat `EXISTS` (friend ids only after cheap miss) | TTL; also bust per viewer on accept / unfriend. Denies uncached. Download responses use `Cache-Control: private, no-store`. |

These are intentional per-process caches: wrong answers expire quickly; denies never poison the map.

### When to add more cache

Good candidates (short TTL + explicit bust):

- Admin rollup stats (`GET /api/admin/stats`) for dashboards
- Public hub category cards if they grow expensive
- Manuscript reading-time / derived metadata (never the body as the only store)

Avoid caching:

- Anything scoped by `userId` without including that id in the key
- JWT / session material
- Raw uploaded media (R2 signed URLs already have their own TTL)

---

## Queue

### Why MySQL, not Bull/Redis Streams

| Constraint                                | Implication                         |
| ----------------------------------------- | ----------------------------------- |
| Production is often a single Raspberry Pi | Prefer one stateful service (MySQL) |
| Deploys recreate the app container        | Jobs must survive process death     |
| Email is rare but must retry              | Durable rows + exponential backoff  |

Redis remains valuable for **shared cache** across multiple app replicas later;
it is not required for correct queue behaviour.

### Schema (`jobs` — migration `0009`)

| Column                      | Notes                                                                 |
| --------------------------- | --------------------------------------------------------------------- |
| `id`                        | `job_…`                                                               |
| `type`                      | e.g. `email.verification`                                             |
| `payload`                   | JSON                                                                  |
| `status`                    | `pending` → `processing` → `completed` \| back to `pending` \| `dead` |
| `attempts` / `max_attempts` | Retry budget (default 5)                                              |
| `available_at`              | Visibility timeout / delay / backoff                                  |
| `locked_at` / `locked_by`   | Claim metadata (`nitro:host:pid`)                                     |
| `last_error`                | Truncated failure text                                                |

Claim path uses `SELECT … FOR UPDATE SKIP LOCKED` so two Nitro processes
cannot double-run the same job.

### Job types

| Type                  | Payload                        | Handler                                                               |
| --------------------- | ------------------------------ | --------------------------------------------------------------------- |
| `email.verification`  | `{ to, token }`                | `sendVerificationEmail`                                               |
| `email.passwordReset` | `{ to, token }`                | `sendPasswordResetEmail`                                              |
| `email.send`          | `{ to, subject, text, html? }` | `sendMail`                                                            |
| `cache.invalidate`    | `{ prefixes: string[] }`       | `cacheDelPrefix` each                                                 |
| `media.purgeExpired`  | `{}`                           | `purgeExpiredStories` (story rows + orphan R2 uploads)                |
| `articles.fetch`      | `{ force?: boolean }`          | RSS/ArXiv fetch → insert `pending_articles` drafts → enqueue rewrites |
| `articles.rewrite`    | `{ articleId }`                | Gemini/OpenAI concise summary rewrite → `pending_approval`            |

Daily schedule: the job worker’s ~2 min maintenance tick calls `maybeScheduleDailyArticleFetch()` after `ARTICLES_FETCH_HOUR_UTC` (default `2`) when no completed fetch exists for the UTC day and the admin daily-fetch toggle is on (`app_settings` key `ArticlesDailyFetchEnabled=1`; env `ARTICLES_FETCH_ENABLED=false` still force-disables). Fetch uses curated reputable sources; LLM rewrite targets a concise ~3 minute summary (`ARTICLES_READ_MINUTES_*`) with a Source link footer. Env: `ARTICLES_FETCH_*`, `ARTICLES_EXPAND_*`, `ARTICLES_READ_MINUTES_*`, `LLM_PROVIDER`, `GEMINI_*` / `OPENAI_*`.

Enqueue helpers live in `server/utils/queue.ts`
(`enqueueVerificationEmail`, `enqueuePasswordResetEmail`, `enqueueEmailSend`, `enqueueCacheInvalidate`, `enqueueMediaPurgeExpired`).
Domain helpers for the article pipeline live in `server/services/admin/articleService.ts`.

### Worker

`server/plugins/job-worker.ts` (Nitro plugin):

1. Polls on `QUEUE_POLL_MS` / idles on `QUEUE_IDLE_MS`
2. Claims one job at a time (see **priority** below), runs `processJob`, completes or fails
3. Exponential backoff on failure: 15s × 2^(attempt−1), cap 15 minutes
4. After `max_attempts`, status → `dead`
5. Every ~2 minutes: requeue stale `processing` rows (`QUEUE_STALE_SECONDS`), purge old `completed`/`dead` (`QUEUE_PURGE_DAYS`), and **sweep expired stories + their Cloudflare R2 media**

#### Job priority (non-article first)

`claimNextJob` uses an `ORDER BY` priority tier so that fast, user-visible jobs
(`email.*`, `cache.*`, `media.*`) are always processed ahead of long-running
AI article jobs (`articles.*`) when both are pending:

```sql
ORDER BY
  CASE WHEN type LIKE 'articles.%' THEN 1 ELSE 0 END ASC,
  available_at ASC,
  created_at ASC
```

This means a queued verification e-mail will never be blocked behind an LLM
rewrite call, even on a Pi deploy. The in-process worker defaults to
`QUEUE_CONCURRENCY=2` with **at most one** `articles.*` job active at a time
(`claimNextJob({ excludeArticleTypes })` when an article slot is held). Set
`QUEUE_CONCURRENCY=1` for strict serial. Higher concurrency across processes
still relies on `FOR UPDATE SKIP LOCKED`.

Disable for migrate-only containers: `QUEUE_WORKER_ENABLED=false`.

### Signup path (before / after)

```
BEFORE:  signup handler ──await──► SMTP ──► response
AFTER:   signup handler ──insert jobs row──► response
              worker later ──► SMTP (retries / dry-run)
```

If enqueue itself fails, signup still returns `{ user, verificationSent: false }`.
The raw verification token / URL is **never** logged. Password-reset enqueue
failures are likewise silent about the raw token (forgot-password still
returns `{ ok: true }` to avoid account enumeration).

---

## Ops surface

`GET /api/admin/queue` (admin only):

```json
{
  "cache": { "driver": "memory", "redisConfigured": false },
  "queue": {
    "workerEnabled": true,
    "jobs": {
      "pending": 0,
      "processing": 0,
      "completed": 12,
      "dead": 0
    }
  }
}
```

---

## Configuration

| Env                    | Default                                                     | Meaning                                  |
| ---------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| `REDIS_URL`            | unset locally; prod compose sets `redis://${LAN_IP}:6379/0` | Enable Redis cache driver when reachable |
| `CACHE_DRIVER`         | auto; prod compose forces `redis`                           | Force `memory` or `redis`                |
| `CACHE_NAMESPACE`      | `DB_NAME` / `rc`                                            | Redis key prefix segment                 |
| `CACHE_MEMORY_MAX`     | `500`                                                       | In-process entry cap                     |
| `QUEUE_WORKER_ENABLED` | `true`                                                      | Run in-process worker                    |
| `QUEUE_POLL_MS`        | `1500`                                                      | Busy poll interval                       |
| `QUEUE_IDLE_MS`        | `4000`                                                      | Sleep when queue empty                   |
| `QUEUE_STALE_SECONDS`  | `300`                                                       | Reclaim stuck `processing`               |
| `QUEUE_PURGE_DAYS`     | `14`                                                        | Delete old terminal jobs                 |

See `.env.example` and [`getting-started.md`](./getting-started.md).

### Article pipeline & LLM

| Env                                 | Default                    | Meaning                                                                                 |
| ----------------------------------- | -------------------------- | --------------------------------------------------------------------------------------- |
| `ARTICLES_FETCH_ENABLED`            | `true`                     | Force-disable daily schedule when `0`/`false` (DB toggle still applies when env allows) |
| `ARTICLES_FETCH_HOUR_UTC`           | `2`                        | UTC hour before `maybeScheduleDailyArticleFetch` enqueues                               |
| `ARTICLES_FETCH_MAX_PER_SOURCE`     | `1`                        | Longest bodies kept per feed source                                                     |
| `ARTICLES_FETCH_MIN_CHARS`          | `800`                      | Minimum raw body after RSS (+ optional page expand)                                     |
| `ARTICLES_EXPAND_PAGES`             | `true`                     | Fetch article HTML when RSS body is short                                               |
| `ARTICLES_EXPAND_BELOW_CHARS`       | `1500`                     | Page-expand threshold                                                                   |
| `ARTICLES_READ_MINUTES_MIN` / `MAX` | `2` / `3`                  | Concise rewrite target (~220 wpm)                                                       |
| `LLM_PROVIDER`                      | `gemini`                   | `gemini` or `openai`                                                                    |
| `GEMINI_API_KEY`                    | unset                      | Required for Gemini rewrite                                                             |
| `GEMINI_MODEL`                      | `gemini-flash-lite-latest` | GenerateContent model id (Flash-Lite = cheaper default)                                 |
| `GEMINI_MAX_OUTPUT_TOKENS`          | `4096`                     | Gemini output cap                                                                       |
| `OPENAI_API_KEY` / `OPENAI_MODEL`   | unset / `gpt-4o-mini`      | OpenAI path                                                                             |
| `OPENAI_MAX_TOKENS`                 | `4000`                     | OpenAI output cap                                                                       |
| `LLM_TIMEOUT_MS`                    | `120000`                   | Shared LLM HTTP timeout                                                                 |

`enqueueArticleFetch` uses `maxAttempts: 3`; `enqueueArticleRewrite` uses `maxAttempts: 4` and staggers rewrites by 2s per queued row during a fetch run. Without an API key, fetch still inserts Draft rows (`rewriteQueued=0`). Source footer (`**Source:** [name](url)`) is appended server-side on rewrite and approve via `utils/articleAttribution.ts` — not by the LLM. Pi secrets: [`ci-cd.md`](./ci-cd.md#configure-gemini-on-the-pi-configure-geminish).

---

## Failure modes & mitigations

| Failure                 | Behaviour                                                                     |
| ----------------------- | ----------------------------------------------------------------------------- |
| Redis down at boot      | Log + memory driver                                                           |
| Redis error mid-request | Miss / skip write; loader still runs                                          |
| SMTP down               | Job retries with backoff; eventually `dead`                                   |
| App crash mid-job       | Stale reclaim returns row to `pending`                                        |
| Two app replicas        | `SKIP LOCKED` prevents double claim; use Redis cache if you need shared reads |

---

## Evolution path

1. **Now** — memory cache + MySQL queue (this document).
2. **Production** — Redis is part of `docker-compose.prod.yml`; Superadmin System monitor should show `cache.driver=redis`.
3. **When jobs multiply** — optional dedicated worker process with `QUEUE_WORKER_ENABLED=false` on the web container and `true` on the worker.
4. **Never** — put the only copy of user content in cache; MySQL remains source of truth.
