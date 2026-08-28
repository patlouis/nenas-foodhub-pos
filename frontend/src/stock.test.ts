import { describe, it, expect } from "vitest"
import { isTracked, isOutOfStock, hasStock, hasStockFor, clampToStock, isUnavailable, stockLabel } from "./stock"

describe("isTracked", () => {
  it("treats null as untracked and any number as tracked", () => {
    expect(isTracked(null)).toBe(false)
    expect(isTracked(0)).toBe(true)
    expect(isTracked(12)).toBe(true)
  })
})

describe("isOutOfStock", () => {
  it("is never true for an untracked item", () => {
    expect(isOutOfStock(null)).toBe(false)
  })

  it("is true at or below zero for a tracked item", () => {
    expect(isOutOfStock(0)).toBe(true)
    expect(isOutOfStock(3)).toBe(false)
  })
})

describe("hasStock", () => {
  it("is true only for a counted item with units left", () => {
    expect(hasStock(null)).toBe(false)
    expect(hasStock(0)).toBe(false)
    expect(hasStock(1)).toBe(true)
  })
})

describe("hasStockFor", () => {
  it("always has room when untracked", () => {
    expect(hasStockFor(null, 1)).toBe(true)
    expect(hasStockFor(null, 999)).toBe(true)
  })

  it("allows taking exactly what is left but no more", () => {
    expect(hasStockFor(5, 4)).toBe(true)
    expect(hasStockFor(5, 5)).toBe(true)
    expect(hasStockFor(5, 6)).toBe(false)
    expect(hasStockFor(0, 1)).toBe(false)
  })
})

describe("clampToStock", () => {
  it("leaves the quantity alone when untracked", () => {
    expect(clampToStock(null, 40)).toBe(40)
  })

  it("caps at what is on hand", () => {
    expect(clampToStock(5, 9)).toBe(5)
    expect(clampToStock(5, 2)).toBe(2)
  })
})

describe("isUnavailable", () => {
  it("is true when disabled, whatever the stock", () => {
    expect(isUnavailable({ stock: 10, status: "disabled" })).toBe(true)
    expect(isUnavailable({ stock: null, status: "disabled" })).toBe(true)
  })

  it("is true when an active item is sold out", () => {
    expect(isUnavailable({ stock: 0, status: "active" })).toBe(true)
  })

  it("is false for an active untracked item, which can never sell out", () => {
    expect(isUnavailable({ stock: null, status: "active" })).toBe(false)
  })

  it("is false for an active item with stock left", () => {
    expect(isUnavailable({ stock: 2, status: "active" })).toBe(false)
  })

  it("treats a missing status as active rather than disabled", () => {
    expect(isUnavailable({ stock: 2 })).toBe(false)
    expect(isUnavailable({ stock: null })).toBe(false)
    expect(isUnavailable({ stock: 0 })).toBe(true)
  })
})

describe("stockLabel", () => {
  it("calls an uncounted item unlimited, matching the inventory badge", () => {
    expect(stockLabel(null)).toBe("Unlimited")
  })

  it("reads out of stock at zero and counts otherwise", () => {
    expect(stockLabel(0)).toBe("Out of stock")
    expect(stockLabel(7)).toBe("7 in stock")
  })
})
