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
2. **Redis (production)** — `docker-compose.prod.yml` runs `mgmt-redis-prod` (loopback publish only) and sets `REDIS_URL=redis://host.containers.internal:6379/0` + `CACHE_DRIVER=redis` (no compose DNS on this Podman network). Uses `ioredis`. On connect/ping failure, **falls back to memory** and logs a warning. Keys are prefixed `mgmt:{CACHE_NAMESPACE|DB_NAME}:`. Cache-only Redis: no RDB/AOF, `maxmemory 128mb`, `allkeys-lru`.

### What we cache today

| Key                  | TTL | Source                            | Invalidation                                                     |
| -------------------- | --- | --------------------------------- | ---------------------------------------------------------------- |
| `categories:list`    | 60s | `GET /api/categories`             | Admin category create / patch / delete                           |
| `feed:public:{hash}` | 20s | `GET /api/posts` **without** auth | Public post create / share / update / delete; category mutations |

Authenticated feed reads **bypass** the cache entirely (viewer ACL is personal).

Helpers: `server/utils/cacheInvalidate.ts`
(`invalidateCategoryCaches`, `invalidatePublicFeedCaches`).

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

| Type                  | Payload                        | Handler                                                |
| --------------------- | ------------------------------ | ------------------------------------------------------ |
| `email.verification`  | `{ to, token }`                | `sendVerificationEmail`                                |
| `email.passwordReset` | `{ to, token }`                | `sendPasswordResetEmail`                               |
| `email.send`          | `{ to, subject, text, html? }` | `sendMail`                                             |
| `cache.invalidate`    | `{ prefixes: string[] }`       | `cacheDelPrefix` each                                  |
| `media.purgeExpired`  | `{}`                           | `purgeExpiredStories` (story rows + orphan R2 uploads) |

Enqueue helpers live in `server/utils/queue.ts`
(`enqueueVerificationEmail`, `enqueuePasswordResetEmail`, `enqueueEmailSend`, `enqueueCacheInvalidate`, `enqueueMediaPurgeExpired`).

### Worker

`server/plugins/job-worker.ts` (Nitro plugin):

1. Polls on `QUEUE_POLL_MS` / idles on `QUEUE_IDLE_MS`
2. Claims one job, runs `processJob`, completes or fails
3. Exponential backoff on failure: 15s × 2^(attempt−1), cap 15 minutes
4. After `max_attempts`, status → `dead`
5. Every ~2 minutes: requeue stale `processing` rows (`QUEUE_STALE_SECONDS`), purge old `completed`/`dead` (`QUEUE_PURGE_DAYS`), and **sweep expired stories + their Cloudflare R2 media**

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
      "failed": 0,
      "dead": 0
    }
  }
}
```

---

## Configuration

| Env                    | Default                                                                    | Meaning                                  |
| ---------------------- | -------------------------------------------------------------------------- | ---------------------------------------- |
| `REDIS_URL`            | unset locally; prod compose sets `redis://host.containers.internal:6379/0` | Enable Redis cache driver when reachable |
| `CACHE_DRIVER`         | auto; prod compose forces `redis`                                          | Force `memory` or `redis`                |
| `CACHE_NAMESPACE`      | `DB_NAME` / `rc`                                                           | Redis key prefix segment                 |
| `CACHE_MEMORY_MAX`     | `500`                                                                      | In-process entry cap                     |
| `QUEUE_WORKER_ENABLED` | `true`                                                                     | Run in-process worker                    |
| `QUEUE_POLL_MS`        | `1500`                                                                     | Busy poll interval                       |
| `QUEUE_IDLE_MS`        | `4000`                                                                     | Sleep when queue empty                   |
| `QUEUE_STALE_SECONDS`  | `300`                                                                      | Reclaim stuck `processing`               |
| `QUEUE_PURGE_DAYS`     | `14`                                                                       | Delete old terminal jobs                 |

See `.env.example` and [`getting-started.md`](./getting-started.md).

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
