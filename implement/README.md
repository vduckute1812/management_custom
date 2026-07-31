# Implementation Documentation

Technical reference for the **Personal Task & Analytics Manager**. The root [`../README.md`](../README.md) describes the product — what the app _is_ and how it _feels_ to use. Everything in this folder describes the engineering: how it's built, where the code lives, and how to run it.

If you came here to **use** the app, start at the root README. If you came here to **change** the app, start here.

---

## Map

| File                                           | What's in it                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [`getting-started.md`](./getting-started.md)   | Prerequisites, env vars, `npm` scripts, type-check, SEO endpoints, first-run.                                  |
| [`architecture.md`](./architecture.md)         | Tech stack, hybrid SSR topology, auth cookies, validation/services layers, SEO, project structure.              |
| [`cache-queue.md`](./cache-queue.md)           | **Cache & job queue** system design (memory/Redis cache, MySQL `jobs`, Nitro worker).                          |
| [`database.md`](./database.md)                 | Schema DDL + feed/stories/jobs tables, field references, migration policy.                                     |
| [`api.md`](./api.md)                           | REST/SSE endpoints under `/api/*` (auth, tasks, feed bootstrap, stories, chat, uploads, geo, admin, queue). |
| [`auth.md`](./auth.md)                         | Roles, HttpOnly cookies, JWT/refresh, client session, profile, bootstrap superadmin, email transport.           |
| [`i18n.md`](./i18n.md)                         | Locales, first-visit geo/timezone detection, plural `t()` shape, Day.js / SEO titles.                           |
| [`auth-rbac.md`](./auth-rbac.md)               | Original feature spec for Authentication & RBAC (the "what was asked for" document).                           |
| [`cache-queue-spec.md`](./cache-queue-spec.md) | Feature spec for Cache & Queue.                                                                                |
| [`chat-spec.md`](./chat-spec.md)               | Feature spec for direct chat (emoji + stickers).                                                               |
| [`roadmap.md`](./roadmap.md)                   | Phase-by-phase engineering progress (auth, feed, chat, cache/queue, Nuxt 4.5 / Node 26, deploy prune).         |
| [`ci-cd.md`](./ci-cd.md)                       | Raspberry Pi self-hosted deploy, Docker npm 12 image, auto-build on `master`, rollback + prune rules.          |

## Feature specs vs. implementation docs

Two kinds of file live here side-by-side:

- **Implementation docs** (`architecture.md`, `database.md`, `api.md`, `auth.md`, `i18n.md`, `getting-started.md`, `cache-queue.md`, `roadmap.md`) — the **as-built** reference. Always describes what currently exists in the code.
- **Feature specs** (`auth-rbac.md`, `cache-queue-spec.md`, `chat-spec.md`, plus future per-feature spec files) — the **as-asked** record. Describes what was requested for a given feature, captured before or during implementation. Useful as a paper trail; not edited to track the code.

When a new feature lands, drop its spec in next to `auth-rbac.md` (one file per feature) and update the implementation docs above to match the new shape.
