import { useCallback, useEffect, useMemo, useState } from "react"
import type { Portion, Product, TableKey } from "../types"
import { TABLE_KEYS } from "../types"
import { clampToStock, hasStockFor, isUnavailable } from "../stock"

// A line is identified by dish, portion *and* fee. A full and a half are priced
// differently, and so are two servings of the same noodles where only one was
// sold with hot water — merging those would charge one cup of water for both.
export function lineKey(productId: string, portion: Portion, fee: number | null = null): string {
  return `${productId}:${portion}:${fee ?? "none"}`
}

export type CartLine = {
  key: string
  product: Product
  portion: Portion
  quantity: number
  /** The add-on rate for this line, possibly edited down from the product's
   *  default. null = sold without the add-on. */
  fee: number | null
}

// The persisted source of truth holds only ids + quantities, never product
// snapshots, so prices and stock can't go stale — they're resolved against the
// live catalog on every render.
type RawLine = { productId: string; quantity: number; portion: Portion; fee?: number | null }
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
          // Carts parked before half servings or add-ons existed have neither.
          .map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            portion: l.portion === "half" ? "half" : "full",
            fee: typeof l.fee === "number" ? l.fee : null,
          }))
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
        if (!product || isUnavailable(product)) continue
        // A parked half line is dropped if the dish has since stopped
        // offering one, the same way an unavailable product is.
        if (l.portion === "half" && product.halfPrice == null) continue
        // Same rule for a parked add-on: if the product has stopped offering
        // one, the line stays but the fee is dropped rather than charged.
        const fee = product.feeAmount == null ? null : l.fee ?? null
        const quantity = clampToStock(product.stock, l.quantity)
        if (quantity > 0) {
          out.push({ key: lineKey(l.productId, l.portion, fee), product, portion: l.portion, quantity, fee })
        }
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
    (p: Product, portion: Portion = "full", fee: number | null = null) => {
      setRawCarts((prev) => {
        const lines = prev[activeTable]
        const key = lineKey(p._id, portion, fee)
        const existing = lines.find((l) => lineKey(l.productId, l.portion, l.fee ?? null) === key)
        if (existing) {
          if (!hasStockFor(p.stock, existing.quantity + 1)) return prev
          return {
            ...prev,
            [activeTable]: lines.map((l) =>
              lineKey(l.productId, l.portion, l.fee ?? null) === key ? { ...l, quantity: l.quantity + 1 } : l,
            ),
          }
        }
        return { ...prev, [activeTable]: [...lines, { productId: p._id, quantity: 1, portion, fee }] }
      })
    },
    [activeTable],
  )

  // Re-rates one line's add-on. Changing the amount changes the line's identity,
  // so a line already sitting at the new rate absorbs this one rather than the
  // cart showing the same thing twice.
  const setLineFee = useCallback(
    (line: CartLine, fee: number | null) => {
      setRawCarts((prev) => {
        const lines = prev[activeTable]
        const target = lineKey(line.product._id, line.portion, fee)
        // Re-rating to the value already held is a no-op. Without this the line
        // matches itself as the merge target and is dropped, which emptied the
        // row out from under anyone clearing the box to retype the amount.
        if (target === line.key) return prev
        const merging = lines.find(
          (l) => lineKey(l.productId, l.portion, l.fee ?? null) === target,
        )
        const next = lines
          .map((l) => {
            const key = lineKey(l.productId, l.portion, l.fee ?? null)
            if (key === line.key) return merging ? null : { ...l, fee }
            if (merging && key === target) return { ...l, quantity: l.quantity + line.quantity }
            return l
          })
          .filter((l): l is RawLine => l !== null)
        return { ...prev, [activeTable]: next }
      })
    },
    [activeTable],
  )

  // These take the resolved line rather than an id: a product id and a line
  // key are both strings, so passing the wrong one would compile silently.
  const setQty = useCallback(
    (line: CartLine, qty: number) => {
      const key = line.key
      setRawCarts((prev) => {
        const lines = prev[activeTable]
        if (qty <= 0) {
          return { ...prev, [activeTable]: lines.filter((l) => lineKey(l.productId, l.portion, l.fee ?? null) !== key) }
        }
        return {
          ...prev,
          [activeTable]: lines.map((l) => {
            if (lineKey(l.productId, l.portion, l.fee ?? null) !== key) return l
            // An unknown product falls back to the requested qty, same as an
            // untracked one — neither has a ceiling to clamp against.
            const known = byId.get(l.productId)
            return { ...l, quantity: known ? clampToStock(known.stock, qty) : qty }
          }),
        }
      })
    },
    [activeTable, byId],
  )

  const removeLine = useCallback(
    (line: CartLine) => {
      setRawCarts((prev) => ({
        ...prev,
        [activeTable]: prev[activeTable].filter((l) => lineKey(l.productId, l.portion, l.fee ?? null) !== line.key),
      }))
    },
    [activeTable],
  )

  const clearActive = useCallback(() => {
    setRawCarts((prev) => ({ ...prev, [activeTable]: [] }))
  }, [activeTable])

  return { activeTable, setActiveTable, cart, itemCounts, addToCart, setQty, setLineFee, removeLine, clearActive }
}
