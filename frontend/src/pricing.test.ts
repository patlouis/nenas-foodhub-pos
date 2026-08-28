import { describe, it, expect } from "vitest"
import { getLineTotal, getFeeTotal, type Portion, type Priceable } from "./pricing"
import sharedCases from "../../pricing-cases.json"

// Shared with backend/src/lib/pricing.test.ts. The two implementations are
// hand-mirrored, so this is the only thing that forces them to agree.
type SharedCase = { name: string; product: Priceable; qty: number; portion: Portion | null; expected: number }
type FeeCase = { name: string; fee: number | null; qty: number; expected: number }
const shared = sharedCases as unknown as { cases: SharedCase[]; feeCases: FeeCase[] }

describe("getLineTotal — shared truth table", () => {
  for (const c of shared.cases) {
    it(c.name, () => {
      const actual = c.portion === null
        ? getLineTotal(c.product, c.qty)
        : getLineTotal(c.product, c.qty, c.portion)
      expect(actual).toBe(c.expected)
    })
  }
})

describe("getLineTotal", () => {
  it("charges plain unit price when there is no discount configured", () => {
    expect(getLineTotal({ price: 50 }, 3)).toBe(150)
  })

  it("charges plain unit price when quantity is below the discount threshold", () => {
    const product = { price: 50, discountQty: 3, discountPrice: 120 }
    expect(getLineTotal(product, 2)).toBe(100)
  })

  it("applies the discount price for exactly one discounted set", () => {
    const product = { price: 50, discountQty: 3, discountPrice: 120 }
    expect(getLineTotal(product, 3)).toBe(120)
  })

  it("applies the discount to full sets and charges full price for the remainder", () => {
    const product = { price: 50, discountQty: 3, discountPrice: 120 }
    // 7 units = 2 discounted sets (6 units @ 120 each) + 1 unit @ 50
    expect(getLineTotal(product, 7)).toBe(2 * 120 + 50)
  })

  it("prices a half portion from halfPrice, not half of price", () => {
    expect(getLineTotal({ price: 60, halfPrice: 35 }, 2, "half")).toBe(70)
  })

  it("never applies the bulk deal to half portions", () => {
    const product = { price: 60, halfPrice: 35, discountQty: 3, discountPrice: 150 }
    expect(getLineTotal(product, 3, "half")).toBe(105)
    expect(getLineTotal(product, 3)).toBe(150)
  })

  it("charges the full price rather than nothing when halfPrice is missing", () => {
    expect(getLineTotal({ price: 60 }, 1, "half")).toBe(60)
  })

  it("ignores a discountQty below 2 (treated as not a real discount)", () => {
    const product = { price: 50, discountQty: 1, discountPrice: 10 }
    expect(getLineTotal(product, 5)).toBe(250)
  })

  it("ignores a discount with no discountPrice set", () => {
    const product = { price: 50, discountQty: 3, discountPrice: null }
    expect(getLineTotal(product, 6)).toBe(300)
  })
})

describe("getFeeTotal — shared truth table", () => {
  for (const c of shared.feeCases) {
    it(c.name, () => {
      expect(getFeeTotal(c.fee, c.qty)).toBe(c.expected)
    })
  }

  it("treats an absent fee the same as none", () => {
    expect(getFeeTotal(undefined, 3)).toBe(0)
  })
})
