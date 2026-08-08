# Personal Task & Analytics Manager

A local-first productivity tool with five product areas on one install: **Time Management** (plan the week, log sessions, analytics), **Feed** (posts, stories, reactions), **Money** (personal ledger, budgets, savings), **Chat** (direct messages with emoji and stickers), and **Friends** (requests that gate chat and sharing). Built to run on your own machine, with first-class JSON / CSV / iCal export for task data.

> **Design ethos.** Single-user simplicity for tasks and money; multi-user safety by default. Epics, tasks, time blocks, the timer, and the Money ledger are always private to the account. The Feed is install-shared with explicit visibility (`public` / `private` / `shared`). Chat is private 1:1 between signed-in members who are friends. Admins additionally see a roll-up dashboard across every user.

> Looking for the engineering side — installation, schema, API, code layout? Head to [`implement/`](./implement/README.md). This document is the **product** description; everything code-shaped lives over there.

> **Proprietary — all rights reserved.** This is not open source. Copyright © 2026 Đức Nguyễn Văn. Nobody may use, copy, run, modify, or distribute any part of this repository without prior written permission from the owner. See [License](#license) and [`LICENSE`](./LICENSE).

---

## Table of Contents

- [Design Principles](#design-principles)
- [Who It's For](#who-its-for)
- [Features](#features)
- [Key User Flows](#key-user-flows)
- [Data Model Concepts](#data-model-concepts)
- [Roles & Permissions](#roles--permissions)
- [Visual Design System](#visual-design-system)
- [Interaction Patterns](#interaction-patterns)
- [States & Edge Cases](#states--edge-cases)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Accessibility](#accessibility)
- [Responsive Behavior](#responsive-behavior)
- [Design Decisions Log](#design-decisions-log)
- [Implementation Documentation](#implementation-documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Design Principles

These five principles are the lens for every product decision. When in doubt, ranking is top-to-bottom.

1. **Local & owned.** Primary data lives in a MySQL database you administer. Optional Cloudflare R2 holds feed/story attachments, chat photos/voice notes, and profile avatars when media is enabled — still under your account, not a multi-tenant SaaS. No telemetry. JSON / CSV / iCal export for tasks is one click away in `Settings → Your data`.
2. **Calm by default.** No gamification badges or dopamine loops. Chat unread counts and opt-in pre-task alerts exist only as practical signals you control — the tool otherwise waits patiently and reports faithfully.
3. **One screen, one job.** Hub picks a module; the module sidebar keeps you inside that area. Time Management plans on `/tasks`. Feed shares on `/feed`. Money tracks spend on `/money` (budgets `/money/budgets`, savings `/money/savings`). Chat messages on `/chat`. Friends manage the social graph on `/friends`. Analytics reflects. We resist cramming "everything everywhere."
4. **Keyboard-first.** Every primary action has a shortcut. The mouse is a fallback, not the contract.
5. **Honest math.** Aggregates are always computed, never stored. If two views show different numbers, the tool is broken — not "eventually consistent."

A useful negative principle: **no gamification.** Streaks, points, and combos work against accurate self-knowledge.

---

## Who It's For

| Persona                | What they need                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------- |
| **The Maker**          | A weekly canvas for deep work, with honest data on whether estimates match reality. |
| **The Researcher**     | Long-running Epics (months) with many small, mixed tasks underneath.                |
| **The Solo Operator**  | Visibility across projects without the ceremony of Jira or Notion databases.        |
| **The Household lead** | A private money ledger (spend, budgets, savings) next to the weekly plan.           |

Not for: client handoff, invoicing other people, or multi-tenant team workflows. Install members can become Friends, share Feed posts with specific people, and chat 1:1 with each other. Money stays per-account — it is not shared billing.

---

## Features

Each feature is framed as **what the user accomplishes**, not what the code does.

### Plan the week with Epics

Group related work under a named goal (e.g. _Computer Vision_). The Epic itself stores no hours — its totals are always summed from child tasks, so they can never lie. Deleting an Epic preserves its tasks; they simply become standalone.

### Capture and schedule tasks

Every task carries title, notes, status, due date, estimate, progress, tags — and an array of **time blocks**. A block is one focused session: a date, a start time, an end time, and the hours actually logged. One task can have many blocks across many days, which is how real work actually happens.

### Three calendar lenses

| View    | Purpose                                                                                                                                                                                        |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Daily   | Today, hour by hour. Drag, resize, click empty space to capture. A live "now" line sweeps across the hour grid with a `HH:mm` badge in the gutter so you always know where you are in the day. |
| Weekly  | The classic 7-column plan; a task's Monday and Friday blocks both appear in their respective columns. Today's column header shows the same live `Now HH:mm` pill.                              |
| Monthly | Coarse density (dots) + deadline markers; click a day to drill in.                                                                                                                             |

The "now" indicator ticks every 30 seconds and snaps forward when the tab regains focus, so it stays accurate without burning a render every second.

### Share on the Feed

Open **Feed** (`g f` or Home → category cards / Feed). Guests can read **public** posts. Signed-in users can post with categories, optional LaTeX, styled text, attachments (when R2 is configured), and visibility (`public` / `only me` / `specific people`). Stories last 24 hours with viewers and reactions for the author. Scroll the stream to load older pages. On phones (or coarse pointers), the reaction picker opens as a compact sheet. The hub lists core tech directories with labels that follow the UI language. On wide screens the Feed uses a two-column layout (post stream + sticky category filter); filters collapse to a horizontal chip row on smaller viewports. Author avatars and titles from **Profile** appear next to posts and stories when set.

### Chat with other members

Open **Chat** (`g c` or the header link when signed in). Search for a person by name or email, start a 1:1 conversation, and send text, stickers, **photos**, or **voice notes**; emoji from the picker insert into your draft before you send. Images and audio go through the same upload pipeline as the Feed (Cloudflare R2). Scroll up in a thread to load older messages. Long-press a bubble to react with an emoji; chips under the bubble show aggregates. Conversations stay private to the two participants. When the other person has read your messages, a **Read** label appears. Unread counts show on the conversation list and as a badge on **Chat** in the header; new messages also trigger an in-app toast (and a desktop notification if you have granted permission).

### Track money

Open **Money** (`g m` or the module nav). The ledger at `/money` records income and expenses in integer minor units of your profile currency (VND / USD / CNY / TWD — change anytime in Settings; historical amounts are not converted). Built-in and custom categories power filters and charts. **Budgets** (`/money/budgets`) set an overall or per-category monthly cap and show spend vs limit. **Savings** (`/money/savings`) tracks goals with contributions and progress. Export CSV/JSON from the Money toolbar when you need a snapshot outside the app.

### Friends

Open **Friends** from the Feed/Friends module nav (or command palette). Send and accept friend requests, decline, or unfriend. Friendship is the gate for starting Chat threads and for Feed visibility aimed at specific people — not a public social network.

### Edit your profile

Open **Profile** from the account menu (or Settings → Edit profile). Update display name, title, job, location, and avatar (image upload when R2 is configured). Changes apply immediately to your session and show on the Feed next to your posts and stories. Role and email are managed separately (admin / verification flows).

### Switch language

The interface is available in **English**, **Vietnamese**, **Simplified Chinese**, and **Traditional Chinese**. On first visit the app guesses from your Cloudflare country or timezone when available; after that the preference is saved on this device only (same store as theme and density) — URLs do not change when you switch.

| Where                 | What                              |
| --------------------- | --------------------------------- |
| `Settings → Language` | Button group for all four locales |
| Header → account menu | Compact language select           |

Chrome, toasts, calendar weekday names, and status/role labels follow the chosen language. Posts, task titles, and other content you type stay as written.

### Pre-task alerts

Five minutes before every scheduled block (configurable in `Settings → Pre-task alerts`), the app fires a heads-up so you don't crash into the next session unprepared. Two channels, deduped by block id so a single block can never alert twice:

- **In-app toast** — always fires, no browser permission required. Appears in the top of the window with the task title, the time window, a "Starts in N min" hint, and an **Open** action that pops the task modal regardless of which page you're on.
- **Desktop pop-up** — fires _additionally_ if you grant the Notification permission. Useful when the tab isn't focused.

In-app toasts are on by default for fresh installs; flip the master switch off in settings if you'd rather not be alerted. The setting persists locally, so an existing user who turned it off stays off after the upgrade.

### Honest analytics

- **Velocity:** estimated vs. actual hours per day / week / month.
- **Completion vs. roll-over:** how often deadlines hold.
- **Epic velocity:** rolled-up estimates vs. spend per project area.
- **Variance:** signed delta per Epic and per tag so you can see where you systematically over- or under-estimate.

---

## Key User Flows

Concrete journeys, each rated by target friction.

### Flow 1 — "Plan tomorrow morning" _(target: ≤ 90 seconds)_

1. Open **Time Management** (`g d` or Home → Time management) → **Daily** view of tomorrow (`t` then `→`).
2. From the _Up next_ rail, drag tasks onto morning hour slots, or click an empty slot to create there.
3. Press `n` for quick capture; type `Read MLE paper @9` or `Draft tomorrow 9-11` + `Enter`.
4. Done. No modal traversal required for routine planning. (`Shift+N` opens the full editor when you need it.)

### Flow 2 — "Log what I just spent" _(target: ≤ 15 seconds)_

1. While in **Daily** view, click the existing block.
2. Tap **Log Nh** to use the full block duration (or enter a custom amount).
3. Done — task `spentHours` and parent Epic totals recompute instantly. Double-click (or _Edit details_) opens the full modal.

### Flow 3 — "Weekly review" _(target: ≤ 5 minutes)_

1. Navigate to **Analytics** with `g a`.
2. Toggle granularity to **week**; scan velocity bars for outliers (red variance > 1.5h).
3. In **Rolled over**, move missed tasks to today / tomorrow (or bulk-move all).
4. Drill into any Epic via the velocity rollup list; optional drag-reschedule on the weekly canvas.

### Flow 4 — "Switch interface language" _(target: ≤ 10 seconds)_

1. Open **Settings** (account menu → Settings, or sidebar when in Time Management).
2. Under **Language**, pick English / Tiếng Việt / 简体中文 / 繁體中文.
3. Nav, forms, toasts, and calendar labels update immediately; the choice persists for next visits on this browser.
4. Shortcut: open the header account menu and use the language select without leaving the current page.

Engineering detail (message files, sync plugin, key namespaces): [`implement/i18n.md`](./implement/i18n.md).

### Flow 5 — "Update profile" _(target: ≤ 60 seconds)_

1. Open **Profile** from the account menu (or Settings → Edit profile).
2. Tap **Edit profile**; optionally change the photo, then fill name / title / job / location.
3. **Save changes** — the header chip and Feed author line update from the PATCH reply without a full reload.

---

## Data Model Concepts

### Epics vs. Tasks

| Concept       | Role                                                                 |
| ------------- | -------------------------------------------------------------------- |
| **Epic**      | A grouping container with a title, description, status, color, tags. |
| **Task**      | The unit of work. Belongs to at most one Epic via `epicId`.          |
| Derived hours | Epic totals are **computed**, not stored — always sum from tasks.    |

An Epic without tasks is valid (useful for planning ahead). A task without an `epicId` is a standalone item.

### Time Blocks (Multi-day Scheduling)

A task's scheduling is an array of `timeBlocks` rather than a single `timeline`. One logical task can span multiple sessions:

```
Task: "Image Processing"   estimatedHours: 6
  ├── Block 1  Mon 2026-06-20  09:00–11:00   spentHours: 2.0
  ├── Block 2  Wed 2026-06-22  14:00–16:30   spentHours: 2.5
  └── Block 3  Fri 2026-06-24  10:00–11:30   spentHours: 1.5
                                              ──────────────
                                 task.spentHours (derived): 6.0
```

The task-level `spentHours` is derived by summing block-level values. Each block renders independently in its day's calendar column.

### Color identity

Epics carry an optional `color` (`brand` | `sky` | `emerald` | `amber` | `rose` | `violet` | `slate`). All child task blocks inherit it, so a glance at the weekly view reveals _project mix_, not just _status mix_. Status is encoded with a left edge stripe and an icon, so the two channels never compete.

> For the storage shape behind these concepts — table columns, types, indexes — see [`implement/database.md`](./implement/database.md).

---

## Roles & Permissions

| Role         | Sees                                                                                      | Can do                                                                                                                                                                             |
| ------------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normal`     | Own epics/tasks/timer/Money; Feed per visibility rules; Chat with friends; Friends graph. | Full Time Management and Money for own data; create/react/comment on the Feed; DM friends; manage friend requests.                                                                 |
| `admin`      | Everything `normal` sees, plus a system-wide admin dashboard.                             | Promote/demote other users between `admin` ↔ `normal`, view per-user roll-ups & charts.                                                                                            |
| `superadmin` | Same as `admin`. Exactly one per install — the bootstrap account.                         | Everything `admin` can, plus owner-only ops (e.g. permanently delete a user). Role is **never assignable through the UI**: seeded by `npm run migrate:auth` and cannot be demoted. |

Time Management and Money are private per account. The Feed is the intentional shared surface (with public guest browse). Friends are the social graph for Chat and selective Feed sharing. Chat is private 1:1 between signed-in friends. The superadmin is created once at install time (see [`implement/auth.md`](./implement/auth.md)); after that, admins promote other admins through the app.

---

## Visual Design System

A small system on purpose. Fewer choices, more consistency.

### Color tokens

| Role              | Token             | Notes                                                                                              |
| ----------------- | ----------------- | -------------------------------------------------------------------------------------------------- |
| Brand             | `--color-brand-*` | Indigo scale (50–900) — app chrome, CTAs, hub ambient, Money shell                                 |
| Surface base      | `slate-50`        | Body background                                                                                    |
| Surface elevated  | `white`           | Cards, modals, calendar cells                                                                      |
| Border / hairline | `slate-200`       | Default 1px ring                                                                                   |
| Text primary      | `slate-900`       | Body                                                                                               |
| Text secondary    | `slate-500`       | Meta, labels                                                                                       |
| Success           | `emerald-500`     | Done status, positive variance                                                                     |
| Warning           | `amber-500`       | In-progress                                                                                        |
| Danger            | `rose-500`        | Overdue, destructive actions                                                                       |
| Manuscript / Feed | `--mf-*`          | Sage paper/ink/accent **scoped** to manuscript cards and Feed reading surfaces — not global chrome |

**Epic accent colors:** `sky`, `emerald`, `amber`, `rose`, `violet`, `slate`. Each ships as a pre-resolved Tailwind pair (`bg-*-100 text-*-800`) so accent classes are statically detectable at build time. Violet here is an epic chip only — hub ambient and chrome stay brand indigo.

**Contrast.** All text/background pairs target WCAG 2.1 AA (4.5:1 for body, 3:1 for ≥18px). Status pills are tested against their own backgrounds, not the page.

### Theming (light & dark)

Three theme modes selectable via the sidebar quick toggle or `Settings → Appearance`:

| Mode       | Behavior                                                                 |
| ---------- | ------------------------------------------------------------------------ |
| **System** | Tracks `prefers-color-scheme`; flips live when the OS preference changes |
| **Light**  | Forces the light palette                                                 |
| **Dark**   | Forces the dark palette                                                  |

The preference is persisted locally and applied **before any CSS paints**, so dark-OS users opening the app cold see dark mode from the first frame — no flash of light content.

Language preference lives in the same local settings blob (`Settings → Language`). It does not affect the URL and does not travel with the account to another browser.

Status and epic colors are _tinted_ in dark mode, never inverted — color-coded semantics must survive the swap.

### Typography

| Token  | Size | Use                                         |
| ------ | ---- | ------------------------------------------- |
| `xs`   | 11px | Meta, dot labels, table headers (uppercase) |
| `sm`   | 13px | Body, list items, modal fields              |
| `base` | 14px | Default paragraph                           |
| `lg`   | 16px | Section headings                            |
| `xl`   | 20px | Page titles                                 |
| `2xl`  | 24px | KPI numbers                                 |

System font stack only — no web fonts to load. Numerals use `tabular-nums` everywhere a column of digits could shift.

### Spacing & density

- 4px base unit.
- **Comfortable** is the default density; a **Compact** toggle in `Settings → Appearance` scales padding by ~0.75× (and the daily calendar's hour height down a notch) without changing font size.
- Cards: one radius (`xl` = 12px), one border style. Resist visual variety.

### Elevation

- Resting cards: subtle ring, no shadow.
- Floating modals: large shadow + ring.
- Hover: shadow promotes only when actionable.

### Motion

| Token       | Duration | Easing      | Use                            |
| ----------- | -------- | ----------- | ------------------------------ |
| `motion-xs` | 120ms    | ease-out    | Hover, focus rings             |
| `motion-sm` | 180ms    | ease-out    | Modal fade, tooltip            |
| `motion-md` | 240ms    | ease-in-out | View transitions, drawer slide |
| `motion-lg` | 320ms    | ease-in-out | Layout reflow on view change   |

**`prefers-reduced-motion: reduce`** disables non-essential transitions and replaces slides with instant cross-fades.

---

## Interaction Patterns

### Modal vs. drawer vs. inline

| Context                                  | Pattern                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Create / edit a task or epic             | Centered modal                                                                                          |
| Add a time block to an existing task     | Inline editor inside the modal                                                                          |
| Quick-capture a task title from anywhere | Single-line command bar                                                                                 |
| Change a task's status                   | Inline dropdown on the row                                                                              |
| Change a task's date by drag             | Direct manipulation on the calendar                                                                     |
| Confirm destructive action               | **Undo toast** (5 s) — _not_ a blocking dialog, except for Epic delete which has cascading orphan logic |

### Micro-interactions

- **Hover** raises an actionable item one elevation step.
- **Press** scales 0.98 for tactile feedback.
- **Focus** is always visible: a 2px ring in `brand-200`. Never `outline: none` without a replacement.
- **Save** transitions to a momentary check-mark icon (300ms) before the modal closes — confirms persistence without a toast.

### Drag interactions

- **Daily — move:** drag a block vertically to reschedule within the day; everything snaps to a 15-minute grid.
- **Daily — resize:** hover a block to reveal top/bottom handles; drag to grow or shrink; minimum block size is 30 minutes.
- **Weekly — move:** drag a block to another day column. The time of day is preserved; only the date changes.
- A "Moved to {weekday} {day}" toast confirms cross-day moves.

### In-app timer

- One active timer at a time. Starting a timer on a different task **automatically finalizes the previous one** into a logged block — you never silently lose tracked time.
- Sessions shorter than 30 seconds are discarded (assumed mis-click) and the user is informed via toast.
- The active timer is persistent: closing the tab and reopening continues from the original start time. Refresh recovers state from the server.
- Stopping appends a new `TimeBlock` with `start = startedAt`, `end = now`, and a `spentHours` rounded to two decimals.
- A pulsing `TimerPill` lives in the bottom-right (bottom-center on mobile) with the task name, elapsed `H:MM:SS`, and a one-click Stop. Same surface as the toast stack so it never overlaps page chrome.

### Pre-task alerts

- **Channels.** In-app toast always; desktop pop-up additionally if browser permission has been granted. Both fire from the same trigger and share one dedupe key (`taskId:blockId`) so a block never alerts twice.
- **Timing.** Fires `notificationLeadMinutes` (default 5) before each block. If the lead window has already passed but the block hasn't started yet — say, you opened the app 3 min before a 5-min lead — the alert fires immediately rather than being silently skipped.
- **Open action.** The toast carries an **Open** button that sets a shared `focusTaskId` and routes to `/tasks`; the tasks page watches the signal and pops the task modal so the user lands on the right thing in one tap, regardless of which page they were on.
- **Reschedule horizon.** The scheduler holds at most 24 hours of `setTimeout`s at a time; a 15-minute rolling pass picks up blocks as they enter the window. Blocks rescheduled inside the modal trigger a fresh schedule pass on save.

### Checklist sub-items

- Plain text items with a `done` boolean, edited in-place inside the task modal.
- Lists show a `✓ 3/5` hint so users can see progress without opening the modal.
- Does not replace task `progress` — the two are separate signals so a task with most boxes ticked can still show 60% if the heavy lift hasn't shipped.

### Confirmation strategy

Undo > Confirm wherever possible. The pattern:

```
[Task deleted]   ↶ Undo                          (5 s, top-center)
```

Reserved for true confirms: Epic deletion (because it modifies many tasks).

---

## States & Edge Cases

Every screen has four states. The README — and the code — must specify all four.

### Empty

| Surface                    | Empty state                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| Time Management (`/tasks`) | Centered empty state, primary CTA "Create your first task" (`n`), secondary "Load sample data" |
| Epics index                | Same pattern; CTA "Create your first epic"                                                     |
| Analytics                  | Friendly message: "We'll show velocity after you log a few blocks."                            |
| Up next sidebar            | Italic "Nothing scheduled. Create your first task!"                                            |
| Calendar day               | Hint cell "Click to plan a block"                                                              |
| Money ledger               | CTA to add the first transaction for the month                                                 |
| Money budgets / savings    | Prompt to create a budget or savings goal                                                      |
| Friends                    | Empty list with search to find install members                                                 |

### Loading

- **Skeletons, not spinners.** List rows and cards use pulse placeholders while data loads.

### Error

- Non-blocking: a rose banner at the top of the affected pane with a **Retry** button.
- Blocking only for irrecoverable cases (the database is unreachable, the schema is missing) with a clear message pointing the user at their local server / database.

### Conflict / stale data

- Writes are serialized so two near-simultaneous edits can't clobber each other.
- If a task was modified by another tab while the modal was open, save shows: "This task changed on disk. Reload and re-apply your changes?"

### Offline / unreachable server

- The app is **local-first** but still needs the local Nitro process and MySQL. If the API is unreachable, requests fail with clear errors / toasts — data remains in your database, not in an offline client cache.

---

## Keyboard Shortcuts

Cross-platform: `Mod` = `Cmd` on macOS, `Ctrl` elsewhere.

### Global

| Shortcut    | Action                                               |
| ----------- | ---------------------------------------------------- |
| `?`         | Show the full shortcuts cheatsheet                   |
| `Mod + K`   | Open command palette (jump to anything)              |
| `n`         | New task (quick capture; skipped on home/feed/money) |
| `Shift + N` | New task (full modal; opens `/tasks`)                |
| `g h`       | Go to Home (hub)                                     |
| `g d`       | Go to Time Management (`/tasks`)                     |
| `g e`       | Go to Epics                                          |
| `g a`       | Go to Analytics                                      |
| `g f`       | Go to Feed                                           |
| `g c`       | Go to Chat                                           |
| `g m`       | Go to Money (`/money`)                               |
| `g r`       | Go to Friends (`/friends`)                           |

### Calendar

| Shortcut        | Action                        |
| --------------- | ----------------------------- |
| `1` / `2` / `3` | Daily / Weekly / Monthly view |
| `t`             | Jump to Today                 |
| `←` / `→`       | Previous / Next period        |

### Calendar (mouse & touch)

| Gesture              | Action                                          |
| -------------------- | ----------------------------------------------- |
| Drag block (Daily)   | Move within day, snaps to 15-minute grid        |
| Drag top/bottom edge | Resize block (30-minute minimum)                |
| Drag block (Weekly)  | Move across days (time of day preserved)        |
| Click empty slot     | Open task modal pre-filled with that start time |

### Modals & forms

| Shortcut            | Action                             |
| ------------------- | ---------------------------------- |
| `Esc`               | Close (with unsaved-changes guard) |
| `Mod + Enter`       | Save                               |
| `Tab` / `Shift+Tab` | Focus next / previous field        |

---

## Accessibility

Targets, not aspirations. These are required for any PR.

- **WCAG 2.1 AA contrast** for all text and meaningful UI elements.
- **Full keyboard navigation.** Every interactive element reachable without a mouse; visible focus rings; no keyboard traps (modals trap intentionally, with `Esc` to escape).
- **Semantic HTML.** `<button>` for buttons (not divs), `<nav>` for nav, `<main>` for content, headings in order.
- **ARIA, sparingly.** Icon-only buttons get `aria-label`. Live regions announce undo toasts and save confirmations.
- **Reduced motion** — `prefers-reduced-motion: reduce` disables slides, scales, and easing curves; transitions become instant cross-fades.
- **Tap targets** ≥ 44×44 px on touch viewports; the calendar's hour cells expand on coarse pointers.
- **Color is never the only signal.** Status uses color _and_ a label _and_ a dot. Variance uses color _and_ a sign.
- **Skip link** "Skip to main content" appears on Tab from page load.

---

## Responsive Behavior

A productivity tool should be useful on a phone for capture, even if planning happens at a desk.

| Breakpoint     | Layout                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **< 640px**    | Sidebar collapses to a bottom nav bar. Calendar shows Daily only; Weekly/Monthly disabled with a hint. Modals are full-screen sheets. |
| **640–1024px** | Sidebar becomes a top bar with icons. Weekly view stays but cells shrink and clamp at 2 lines per task.                               |
| **≥ 1024px**   | Full layout: left sidebar + main + right rail.                                                                                        |

**Print:** a print stylesheet renders a clean weekly agenda — sidebar hidden, hour grid black-on-white, no shadows.

---

## Design Decisions Log

A few choices that look opinionated and aren't accidents.

- **Local database, not a cloud service.** Your data stays on-device. The export pipeline (JSON / CSV / iCal) still produces a portable snapshot whenever you want one — the data is no less yours.
- **Aggregates are never stored.** Eliminates an entire class of "the sidebar says 5h but the modal says 6h" bugs.
- **Undo over confirm.** Confirm dialogs train muscle memory to click "OK." Undo is a more honest contract: the action happens, and we trust you to notice if it was wrong.
- **No streaks, no gamification badges.** The whole point is to face accurate numbers. Game mechanics distort them. (Chat unread counts are functional, not gamified.)
- **System fonts for app chrome.** Manuscript Feed surfaces defer-load Source Serif 4 with `font-display: swap` so chrome never blocks on Google Fonts.
- **Skeletons over spinners.** Spinners say "loading"; skeletons say "you're about to see _this much_ content," which is calmer.
- **Three views, not five.** Day, Week, Month. We resisted Quarter and Agenda — they're rarely useful and they add UI weight that costs every user every day.
- **In-app alerts only by default; desktop pop-ups are opt-in.** A calm tool doesn't ambush you with OS pop-ups, but a silent calendar is no better than no calendar. The compromise: a non-intrusive in-app toast fires 5 min before each scheduled block by default (no permission prompt, no system surface — only visible when the app is open). Granting browser Notification permission is an explicit upgrade that adds the matching desktop pop-up; the alert is otherwise identical. The whole feature is one toggle in `Settings → Pre-task alerts`.
- **Dark mode is a global override, not per-component variants.** New components inherit dark mode automatically as long as they use the standard color vocabulary; we don't sprinkle `dark:` prefixes through every file.
- **Language is a device preference, not a URL.** Same model as theme and density: stored in local settings, no `/en/...` prefixes, no server-side user locale. Switching language rewrites chrome only — user content stays as authored.
- **One active timer.** Letting two tasks both report as "in session" makes `spentHours` ambiguous. Single-active is honest, and the start endpoint auto-finalizes the previous one so switching never loses time.
- **Public SEO without indexing private chrome.** `@nuxtjs/seo` publishes `/robots.txt` + `/sitemap.xml` for the hub and Feed only; Time Management / admin / auth forms stay disallowed. `/` and `/feed` are selectively SSR'd so crawlers get real HTML; the rest of the app stays a client SPA.

---

## Implementation Documentation

The engineering side of the project lives in [`implement/`](./implement/README.md):

| Topic                                              | Document                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| Install, env vars, scripts, type-check, tests, SEO | [`implement/getting-started.md`](./implement/getting-started.md) |
| Stack, topology, auth cookies, validation, layout  | [`implement/architecture.md`](./implement/architecture.md)       |
| Database schema (DDL), field references            | [`implement/database.md`](./implement/database.md)               |
| REST endpoints + Zod validation patterns           | [`implement/api.md`](./implement/api.md)                         |
| HttpOnly cookies, JWT/refresh, client session      | [`implement/auth.md`](./implement/auth.md)                       |
| UI languages, plural `t()`, SEO titles             | [`implement/i18n.md`](./implement/i18n.md)                       |
| Original Authentication & RBAC feature spec        | [`implement/auth-rbac.md`](./implement/auth-rbac.md)             |
| Direct chat feature spec                           | [`implement/chat-spec.md`](./implement/chat-spec.md)             |
| Friends graph feature spec                         | [`implement/friends-spec.md`](./implement/friends-spec.md)       |
| Money ledger feature spec                          | [`implement/money-spec.md`](./implement/money-spec.md)           |
| Doppler secrets (prod)                             | [`implement/doppler.md`](./implement/doppler.md)                 |
| Phase-by-phase engineering progress                | [`implement/roadmap.md`](./implement/roadmap.md)                 |
| Cache & durable job queue                          | [`implement/cache-queue.md`](./implement/cache-queue.md)         |
| Raspberry Pi CI/CD deploy + rollback               | [`implement/ci-cd.md`](./implement/ci-cd.md)                     |

---

## Contributing

This is a personal, proprietary tool. Contributing requires written permission from the owner first — write to ducbkdn95@gmail.com before cloning, building, or opening a pull request. Suggestions and bug reports are welcome without permission; code is not.

Once you have permission:

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Commit your changes: `git commit -m "feat: add my feature"`
3. Push and open a pull request.

Please keep all data handling local — no external API calls or cloud storage without discussion. Every PR is expected to honor the [Design Principles](#design-principles), the [Accessibility](#accessibility) targets, and to spec all four [States & Edge Cases](#states--edge-cases) for any new surface.

By submitting a contribution you assign the owner the right to use and relicense it, as set out in section 7 of [`LICENSE`](./LICENSE).

---

## License

**Proprietary. All rights reserved.** Copyright © 2026 Đức Nguyễn Văn <ducbkdn95@gmail.com>.

This project is **not** open source and carries no permissive license. Without prior written permission from the owner, no one may use, run, host, copy, clone, fork, modify, merge, publish, distribute, sell, sublicense, or use as AI/ML training data any part of this repository. Publishing the code here — for review, backup, or portfolio purposes — is not an offer of a license.

To ask for permission, email **ducbkdn95@gmail.com** describing who you are, what you want to do, and for how long. Permission is personal, limited in scope, and revocable.

Third-party dependencies keep their own licenses; this license only covers the code owned by the project owner.

Full terms, in English and Vietnamese: [`LICENSE`](./LICENSE).

_Tóm tắt tiếng Việt:_ Dự án là tài sản độc quyền, bảo lưu mọi quyền. Không ai được sử dụng, chạy, sao chép, fork, sửa đổi hay phân phối bất kỳ phần nào của mã nguồn này khi chưa có sự cho phép trước bằng văn bản của chủ sở hữu. Xin phép qua email **ducbkdn95@gmail.com**. Điều khoản đầy đủ: [`LICENSE`](./LICENSE).
