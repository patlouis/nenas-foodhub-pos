import { describe, it, expect } from "vitest"
import { getChange } from "./tender"

describe("getChange", () => {
  it("returns null when nothing has been typed yet", () => {
    expect(getChange("", 220)).toBeNull()
    expect(getChange("   ", 220)).toBeNull()
  })

  it("returns null for input that isn't a usable number", () => {
    expect(getChange("abc", 220)).toBeNull()
    expect(getChange("-5", 220)).toBeNull()
  })

  it("returns the change owed when the customer overpays", () => {
    expect(getChange("500", 220)).toBe(280)
  })

  it("returns zero on exact payment", () => {
    expect(getChange("220", 220)).toBe(0)
  })

  it("returns a negative amount when the customer is short", () => {
    expect(getChange("200", 220)).toBe(-20)
  })

  it("handles a zero tender as a real entry, not a blank one", () => {
    expect(getChange("0", 220)).toBe(-220)
  })

  it("keeps centavo amounts accurate to two decimals", () => {
    expect(getChange("500", 220.5)).toBeCloseTo(279.5, 2)
  })
})
