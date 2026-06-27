import { useCallback, useEffect, useMemo, useState } from "react"
import type { Product, TableKey } from "../types"
import { TABLE_KEYS } from "../types"

export type CartLine = { product: Product; quantity: number }

// The persisted source of truth holds only ids + quantities, never product
// snapshots, so prices and stock can't go stale — they're resolved against the
// live catalog on every render.
type RawLine = { productId: string; quantity: number }
type RawCarts = Record<TableKey, RawLine[]>

const CARTS_KEY = "pos:tableCarts"
const ACTIVE_KEY = "pos:activeTable"

function emptyCarts(): RawCarts {
  return { order: [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [] }
}

function readCarts(): RawCarts {
  try {
    const raw = localStorage.getItem(CARTS_KEY)
    if (!raw) return emptyCarts()
    const parsed = JSON.parse(raw) as Partial<RawCarts>
    const base = emptyCarts()
    for (const key of TABLE_KEYS) {
      const lines = parsed[key]
      if (Array.isArray(lines)) {
        base[key] = lines
          .filter(
            (l): l is RawLine =>
              !!l && typeof l.productId === "string" && typeof l.quantity === "number" && l.quantity > 0,
          )
          .map((l) => ({ productId: l.productId, quantity: l.quantity }))
      }
    }
    return base
  } catch {
    return emptyCarts()
  }
}

function readActive(): TableKey {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY)
    if (raw && (TABLE_KEYS as string[]).includes(raw)) return raw as TableKey
  } catch {
    // ignore corrupt storage
  }
  return "order"
}

/**
 * Owns the per-table parked carts. Source of truth is persisted to localStorage
 * (ids + quantities only); the resolved `cart` for the active table is derived
 * against the live `products` list so it always reflects current price/stock.
 */
export function useTableCarts(products: Product[]) {
  const [rawCarts, setRawCarts] = useState<RawCarts>(readCarts)
  const [activeTable, setActiveTable] = useState<TableKey>(readActive)

  useEffect(() => {
    try { localStorage.setItem(CARTS_KEY, JSON.stringify(rawCarts)) } catch { /* quota / unavailable */ }
  }, [rawCarts])

  useEffect(() => {
    try { localStorage.setItem(ACTIVE_KEY, activeTable) } catch { /* unavailable */ }
  }, [activeTable])

  const byId = useMemo(() => new Map(products.map((p) => [p._id, p])), [products])

  // Resolve raw lines against the catalog: drop deleted/disabled/out-of-stock
  // products and clamp quantities to current stock.
  const resolve = useCallback(
    (lines: RawLine[]): CartLine[] => {
      const out: CartLine[] = []
      for (const l of lines) {
        const product = byId.get(l.productId)
        if (!product || product.status === "disabled" || product.stock <= 0) continue
        const quantity = Math.min(l.quantity, product.stock)
        if (quantity > 0) out.push({ product, quantity })
      }
      return out
    },
    [byId],
  )

  const cart = useMemo(() => resolve(rawCarts[activeTable]), [resolve, rawCarts, activeTable])

  const itemCounts = useMemo(() => {
    const counts = {} as Record<TableKey, number>
    for (const key of TABLE_KEYS) {
      counts[key] = resolve(rawCarts[key]).reduce((s, l) => s + l.quantity, 0)
    }
    return counts
  }, [resolve, rawCarts])

  const addToCart = useCallback(
    (p: Product) => {
      setRawCarts((prev) => {
        const lines = prev[activeTable]
        const existing = lines.find((l) => l.productId === p._id)
        if (existing) {
          if (existing.quantity >= p.stock) return prev
          return {
            ...prev,
            [activeTable]: lines.map((l) => (l.productId === p._id ? { ...l, quantity: l.quantity + 1 } : l)),
          }
        }
        return { ...prev, [activeTable]: [...lines, { productId: p._id, quantity: 1 }] }
      })
    },
    [activeTable],
  )

  const setQty = useCallback(
    (productId: string, qty: number) => {
      setRawCarts((prev) => {
        const lines = prev[activeTable]
        if (qty <= 0) {
          return { ...prev, [activeTable]: lines.filter((l) => l.productId !== productId) }
        }
        const stock = byId.get(productId)?.stock ?? qty
        const clamped = Math.min(qty, stock)
        return {
          ...prev,
          [activeTable]: lines.map((l) => (l.productId === productId ? { ...l, quantity: clamped } : l)),
        }
      })
    },
    [activeTable, byId],
  )

  const removeLine = useCallback(
    (productId: string) => {
      setRawCarts((prev) => ({
        ...prev,
        [activeTable]: prev[activeTable].filter((l) => l.productId !== productId),
      }))
    },
    [activeTable],
  )

  const clearActive = useCallback(() => {
    setRawCarts((prev) => ({ ...prev, [activeTable]: [] }))
  }, [activeTable])

  return { activeTable, setActiveTable, cart, itemCounts, addToCart, setQty, removeLine, clearActive }
}
