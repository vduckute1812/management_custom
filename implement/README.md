# Implementation Documentation

Technical reference for the **Personal Task & Analytics Manager**. The root [`../README.md`](../README.md) describes the product — what the app *is* and how it *feels* to use. Everything in this folder describes the engineering: how it's built, where the code lives, and how to run it.

If you came here to **use** the app, start at the root README. If you came here to **change** the app, start here.

---

## Map

| File                                        | What's in it                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [`getting-started.md`](./getting-started.md)| Prerequisites, env vars, `npm` scripts, dev / prod commands, the first-run experience.      |
| [`architecture.md`](./architecture.md)      | Tech stack, runtime topology (browser → Nitro → MySQL), pool & schema ownership, project structure.|
| [`database.md`](./database.md)              | Full schema DDL, field references, timestamp conventions, migration policy.                 |
| [`api.md`](./api.md)                        | Every REST endpoint under `/api/*` with request/response shapes.                            |
| [`auth.md`](./auth.md)                      | Roles, token lifecycle (JWT + refresh), bootstrap admin, email transport.                   |
| [`auth-rbac.md`](./auth-rbac.md)            | Original feature spec for Authentication & RBAC (the "what was asked for" document).        |
| [`roadmap.md`](./roadmap.md)                | Phase-by-phase engineering progress, including the Phase 8 auth pass.                       |

## Feature specs vs. implementation docs

Two kinds of file live here side-by-side:

- **Implementation docs** (`architecture.md`, `database.md`, `api.md`, `auth.md`, `getting-started.md`, `roadmap.md`) — the **as-built** reference. Always describes what currently exists in the code.
- **Feature specs** (`auth-rbac.md`, plus future per-feature spec files) — the **as-asked** record. Describes what was requested for a given feature, captured before or during implementation. Useful as a paper trail; not edited to track the code.

When a new feature lands, drop its spec in next to `auth-rbac.md` (one file per feature) and update the implementation docs above to match the new shape.
