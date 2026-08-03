# Money — expense ledger & savings

As-built / target spec for the **Money** module (`/money`). Sprint 0–1 ships
the ledger; later sprints add savings goals and budgets.

## Product shape

- Top-level module (header nav), auth-required, **per-user** data (same
  isolation model as tasks/epics).
- Install currency for v1: **VND**. Amounts are integer **minor units**
  (đồng). No fractional VND in storage or on the wire.
- UI language follows app i18n (`en` / `vi` / `zh-CN` / `zh-TW`); currency
  formatting is always VND.

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

## Out of scope (for now)

Multi-currency / FX, shared wallets, bank sync, OCR, investments.
