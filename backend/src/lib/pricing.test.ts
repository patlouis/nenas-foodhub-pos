import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { computeLineTotal, type Portion, type Priceable } from "./pricing.js";

// Shared with frontend/src/pricing.test.ts. The two implementations are
// hand-mirrored, so this is the only thing that forces them to agree.
type SharedCase = { name: string; product: Priceable; qty: number; portion: Portion | null; expected: number };
const shared = JSON.parse(
  readFileSync(new URL("../../../pricing-cases.json", import.meta.url), "utf8"),
) as { cases: SharedCase[] };

describe("computeLineTotal — shared truth table", () => {
  for (const c of shared.cases) {
    it(c.name, () => {
      const actual = c.portion === null
        ? computeLineTotal(c.product, c.qty)
        : computeLineTotal(c.product, c.qty, c.portion);
      expect(actual).toBe(c.expected);
    });
  }
});

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

describe("computeLineTotal — half portions", () => {
  it("prices a half portion from halfPrice, not half of price", () => {
    // 35 rather than 30: halves carry the same fixed costs as a full serving.
    expect(computeLineTotal({ price: 60, halfPrice: 35 }, 2, "half")).toBe(70);
  });

  it("never applies the bulk deal to half portions", () => {
    const product = { price: 60, halfPrice: 35, discountQty: 3, discountPrice: 150 };
    expect(computeLineTotal(product, 3, "half")).toBe(105);
  });

  it("still applies the bulk deal to full portions of the same product", () => {
    const product = { price: 60, halfPrice: 35, discountQty: 3, discountPrice: 150 };
    expect(computeLineTotal(product, 3)).toBe(150);
  });

  it("charges the full price rather than nothing when halfPrice is missing", () => {
    expect(computeLineTotal({ price: 60 }, 1, "half")).toBe(60);
  });

  it("treats an omitted portion as full", () => {
    expect(computeLineTotal({ price: 60, halfPrice: 35 }, 2)).toBe(120);
  });
});
