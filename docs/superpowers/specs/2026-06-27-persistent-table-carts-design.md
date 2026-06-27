# Persistent Table Carts — Design

**Date:** 2026-06-27
**Status:** Approved

## Summary

Add per-table parked carts to the POS order screen. The cashier can keep up to
six in-progress carts (one per table 1–6) plus a "Takeout" cart, switch between
them freely, and finalize any one into a real order when paid. Carts survive a
page refresh via `localStorage`. The finalized order records the table number so
it shows in Order History and on receipts.

## Decisions (locked)

- **Behavior:** table tabs / parked carts (not just tagging, not single-cart resume).
- **Tabs:** `Takeout` + tables `1`–`6` (7 tabs total).
- **Persistence:** browser `localStorage` only. No server-side open orders.
- **Order record:** finalized orders store an optional `tableNumber` (1–6).
  Takeout and staff meals have no table number.
- **State structure:** extracted `useTableCarts` hook (Approach B).
- **Staff meals:** carry no table number; they remain a takeout-style concept.

## Out of scope (YAGNI)

- Server-side / cross-device open orders.
- Stock reservation while items sit in a parked cart. Stock is still only
  checked and decremented at payment time, exactly as today.
- Per-table payment method (payment method stays ephemeral panel state).
- Sidebar / app-wide cart badges.

## 1. Data model & types

### Backend — `Order` model (`backend/src/models/Order.ts`)

Add one optional field:

```ts
tableNumber?: number; // 1–6; absent = takeout / staff meal
```

Schema: `tableNumber: { type: Number, min: 1, max: 6 }`.

### Backend — orders POST schema

Accept optional `tableNumber: z.number().int().min(1).max(6).optional()`.
The route stores it, but ignores it (stores nothing) when the order is a staff
meal.

### Frontend — `types.ts`

- Add `tableNumber?: number` to the `Order` interface.
- New shared type: `type TableKey = "takeout" | "1" | "2" | "3" | "4" | "5" | "6"`.

### Frontend — `ordersApi.create`

Add a `tableNumber?: number` parameter, sent in the POST body.

## 2. `useTableCarts` hook (core logic)

**Source of truth (persisted):**
`Record<TableKey, { productId: string; quantity: number }[]>`
stored at `localStorage["pos:tableCarts"]`. Storing only IDs + quantities (not
full product snapshots) means prices and stock are never stale — the hook
resolves them against the live `products` list on every render.

**Signature:**

```ts
useTableCarts(products: Product[]): {
  activeTable: TableKey
  setActiveTable(t: TableKey): void
  cart: CartLine[]                       // resolved lines for the active table
  itemCounts: Record<TableKey, number>   // per-tab badge counts
  addToCart(p: Product): void
  setQty(productId: string, qty: number): void
  removeLine(productId: string): void
  clearActive(): void                    // empties the active table's cart
}
```

**Resolution / reconciliation:** to produce `cart`, join each stored
`productId` to its current `Product`. Drop lines whose product was deleted,
disabled, or has 0 stock; clamp quantity to current stock. This keeps every
parked cart valid even after inventory changes made elsewhere.

**Persistence details:**

- Lazy initializer reads `localStorage`, wrapped in `try/catch` (same pattern as
  `auth.tsx` `readStoredUser`). Corrupt data falls back to empty carts.
- A `useEffect` writes the raw carts to `localStorage` whenever they change.
- `activeTable` is also persisted (`localStorage["pos:activeTable"]`) so a
  refresh keeps the cashier on the same tab. Defaults to `"takeout"`.

## 3. OrderPage UI (`frontend/src/pages/OrderPage.tsx`)

- **Tab bar** above the product grid: `Takeout · 1 · 2 · 3 · 4 · 5 · 6`. Each tab
  shows a count badge when its cart has items; the active tab is highlighted.
  Reuse the existing `Chip` visual style.
- **Receipt panel header** shows the active context: "Table 3" or "Takeout".
- `cart`, `addToCart`, `setQty`, `removeLine` come from the hook.
- **Submit flow:** pass `tableNumber` to `ordersApi.create` — derived from
  `activeTable` (`"takeout"` → `undefined`; staff meal → `undefined`). On success,
  call `clearActive()` to empty just that table's cart (replacing the old
  single-cart clear). Payment method and the staff-meal toggle remain ephemeral
  panel state and reset after placing, exactly as today.

## 4. Showing the table number

Render a small `Table N` chip next to the order label in these three places
when `tableNumber` is present:

- The OrderPage **confirm-order modal** (before placing).
- **Order History** list rows.
- The Order History **view-receipt modal**.

Orders without a table number (takeout, staff meal, legacy orders) show no chip.

## 5. Error handling

- Placing a table order when stock changed underneath: unchanged from today —
  the server validates by `productId` at creation and rejects with a clear
  message; the menu refetches. The hook's reconciliation also keeps the visible
  cart in sync with current stock before submit.
- Corrupt `localStorage`: caught and treated as empty carts.
- A parked cart whose products all became unavailable resolves to an empty cart;
  the tab badge disappears.

## 6. Testing

- **Backend:** extend the orders route tests — order accepts and stores
  `tableNumber`; rejects out-of-range values (0, 7); a staff-meal order ignores a
  supplied `tableNumber`.
- **Frontend:** keep the hook pure/isolated so its reconciliation and
  persistence logic is unit-testable. Add tests if a frontend test harness
  exists (confirm during planning); otherwise rely on the backend tests plus
  manual verification of the tab flow.
