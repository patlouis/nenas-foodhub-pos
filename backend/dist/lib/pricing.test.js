import { describe, it, expect } from "vitest";
import { computeLineTotal } from "./pricing.js";
describe("computeLineTotal", () => {
    it("charges plain unit price when there is no discount configured", () => {
        expect(computeLineTotal({ price: 50 }, 3)).toBe(150);
    });
    it("charges plain unit price when quantity is below the discount threshold", () => {
        const product = { price: 50, discountQty: 3, discountPrice: 120 };
        expect(computeLineTotal(product, 2)).toBe(100);
    });
    it("applies the discount price for exactly one discounted set", () => {
        const product = { price: 50, discountQty: 3, discountPrice: 120 };
        expect(computeLineTotal(product, 3)).toBe(120);
    });
    it("applies the discount to full sets and charges full price for the remainder", () => {
        const product = { price: 50, discountQty: 3, discountPrice: 120 };
        // 7 units = 2 discounted sets (6 units @ 120 each) + 1 unit @ 50
        expect(computeLineTotal(product, 7)).toBe(2 * 120 + 50);
    });
    it("ignores a discountQty below 2 (treated as not a real discount)", () => {
        const product = { price: 50, discountQty: 1, discountPrice: 10 };
        expect(computeLineTotal(product, 5)).toBe(250);
    });
    it("ignores a discount with no discountPrice set", () => {
        const product = { price: 50, discountQty: 3, discountPrice: null };
        expect(computeLineTotal(product, 6)).toBe(300);
    });
});
