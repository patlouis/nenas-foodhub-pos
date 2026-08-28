export type Portion = "full" | "half"

export interface Priceable {
  price: number
  halfPrice?: number | null
  discountQty?: number | null
  discountPrice?: number | null
}

// Returns the correct total for qty units of product p, applying the
// quantity discount if qty reaches the threshold. Half servings price from
// halfPrice and never take the bulk deal. Mirrors the backend's
// computeLineTotal (backend/src/lib/pricing.ts) — the server is the source of
// truth for what's actually charged, this just lets the cart preview it.
export function getLineTotal(p: Priceable, qty: number, portion: Portion = "full"): number {
  if (portion === "half") {
    return qty * (p.halfPrice ?? p.price)
  }
  if (p.discountQty && p.discountQty >= 2 && p.discountPrice != null && qty >= p.discountQty) {
    const sets = Math.floor(qty / p.discountQty)
    const remainder = qty % p.discountQty
    return sets * p.discountPrice + remainder * p.price
  }
  return qty * p.price
}

// Mirrors the backend's computeFeeTotal (backend/src/lib/pricing.ts). Charged
// per unit — each serving gets its own hot water — and never discounted.
export function getFeeTotal(fee: number | null | undefined, qty: number): number {
  return fee == null ? 0 : fee * qty
}
