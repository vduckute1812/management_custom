# Money — expense ledger, budgets & savings

As-built spec for the **Money** module (`/money`, `/money/budgets`, `/money/savings`).
The ledger, monthly budgets, savings goals, and user categories all ship.

## Product shape

- Top-level module (header nav), auth-required, **per-user** data (same
  isolation model as tasks/epics).
- Per-user display currency (`MoneyCurrency` TINYINT on `users.money_currency`):
  **VND=0**, **USD=1**, **CNY=2**, **TWD=3**. Defaults from signup locale
  (`vi→VND`, `en→USD`, `zh-CN→CNY`, `zh-TW→TWD`); user may change in Settings.
- Amounts are integer **minor units** (đồng for VND, cents for USD/CNY/TWD).
  Changing currency does **not** convert historical amounts.
- UI language follows app i18n; Money formatting uses the account currency.

## Integer enums

| Const            | Values                                       |
| ---------------- | -------------------------------------------- |
| `MoneyDirection` | `Out=0`, `In=1`                              |
| `MoneyCategory`  | `Food=0` … `Other=10` (see `types/money.ts`) |

Never store category/direction as strings.

## Tables

### `money_transactions` (Sprint 1)

| Column                      | Type                | Notes               |
| --------------------------- | ------------------- | ------------------- |
| `id`                        | `VARCHAR(64)`       | `mtx_<hex>`         |
| `user_id`                   | `VARCHAR(64)`       | FK → users, CASCADE |
| `occurred_on`               | `DATE`              | Calendar day        |
| `amount_minor`              | `BIGINT`            | ≥ 0                 |
| `direction`                 | `TINYINT UNSIGNED`  | Out / In            |
| `category`                  | `TINYINT UNSIGNED`  | Built-in enum       |
| `note`                      | `VARCHAR(500)` NULL |                     |
| `created_at` / `updated_at` | `DATETIME(3)`       |                     |

## API (Sprint 1)

| Method   | Path                          | Body / query                                                                             |
| -------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| `GET`    | `/api/money/transactions`     | `yearMonth=YYYY-MM` (default: current local calendar month) → `{ transactions, totals }` |
| `POST`   | `/api/money/transactions`     | Upsert `{ id?, occurredOn, amountMinor, direction, category, note? }`                    |
| `DELETE` | `/api/money/transactions/:id` | Ownership 404                                                                            |

Cross-user ids → **404** (not 403).

## Sprint roadmap

| Sprint | Scope                                          |
| ------ | ---------------------------------------------- |
| 0      | Spec, nav, `/money` shell                      |
| 1      | Ledger CRUD + month totals + categories (enum) |
| 2      | Category UX polish + dashboard charts          |
| 3      | Savings goals + contributions                  |
| 4      | Monthly budgets                                |
| 5      | Harden (tests, export, docs polish)            |

## Sprint 2 (as-built)

Client-only polish on the month view (no new tables):

- Category color swatches + chip picker in the transaction modal
- Direction ↔ category coercion (`Income` vs expense defaults)
- Filters: All / Expense / Income + category chips (chart row click filters)
- Charts (Chart.js, lazy): doughnut spending-by-category + daily expense bars
- Aggregations: `sumByCategory` / `sumDaily` in `utils/money.ts`

## Sprint 3 (as-built)

Savings goals + contributions (migration `0025_money_savings`):

| Const                    | Values                                  |
| ------------------------ | --------------------------------------- |
| `MoneySavingsGoalStatus` | `Active=0`, `Completed=1`, `Archived=2` |

| Table                         | Notes                                                 |
| ----------------------------- | ----------------------------------------------------- |
| `money_savings_goals`         | `msg_*`, target BIGINT, optional `target_date`        |
| `money_savings_contributions` | `msc_*`, deposits only (`amount_minor` ≥ 1 on create) |

| Method     | Path                                         |
| ---------- | -------------------------------------------- |
| `GET/POST` | `/api/money/savings/goals`                   |
| `DELETE`   | `/api/money/savings/goals/:id`               |
| `GET/POST` | `/api/money/savings/goals/:id/contributions` |
| `DELETE`   | `/api/money/savings/contributions/:id`       |

UI: `/money/savings` — goal cards with progress bars, contribute modal, history expand. Reaching target while **Active** auto-sets **Completed**.

## Sprint 4 (as-built)

Monthly budgets (migration `0026_money_budgets`):

| Const              | Values                    |
| ------------------ | ------------------------- |
| `MoneyBudgetScope` | `Overall=0`, `Category=1` |

| Table           | Notes                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------- |
| `money_budgets` | `mbd_*`; unique slot `(user, budget_ym, scope, category)`; spent derived from ledger Out |

| Method     | Path                      |
| ---------- | ------------------------- |
| `GET/POST` | `/api/money/budgets`      |
| `DELETE`   | `/api/money/budgets/:id`  |
| `POST`     | `/api/money/budgets/copy` |

UI: `/money/budgets` — month navigator, overall/category limits vs spent, copy previous month.

## Sprint 5 (as-built)

Harden — client export + tests (no new tables/API):

- Pure builders in `utils/moneyExport.ts` (CSV escaping, integer enums + human labels)
- `useMoneyExport` + `MoneyExportMenu` on Ledger / Savings / Budgets (current view data)
- Vitest coverage for export builders alongside schemas/helpers in `tests/money.test.ts`
- i18n: `money.export.*`, `toasts.moneyExported` (en / vi / zh-CN / zh-TW)

## Client performance (Sprint C)

- `LazyMoneyCharts` + lazy money modals; layout uses `LazyCommandPalette` / `LazyShortcutsHelp`
- Charts: fingerprint watch + `chart.update()` (no deep destroy/recreate)
- `saveTransaction` / `deleteTransaction` patch the in-memory month list via `computeMonthTotals` / `upsertTransactionInMonth` (no full `fetchMonth()` after each edit)

## Custom categories + dropdown (as-built)

- Built-ins keep `MoneyCategory` ints + UI emoji map (`MONEY_CATEGORY_EMOJI`, e.g. Transport ⛽)
- User categories: migration `0027_money_user_categories` (`mcat_*`); open-ended name/emoji/color; `direction` int enum
- Ledger/budgets: exactly one of `category` (builtin) or `user_category_id` (custom)
- `MoneyCategorySelect`: teleported list opens **below** the trigger; create-category form in the menu
- API: `GET/POST /api/money/categories`, `DELETE /api/money/categories/:id` (archive)

## Out of scope (for now)

FX conversion / multi-wallet, shared wallets, bank sync, OCR, investments.
