// Returns the correct total for qty units of product p, applying the
// quantity discount if qty reaches the threshold.
export function computeLineTotal(p, qty) {
    if (p.discountQty != null && p.discountQty >= 2 && p.discountPrice != null && qty >= p.discountQty) {
        const sets = Math.floor(qty / p.discountQty);
        const remainder = qty % p.discountQty;
        return sets * p.discountPrice + remainder * p.price;
    }
    return qty * p.price;
}
