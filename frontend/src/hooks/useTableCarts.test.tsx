// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useTableCarts } from "./useTableCarts"
import type { Product } from "../types"

function product(overrides: Partial<Product> = {}): Product {
  return {
    _id: "p1",
    name: "Adobong Manok",
    price: 60,
    halfPrice: 35,
    stock: null,
    status: "active",
    costPrice: null,
    discountQty: null,
    discountPrice: null,
    ...overrides,
  }
}

beforeEach(() => localStorage.clear())

describe("useTableCarts — portions", () => {
  it("keeps a full and a half of the same dish on separate lines", () => {
    const p = product()
    const { result } = renderHook(() => useTableCarts([p]))

    act(() => result.current.addToCart(p, "full"))
    act(() => result.current.addToCart(p, "half"))

    expect(result.current.cart).toHaveLength(2)
    expect(result.current.cart.map((l) => l.portion).sort()).toEqual(["full", "half"])
  })

  it("merges repeat taps of the same dish and portion", () => {
    const p = product()
    const { result } = renderHook(() => useTableCarts([p]))

    act(() => result.current.addToCart(p, "half"))
    act(() => result.current.addToCart(p, "half"))

    expect(result.current.cart).toHaveLength(1)
    expect(result.current.cart[0].quantity).toBe(2)
  })

  it("changes quantity on one portion without touching the other", () => {
    const p = product()
    const { result } = renderHook(() => useTableCarts([p]))

    act(() => result.current.addToCart(p, "full"))
    act(() => result.current.addToCart(p, "half"))
    const half = result.current.cart.find((l) => l.portion === "half")!
    act(() => result.current.setQty(half, 5))

    const byPortion = Object.fromEntries(result.current.cart.map((l) => [l.portion, l.quantity]))
    expect(byPortion).toEqual({ full: 1, half: 5 })
  })

  it("removes only the portion asked for", () => {
    const p = product()
    const { result } = renderHook(() => useTableCarts([p]))

    act(() => result.current.addToCart(p, "full"))
    act(() => result.current.addToCart(p, "half"))
    const half = result.current.cart.find((l) => l.portion === "half")!
    act(() => result.current.removeLine(half))

    expect(result.current.cart).toHaveLength(1)
    expect(result.current.cart[0].portion).toBe("full")
  })

  it("drops a parked half line when the dish stops offering one", () => {
    const p = product()
    const { result, rerender } = renderHook(({ products }) => useTableCarts(products), {
      initialProps: { products: [p] },
    })

    act(() => result.current.addToCart(p, "half"))
    act(() => result.current.addToCart(p, "full"))
    expect(result.current.cart).toHaveLength(2)

    // Half price removed in the catalog — the half line can no longer be priced.
    rerender({ products: [product({ halfPrice: null })] })

    expect(result.current.cart).toHaveLength(1)
    expect(result.current.cart[0].portion).toBe("full")
  })

  it("reads carts parked before portions existed as full servings", () => {
    localStorage.setItem(
      "pos:tableCarts",
      JSON.stringify({ order: [{ productId: "p1", quantity: 2 }] }),
    )
    const { result } = renderHook(() => useTableCarts([product()]))

    expect(result.current.cart).toHaveLength(1)
    expect(result.current.cart[0].portion).toBe("full")
    expect(result.current.cart[0].quantity).toBe(2)
  })
})
