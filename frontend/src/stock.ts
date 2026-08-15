// A product's stock is `null` when it isn't counted — cooked meals, rice by
// the cup. Their real limit lives in Supplies, not a per-item tally.
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
  // Not "Unlimited": rice runs out, we just aren't counting it here.
  if (!isTracked(stock)) return "Not tracked"
  return stock <= 0 ? "Out of stock" : `${stock} in stock`
}
