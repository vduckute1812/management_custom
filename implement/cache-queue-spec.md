# Feature spec — Cache & Queue

**Status:** Implemented (as-built in [`cache-queue.md`](./cache-queue.md))  
**Asked:** Add cache and queue support; update system documentation; design as a systems expert.

---

## Problem

1. Hot read paths (category catalog, anonymous public feed) hit MySQL on every request.
2. Signup waits on SMTP; transient mail failures look like product failures and slow the happy path.
3. The Pi-friendly deploy cannot assume Redis/Bull as mandatory infra.

## Requirements

### Must

- Durable background jobs that survive app restarts
- Verification email dispatched asynchronously with retries
- Pluggable cache with a zero-deps default
- Explicit invalidation on writes that affect cached reads
- Operator visibility (admin endpoint + env knobs)
- Documentation in `implement/` (design + getting-started + architecture map)

### Must not

- Require Redis to boot or migrate
- Cache authenticated / ACL-sensitive feed payloads without a viewer key
- Block HTTP responses on SMTP round-trips

## Non-goals (this iteration)

- Separate worker container / K8s job
- Full-text search indexing pipeline
- Multi-region cache coherence

## Acceptance

- [x] Migration `0009_jobs_queue.sql`
- [x] Cache facade + memory/redis drivers
- [x] Categories + public feed caching with bust-on-write
- [x] Signup enqueues `email.verification`
- [x] In-process Nitro worker with backoff / stale reclaim / purge
- [x] `GET /api/admin/queue`
- [x] Docs: `cache-queue.md`, architecture / database / api / getting-started / roadmap updates
