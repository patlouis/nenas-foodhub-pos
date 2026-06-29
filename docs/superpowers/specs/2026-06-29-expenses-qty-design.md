# Expenses — Optional Quantity Field Design

**Date:** 2026-06-29

## Goal

Add an optional `qty` field to the Expenses feature so admins can record how many units an expense covers (e.g. 3 bags of supplies, 2 months rent, 5 staff paid). Quantity is informational only — it does not affect the `amount` field, which remains the single source of truth for money.

## Decisions

- **Type:** positive decimal (`Number`, min > 0 if provided) — not integer-only, to support fractional quantities (1.5 kg, 0.5 months)
- **Required:** no — optional on all layers
- **Drives amount:** no — amount is entered independently
- **Unit label:** not included in this pass — plain number only

## Changes

### Backend

**`backend/src/models/Expense.ts`**
- Add `qty?: number` to `IExpense` interface
- Add `qty: { type: Number, min: 0.01 }` to schema (no `required`)

**`backend/src/schemas/expenses.ts`**
- Add `qty: z.number().min(0.01, "Quantity must be at least 0.01").optional()` to `createExpenseSchema` (matches Mongoose `min: 0.01` exactly)

**`backend/src/routes/expenses.ts`**
- Destructure `qty` from `req.body` in POST handler and pass it to `Expense.create`

**`backend/src/routes/expenses.test.ts`**
- Add one test: create expense with `qty: 3`, verify response includes `qty: 3`
- Add one test: create expense without `qty`, verify response has no `qty` field (or `undefined`)

### Frontend

**`frontend/src/types/expense.ts`**
- Add `qty?: number` to `Expense` interface

**`frontend/src/api.ts`**
- Add `qty?: number` to the `create` params object in `expensesApi`

**`frontend/src/pages/ExpensesPage.tsx`**
- Add `addQty` state (`string`, empty = omitted)
- Add Qty input in Add modal: `type="number"`, `min="0.01"`, `step="any"`, optional, placed between Amount and Date
- On submit: parse `addQty` to number only if non-empty; pass as `qty` to `expensesApi.create`
- Reset `addQty` to `""` when modal opens
- Desktop table: add "Qty" column after Category, display `exp.qty ?? "—"`
- Mobile cards: show `Qty: {exp.qty}` inline if `exp.qty` is defined

## Modal Field Order (after change)

Category → Amount (₱) → Qty (optional) → Date → Note (optional)

## Display

- Desktop table columns: Date | Category | Qty | Note | Amount | (void button)
- Mobile card: amount, date, category badge, qty (if present), note (if present), void button
- Qty shown as plain number (e.g. `3`, `1.5`) — no unit label

## Out of Scope

- Unit label field (e.g. "bags", "hours")
- Qty × unit price auto-calculation
- Qty filtering or sorting
