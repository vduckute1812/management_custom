# Personal Task & Analytics Manager

A local-first productivity tool that helps a person plan their week, track time across multiple focused sessions, and see — at a glance — where their hours actually went. Built to live on your own machine, with first-class JSON / CSV / iCal export so you can snapshot your data whenever you like.

> **Design ethos.** Single-user simplicity, multi-user safety. Every account sees only its own epics, tasks, time blocks, and timer — admins additionally see a roll-up dashboard across every user.

> Looking for the engineering side — installation, schema, API, code layout? Head to [`implement/`](./implement/README.md). This document is the **product** description; everything code-shaped lives over there.

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

---

## Design Principles

These five principles are the lens for every product decision. When in doubt, ranking is top-to-bottom.

1. **Local & owned.** Your data lives on your own machine — a database you administer, back up, and dump like any other on your laptop. No cloud, no telemetry, no shared tenants. JSON / CSV / iCal export is one click away in `Settings → Your data`, so taking a snapshot or moving hosts is never blocked on us.
2. **Calm by default.** No badges screaming for attention, no dopamine animations, no notifications you didn't ask for. The tool waits patiently and reports faithfully.
3. **One screen, one job.** Dashboard plans. Epic page contextualizes. Analytics reflects. We resist cramming "everything everywhere."
4. **Keyboard-first.** Every primary action has a shortcut. The mouse is a fallback, not the contract.
5. **Honest math.** Aggregates are always computed, never stored. If two views show different numbers, the tool is broken — not "eventually consistent."

A useful negative principle: **no gamification.** Streaks, points, and combos work against accurate self-knowledge.

---

## Who It's For

| Persona               | What they need                                                                       |
| --------------------- | ------------------------------------------------------------------------------------ |
| **The Maker**         | A weekly canvas for deep work, with honest data on whether estimates match reality. |
| **The Researcher**    | Long-running Epics (months) with many small, mixed tasks underneath.                |
| **The Solo Operator** | Visibility across projects without the ceremony of Jira or Notion databases.        |

Not for: teams, clients, billing, or anything that requires sharing.

---

## Features

Each feature is framed as **what the user accomplishes**, not what the code does.

### Plan the week with Epics

Group related work under a named goal (e.g. *Computer Vision*). The Epic itself stores no hours — its totals are always summed from child tasks, so they can never lie. Deleting an Epic preserves its tasks; they simply become standalone.

### Capture and schedule tasks

Every task carries title, notes, status, due date, estimate, progress, tags — and an array of **time blocks**. A block is one focused session: a date, a start time, an end time, and the hours actually logged. One task can have many blocks across many days, which is how real work actually happens.

### Three calendar lenses

| View    | Purpose                                                            |
| ------- | ------------------------------------------------------------------ |
| Daily   | Today, hour by hour. Drag, resize, click empty space to capture. A live "now" line sweeps across the hour grid with a `HH:mm` badge in the gutter so you always know where you are in the day. |
| Weekly  | The classic 7-column plan; a task's Monday and Friday blocks both appear in their respective columns. Today's column header shows the same live `Now HH:mm` pill. |
| Monthly | Coarse density (dots) + deadline markers; click a day to drill in. |

The "now" indicator ticks every 30 seconds and snaps forward when the tab regains focus, so it stays accurate without burning a render every second.

### Pre-task alerts

Five minutes before every scheduled block (configurable in `Settings → Pre-task alerts`), the app fires a heads-up so you don't crash into the next session unprepared. Two channels, deduped by block id so a single block can never alert twice:

- **In-app toast** — always fires, no browser permission required. Appears in the top of the window with the task title, the time window, a "Starts in N min" hint, and an **Open** action that pops the task modal regardless of which page you're on.
- **Desktop pop-up** — fires *additionally* if you grant the Notification permission. Useful when the tab isn't focused.

In-app toasts are on by default for fresh installs; flip the master switch off in settings if you'd rather not be alerted. The setting persists locally, so an existing user who turned it off stays off after the upgrade.

### Honest analytics

- **Velocity:** estimated vs. actual hours per day / week / month.
- **Completion vs. roll-over:** how often deadlines hold.
- **Epic velocity:** rolled-up estimates vs. spend per project area.
- **Variance:** signed delta per Epic and per tag so you can see where you systematically over- or under-estimate.

---

## Key User Flows

Concrete journeys, each rated by target friction.

### Flow 1 — "Plan tomorrow morning" *(target: ≤ 90 seconds)*

1. Open the app → **Daily** view of tomorrow (`l` then `t` then `→`).
2. From the *Up next* rail, drag two tasks into morning hour slots, or click an empty slot for quick capture.
3. Press `n` for a new task; type "Read MLE paper" + `Enter` (single-line quick capture).
4. Done. No modal traversal required for routine planning.

### Flow 2 — "Log what I just spent" *(target: ≤ 15 seconds)*

1. While in **Daily** view, click the existing block.
2. Inline edit the *Spent (h)* number, or click `auto` to fill from the block's duration.
3. Save — task `spentHours` and parent Epic's `spentHours` recompute and propagate instantly.

### Flow 3 — "Weekly review" *(target: ≤ 5 minutes)*

1. Navigate to **Analytics** with `g a`.
2. Toggle granularity to **week**; scan velocity bars for outliers (red variance > 1.5h).
3. Drill into any Epic via the rollup list; review which tasks rolled over.
4. Optional: bulk re-schedule rolled-over tasks via drag on the weekly canvas.

---

## Data Model Concepts

### Epics vs. Tasks

| Concept       | Role                                                                  |
| ------------- | --------------------------------------------------------------------- |
| **Epic**      | A grouping container with a title, description, status, color, tags.  |
| **Task**      | The unit of work. Belongs to at most one Epic via `epicId`.           |
| Derived hours | Epic totals are **computed**, not stored — always sum from tasks.     |

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

Epics carry an optional `color` (`brand` | `sky` | `emerald` | `amber` | `rose` | `violet` | `slate`). All child task blocks inherit it, so a glance at the weekly view reveals *project mix*, not just *status mix*. Status is encoded with a left edge stripe and an icon, so the two channels never compete.

> For the storage shape behind these concepts — table columns, types, indexes — see [`implement/database.md`](./implement/database.md).

---

## Roles & Permissions

| Role         | Sees                                                          | Can do                                                                  |
| ------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `normal`     | Their own epics, tasks, time blocks, timer.                   | Everything in the app for their own data. Cannot read or modify anyone else's. |
| `admin`      | Everything `normal` sees, plus a system-wide admin dashboard. | Promote/demote other users between `admin` ↔ `normal`, view per-user roll-ups & charts. |
| `superadmin` | Same as `admin`. Exactly one per install — the bootstrap account. | Everything `admin` can. The role is **never assignable through the UI**: it's seeded by `npm run migrate:auth` and cannot be modified or demoted by anyone, so the install always has a break-glass owner that admins can't lock each other out of. |

A normal user's experience is identical to a single-user app; the admin / superadmin roles are the only things that ever surface other accounts. The superadmin is created once at install time (see [`implement/auth.md`](./implement/auth.md) for the seed flow); after that, the superadmin or any admin promotes new admins through the app.

---

## Visual Design System

A small system on purpose. Fewer choices, more consistency.

### Color tokens

| Role             | Token             | Notes                                |
| ---------------- | ----------------- | ------------------------------------ |
| Brand            | `--color-brand-*` | Indigo scale (50–900)                |
| Surface base     | `slate-50`        | Body background                      |
| Surface elevated | `white`           | Cards, modals, calendar cells        |
| Border / hairline| `slate-200`       | Default 1px ring                     |
| Text primary     | `slate-900`       | Body                                 |
| Text secondary   | `slate-500`       | Meta, labels                         |
| Success          | `emerald-500`     | Done status, positive variance       |
| Warning          | `amber-500`       | In-progress                          |
| Danger           | `rose-500`        | Overdue, destructive actions         |

**Epic accent colors:** `sky`, `emerald`, `amber`, `rose`, `violet`, `slate`. Each ships as a pre-resolved Tailwind pair (`bg-*-100 text-*-800`) so accent classes are statically detectable at build time.

**Contrast.** All text/background pairs target WCAG 2.1 AA (4.5:1 for body, 3:1 for ≥18px). Status pills are tested against their own backgrounds, not the page.

### Theming (light & dark)

Three theme modes selectable via the sidebar quick toggle or `Settings → Appearance`:

| Mode       | Behavior                                                                  |
| ---------- | ------------------------------------------------------------------------- |
| **System** | Tracks `prefers-color-scheme`; flips live when the OS preference changes  |
| **Light**  | Forces the light palette                                                  |
| **Dark**   | Forces the dark palette                                                   |

The preference is persisted locally and applied **before any CSS paints**, so dark-OS users opening the app cold see dark mode from the first frame — no flash of light content.

Status and epic colors are *tinted* in dark mode, never inverted — color-coded semantics must survive the swap.

### Typography

| Token   | Size  | Use                                              |
| ------- | ----- | ------------------------------------------------ |
| `xs`    | 11px  | Meta, dot labels, table headers (uppercase)     |
| `sm`    | 13px  | Body, list items, modal fields                  |
| `base`  | 14px  | Default paragraph                                |
| `lg`    | 16px  | Section headings                                 |
| `xl`    | 20px  | Page titles                                      |
| `2xl`   | 24px  | KPI numbers                                      |

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

| Token        | Duration | Easing         | Use                                |
| ------------ | -------- | -------------- | ---------------------------------- |
| `motion-xs`  | 120ms    | ease-out       | Hover, focus rings                 |
| `motion-sm`  | 180ms    | ease-out       | Modal fade, tooltip                |
| `motion-md`  | 240ms    | ease-in-out    | View transitions, drawer slide     |
| `motion-lg`  | 320ms    | ease-in-out    | Layout reflow on view change       |

**`prefers-reduced-motion: reduce`** disables non-essential transitions and replaces slides with instant cross-fades.

---

## Interaction Patterns

### Modal vs. drawer vs. inline

| Context                                  | Pattern              |
| ---------------------------------------- | -------------------- |
| Create / edit a task or epic             | Centered modal       |
| Add a time block to an existing task     | Inline editor inside the modal |
| Quick-capture a task title from anywhere | Single-line command bar |
| Change a task's status                   | Inline dropdown on the row |
| Change a task's date by drag             | Direct manipulation on the calendar |
| Confirm destructive action               | **Undo toast** (5 s) — *not* a blocking dialog, except for Epic delete which has cascading orphan logic |

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
- **Open action.** The toast carries an **Open** button that sets a shared `focusTaskId` and routes to the dashboard; the dashboard watches the signal and pops the task modal so the user lands on the right thing in one tap, regardless of which page they were on.
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

| Surface          | Empty state                                                                 |
| ---------------- | --------------------------------------------------------------------------- |
| Dashboard        | Centered illustration, primary CTA "Create your first task" (`n`), secondary "Load sample data" |
| Epics index      | Same pattern; CTA "Create your first epic"                                  |
| Analytics        | Friendly message: "We'll show velocity after you log a few blocks."         |
| Up next sidebar  | Italic "Nothing scheduled. Create your first task!"                         |
| Calendar day     | Hint cell "Click to plan a block"                                           |

### Loading

- **Skeletons, not spinners.** List rows render as 3 gray pulse blocks; cards as their full layout in `slate-100`.
- Skeletons appear only if the request takes > 200 ms (avoid flash).

### Error

- Non-blocking: a rose banner at the top of the affected pane with a **Retry** button.
- Blocking only for irrecoverable cases (the database is unreachable, the schema is missing) with a clear message pointing the user at their local server / database.

### Conflict / stale data

- Writes are serialized so two near-simultaneous edits can't clobber each other.
- If a task was modified by another tab while the modal was open, save shows: "This task changed on disk. Reload and re-apply your changes?"

### Offline

- The app *is* offline. No spinner ever waits on the network. If the local server stops, the UI surfaces "Server unreachable — your data is safe on disk."

---

## Keyboard Shortcuts

Cross-platform: `Mod` = `Cmd` on macOS, `Ctrl` elsewhere.

### Global

| Shortcut       | Action                                  |
| -------------- | --------------------------------------- |
| `?`            | Show the full shortcuts cheatsheet      |
| `Mod + K`      | Open command palette (jump to anything) |
| `/`            | Focus search                            |
| `n`            | New task (quick capture)                |
| `Shift + N`    | New task (full modal)                   |
| `e`            | New epic                                |
| `g d`          | Go to Dashboard                         |
| `g e`          | Go to Epics                             |
| `g a`          | Go to Analytics                         |

### Calendar

| Shortcut       | Action                              |
| -------------- | ----------------------------------- |
| `1` / `2` / `3`| Daily / Weekly / Monthly view       |
| `t`            | Jump to Today                       |
| `←` / `→`      | Previous / Next period              |
| `Shift + ←/→`  | Jump by month in any view           |

### Calendar (mouse & touch)

| Gesture             | Action                                                 |
| ------------------- | ------------------------------------------------------ |
| Drag block (Daily)  | Move within day, snaps to 15-minute grid               |
| Drag top/bottom edge | Resize block (30-minute minimum)                      |
| Drag block (Weekly) | Move across days (time of day preserved)               |
| Click empty slot    | Open task modal pre-filled with that start time        |

### Lists & rows

| Shortcut       | Action                              |
| -------------- | ----------------------------------- |
| `j` / `k`      | Next / previous row                 |
| `Enter`        | Open selected                       |
| `Space`        | Toggle status                       |
| `Delete`       | Delete with undo toast              |

### Modals & forms

| Shortcut       | Action                              |
| -------------- | ----------------------------------- |
| `Esc`          | Close (with unsaved-changes guard)  |
| `Mod + Enter`  | Save                                |
| `Tab` / `Shift+Tab` | Focus next / previous field    |

---

## Accessibility

Targets, not aspirations. These are required for any PR.

- **WCAG 2.1 AA contrast** for all text and meaningful UI elements.
- **Full keyboard navigation.** Every interactive element reachable without a mouse; visible focus rings; no keyboard traps (modals trap intentionally, with `Esc` to escape).
- **Semantic HTML.** `<button>` for buttons (not divs), `<nav>` for nav, `<main>` for content, headings in order.
- **ARIA, sparingly.** Icon-only buttons get `aria-label`. Live regions announce undo toasts and save confirmations.
- **Reduced motion** — `prefers-reduced-motion: reduce` disables slides, scales, and easing curves; transitions become instant cross-fades.
- **Tap targets** ≥ 44×44 px on touch viewports; the calendar's hour cells expand on coarse pointers.
- **Color is never the only signal.** Status uses color *and* a label *and* a dot. Variance uses color *and* a sign.
- **Skip link** "Skip to main content" appears on Tab from page load.

---

## Responsive Behavior

A productivity tool should be useful on a phone for capture, even if planning happens at a desk.

| Breakpoint     | Layout                                                                 |
| -------------- | ---------------------------------------------------------------------- |
| **< 640px**    | Sidebar collapses to a bottom nav bar. Calendar shows Daily only; Weekly/Monthly disabled with a hint. Modals are full-screen sheets. |
| **640–1024px** | Sidebar becomes a top bar with icons. Weekly view stays but cells shrink and clamp at 2 lines per task. |
| **≥ 1024px**   | Full layout: left sidebar + main + right rail.                         |

**Print:** a print stylesheet renders a clean weekly agenda — sidebar hidden, hour grid black-on-white, no shadows.

---

## Design Decisions Log

A few choices that look opinionated and aren't accidents.

- **Local database, not a cloud service.** Your data stays on-device. The export pipeline (JSON / CSV / iCal) still produces a portable snapshot whenever you want one — the data is no less yours.
- **Aggregates are never stored.** Eliminates an entire class of "the sidebar says 5h but the modal says 6h" bugs.
- **Undo over confirm.** Confirm dialogs train muscle memory to click "OK." Undo is a more honest contract: the action happens, and we trust you to notice if it was wrong.
- **No streaks, no badges.** The whole point is to face accurate numbers. Game mechanics distort them.
- **System fonts only.** A productivity tool shouldn't ever wait on Google Fonts.
- **Skeletons over spinners.** Spinners say "loading"; skeletons say "you're about to see *this much* content," which is calmer.
- **Three views, not five.** Day, Week, Month. We resisted Quarter and Agenda — they're rarely useful and they add UI weight that costs every user every day.
- **In-app alerts only by default; desktop pop-ups are opt-in.** A calm tool doesn't ambush you with OS pop-ups, but a silent calendar is no better than no calendar. The compromise: a non-intrusive in-app toast fires 5 min before each scheduled block by default (no permission prompt, no system surface — only visible when the app is open). Granting browser Notification permission is an explicit upgrade that adds the matching desktop pop-up; the alert is otherwise identical. The whole feature is one toggle in `Settings → Pre-task alerts`.
- **Dark mode is a global override, not per-component variants.** New components inherit dark mode automatically as long as they use the standard color vocabulary; we don't sprinkle `dark:` prefixes through every file.
- **One active timer.** Letting two tasks both report as "in session" makes `spentHours` ambiguous. Single-active is honest, and the start endpoint auto-finalizes the previous one so switching never loses time.

---

## Implementation Documentation

The engineering side of the project lives in [`implement/`](./implement/README.md):

| Topic                                            | Document                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| Install, env vars, dev / prod commands           | [`implement/getting-started.md`](./implement/getting-started.md) |
| Stack, runtime topology, project layout          | [`implement/architecture.md`](./implement/architecture.md)       |
| Database schema (DDL), field references          | [`implement/database.md`](./implement/database.md)               |
| REST endpoints under `/api/*`                    | [`implement/api.md`](./implement/api.md)                         |
| JWT / refresh model, admin seed, email transport | [`implement/auth.md`](./implement/auth.md)                       |
| Original Authentication & RBAC feature spec      | [`implement/auth-rbac.md`](./implement/auth-rbac.md)             |
| Phase-by-phase engineering progress              | [`implement/roadmap.md`](./implement/roadmap.md)                 |

---

## Contributing

This is a personal local tool, but suggestions and improvements are welcome.

1. Fork the repo (if shared).
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "feat: add my feature"`
4. Push and open a pull request.

Please keep all data handling local — no external API calls or cloud storage without discussion. Every PR is expected to honor the [Design Principles](#design-principles), the [Accessibility](#accessibility) targets, and to spec all four [States & Edge Cases](#states--edge-cases) for any new surface.
