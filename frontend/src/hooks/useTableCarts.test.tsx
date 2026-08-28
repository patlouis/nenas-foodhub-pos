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

describe("useTableCarts — add-on fees", () => {
  const noodles = () =>
    product({ _id: "n1", name: "Instant noodles", price: 20, halfPrice: null, feeLabel: "Hot water", feeAmount: 5 })

  it("keeps a serving with the add-on apart from one without", () => {
    const p = noodles()
    const { result } = renderHook(() => useTableCarts([p]))

    act(() => result.current.addToCart(p, "full", 5))
    act(() => result.current.addToCart(p, "full"))

    // Merging these would charge one cup of water for two servings.
    expect(result.current.cart).toHaveLength(2)
    expect(result.current.cart.map((l) => l.fee).sort()).toEqual([5, null])
  })

  it("merges repeat taps that carry the same rate", () => {
    const p = noodles()
    const { result } = renderHook(() => useTableCarts([p]))

    act(() => result.current.addToCart(p, "full", 5))
    act(() => result.current.addToCart(p, "full", 5))

    expect(result.current.cart).toHaveLength(1)
    expect(result.current.cart[0].quantity).toBe(2)
  })

  it("re-rates a line without disturbing its quantity", () => {
    const p = noodles()
    const { result } = renderHook(() => useTableCarts([p]))

    act(() => result.current.addToCart(p, "full", 5))
    act(() => result.current.addToCart(p, "full", 5))
    act(() => result.current.setLineFee(result.current.cart[0], 3))

    expect(result.current.cart).toHaveLength(1)
    expect(result.current.cart[0].fee).toBe(3)
    expect(result.current.cart[0].quantity).toBe(2)
  })

  it("survives being re-rated to the value it already has", () => {
    const p = noodles()
    const { result } = renderHook(() => useTableCarts([p]))

    act(() => result.current.addToCart(p, "full", 5))
    // Clearing the cart's fee box re-commits the same number. Treating that as
    // a merge made the line absorb itself and vanish mid-edit.
    act(() => result.current.setLineFee(result.current.cart[0], 5))

    expect(result.current.cart).toHaveLength(1)
    expect(result.current.cart[0].fee).toBe(5)
    expect(result.current.cart[0].quantity).toBe(1)
  })

  it("absorbs a re-rated line into one already at that rate", () => {
    const p = noodles()
    const { result } = renderHook(() => useTableCarts([p]))

    act(() => result.current.addToCart(p, "full", 5))
    act(() => result.current.addToCart(p, "full", 3))
    // Editing the ₱5 line down to ₱3 must not leave the same thing twice.
    act(() => result.current.setLineFee(result.current.cart.find((l) => l.fee === 5)!, 3))

    expect(result.current.cart).toHaveLength(1)
    expect(result.current.cart[0].fee).toBe(3)
    expect(result.current.cart[0].quantity).toBe(2)
  })

  it("drops a parked fee when the product stops offering one", () => {
    const p = noodles()
    const { result, rerender } = renderHook(({ products }) => useTableCarts(products), {
      initialProps: { products: [p] },
    })

    act(() => result.current.addToCart(p, "full", 5))
    rerender({ products: [product({ _id: "n1", name: "Instant noodles", price: 20, halfPrice: null })] })

    // The line survives — only the charge that no longer exists is dropped.
    expect(result.current.cart).toHaveLength(1)
    expect(result.current.cart[0].fee).toBeNull()
  })
})
