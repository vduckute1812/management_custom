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

## Out of scope (for now)

Multi-currency / FX, shared wallets, bank sync, OCR, investments.
