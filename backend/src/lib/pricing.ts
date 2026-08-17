export type Portion = "full" | "half";

export interface Priceable {
  price: number;
  halfPrice?: number | null;
  discountQty?: number | null;
  discountPrice?: number | null;
}

// Returns the correct total for qty units of product p, applying the
// quantity discount if qty reaches the threshold.
//
// Half servings price from halfPrice and never take the bulk deal — that deal
// is configured against full servings. A missing halfPrice falls back to the
// full price: wrong, but an overcharge rather than a free meal. The order
// route rejects half lines for products that don't offer one, so this is only
// a backstop.
export function computeLineTotal(p: Priceable, qty: number, portion: Portion = "full"): number {
  if (portion === "half") {
    return qty * (p.halfPrice ?? p.price);
  }
  if (p.discountQty != null && p.discountQty >= 2 && p.discountPrice != null && qty >= p.discountQty) {
    const sets = Math.floor(qty / p.discountQty);
    const remainder = qty % p.discountQty;
    return sets * p.discountPrice + remainder * p.price;
  }
  return qty * p.price;
}
