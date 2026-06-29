# Expenses Feature Design

**Date:** 2026-06-29
**Status:** Approved

## Overview

Add an Expenses tab to the POS system so admin staff can log operational costs (rent, utilities, salaries, etc.) and track them over time. Expenses total replaces the Orders KPI card on the dashboard.

## Data Model

New MongoDB collection: `expenses`

| Field | Type | Required | Notes |
|---|---|---|---|
| `amount` | Number | Yes | Must be > 0 |
| `category` | Enum | Yes | `rent` \| `utilities` \| `salaries` \| `supplies` \| `repairs` \| `other` |
| `note` | String | No | Free-text description, max 200 chars |
| `date` | Date | Yes | The expense date; defaults to today, can be backdated |
| `loggedBy` | ObjectId | Yes | Ref to User |
| `loggedByName` | String | Yes | Snapshot of user name at log time |
| `voided` | Boolean | Yes | Default false |
| `voidedAt` | Date | No | Set when voided |
| `voidedBy` | ObjectId | No | Ref to User who voided |
| `voidedByName` | String | No | Snapshot of voiding user name |
| `createdAt` | Date | Auto | Mongoose timestamps |

Categories are hardcoded in both frontend and backend — no management UI needed.

## Backend

Three endpoints, all `requireAuth + requireAdmin`:

### `GET /api/expenses`
Paginated list. Query params:
- `page`, `limit` — pagination
- `from`, `to` — ISO date strings, filters on `date` field
- `category` — filters by category enum value
- `q` — searches `note` field (regex, case-insensitive)
- `sortKey` — `date` | `amount` | `category` | `createdAt` (default: `date`)
- `sortDir` — `asc` | `desc` (default: `desc`)

Response: standard paginated envelope + `totalAmount` aggregate (sum of non-voided expenses in the filtered window).

### `POST /api/expenses`
Body: `{ amount, category, note?, date? }`
- Validated with Zod schema
- `date` defaults to `new Date()` if omitted
- `loggedBy` / `loggedByName` set from `req.user`

### `PATCH /api/expenses/:id/void`
- Checks not already voided
- Sets `voided: true`, `voidedAt`, `voidedBy`, `voidedByName`
- No stock side-effect (expenses have no inventory impact)

## Frontend: Expenses Page

New file: `frontend/src/pages/ExpensesPage.tsx`

Structure mirrors `InventoryLogPage.tsx` exactly:

**Toolbar:**
- Search box (searches note field)
- Date mode pills: All / Day / Week / Month + date picker input
- Category filter dropdown: All categories / Rent / Utilities / Salaries / Supplies / Repairs / Other

**Summary banner:** shows total expenses for the active filter (always visible when records exist, not just when filtering by category — unlike inventory log's wastage-only banner).

**Desktop table columns:** Date · Category · Note · Amount · (void button)

**Mobile card:** Category badge + amount prominent, note below, date and void button at bottom.

**Category badges:** color-coded pills (same style as Type badges in inventory log):
- Rent → blue
- Utilities → yellow
- Salaries → purple
- Supplies → green
- Repairs → orange
- Other → gray

**Add Expense button** in the page header (admin only) — opens a modal with: Category (select), Note (textarea, optional), Amount (number input), Date (date input, defaults to today).

**Void modal:** same pattern as inventory log — confirm dialog, shows amount + category, no stock message needed.

**Sorting:** all columns sortable via `SortTh`, same as inventory log.

**Pagination:** standard `Paginator` component.

## Frontend: Dashboard

Replace the "Orders" `KpiCard` (which shows order count) with a "Expenses" card showing total non-voided expenses for the selected period.

The dashboard already fetches stock adjustments for the period. Add a parallel `expensesApi.list({ from, to, limit: 1000 })` call and sum `totalAmount` from the response. Use `"all"` date mode to show all-time total when no period is selected.

The trend percentage (vs previous period) follows the same `fmtPct` pattern used by Revenue and Profit cards.

## Frontend: Sidebar & Routing

**Sidebar:** Add `"expenses"` page entry between `"inventory-log"` and `"users"`, admin only.

```
{ id: "expenses", label: "Expenses", Icon: ExpensesIcon, adminOnly: true }
```

Icon: a receipt/dollar-sign SVG consistent with existing sidebar icons.

**App.tsx:** Add `"expenses"` to `Page` union type, `ADMIN_ONLY` array, and render `<ExpensesPage />` when active.

**Sidebar.tsx:** Add `"expenses"` to the `Page` type export.

## API Client

New `expensesApi` in `frontend/src/api.ts`:
- `list(params)` → paginated expenses + totalAmount
- `create(data)` → Expense
- `void(id)` → Expense

New `Expense` type in `frontend/src/types/`.

## Access Control

All expense operations are admin-only — both backend middleware and frontend page guard (`user.role === "admin"`).

## Files Touched

**New files:**
- `backend/src/models/Expense.ts`
- `backend/src/schemas/expenses.ts`
- `backend/src/routes/expenses.ts`
- `backend/src/routes/expenses.test.ts`
- `frontend/src/pages/ExpensesPage.tsx`
- `frontend/src/types/expense.ts`

**Modified files:**
- `backend/src/app.ts` — register `/api/expenses` router
- `frontend/src/api.ts` — add `expensesApi`
- `frontend/src/types/index.ts` (or barrel) — export `Expense` type
- `frontend/src/components/Sidebar.tsx` — add Expenses nav item + icon
- `frontend/src/App.tsx` — add page routing
- `frontend/src/pages/DashboardPage.tsx` — replace Orders KPI with Expenses
