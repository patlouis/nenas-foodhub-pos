// A product's stock is `null` when it isn't counted — cooked meals, rice by
// the cup. They are portioned out of bulk, so a per-item tally means nothing.
//
// Go through these helpers instead of comparing the number directly: to a bare
// `stock <= 0`, "untracked" and "none left" look identical.

export function isTracked(stock: number | null): stock is number {
  return stock !== null
}

export function isOutOfStock(stock: number | null): boolean {
  return isTracked(stock) && stock <= 0
}

// Counted, with units left — the gate for actions that consume stock.
export function hasStock(stock: number | null): stock is number {
  return isTracked(stock) && stock > 0
}

// Whether `qty` units can be taken. Untracked items always have room.
export function hasStockFor(stock: number | null, qty: number): boolean {
  return !isTracked(stock) || qty <= stock
}

// Caps a quantity at what's on hand, leaving it untouched when untracked.
export function clampToStock(stock: number | null, qty: number): number {
  return isTracked(stock) ? Math.min(qty, stock) : qty
}

// Sold out and switched off are different reasons to hide an item; the order
// screen treats them the same, so the combined rule lives here once.
export function isUnavailable(p: { stock: number | null; status?: "active" | "disabled" }): boolean {
  return p.status === "disabled" || isOutOfStock(p.stock)
}

export function stockLabel(stock: number | null): string {
  // "Unlimited" is how the inventory form and badge put it — the tally is what
  // has no limit, not the rice, which does run out.
  if (!isTracked(stock)) return "Unlimited"
  return stock <= 0 ? "Out of stock" : `${stock} in stock`
}
