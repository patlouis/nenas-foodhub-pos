import { useEffect, useMemo, useState } from "react"
import type { Product, Category } from "../types"
import { productsApi, categoriesApi, ordersApi } from "../api"
import { getLineTotal } from "../pricing"
import { ErrorBanner, EmptyState, XSmallIcon, SearchBox, btnPrimaryCls } from "../components/ui"

type CartLine = { product: Product; quantity: number }

const qtyBtnCls =
  "flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-h)] transition hover:bg-[var(--social-bg)] disabled:cursor-not-allowed disabled:opacity-40"

function Chip({
  active, onClick, color, children,
}: {
  active: boolean
  onClick: () => void
  color?: string
  children: React.ReactNode
}) {
  const activeStyle = active && color ? { backgroundColor: color, borderColor: color } : undefined
  return (
    <button
      onClick={onClick}
      style={activeStyle}
      className={
        "inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm transition-colors " +
        (active
          ? color
            ? "font-medium text-white border-transparent"
            : "border-transparent bg-[var(--accent)] font-medium text-white"
          : "border-[var(--border)] text-[var(--text)] hover:bg-[var(--social-bg)] hover:text-[var(--text-h)]")
      }
    >
      {color && (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: active ? "rgba(255,255,255,0.75)" : color }}
        />
      )}
      {children}
    </button>
  )
}

export default function OrderPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [category, setCategory] = useState("") // "" = All
  const [query, setQuery] = useState("")
  const [cart, setCart] = useState<CartLine[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  async function load() {
    setError(null)
    try {
      const [prodsResult, catsResult] = await Promise.allSettled([
        // The menu needs the full catalog, not one page of it.
        productsApi.list({ limit: 500 }),
        categoriesApi.list(),
      ])
      if (prodsResult.status === "fulfilled") {
        setProducts(prodsResult.value.data)
      } else {
        throw prodsResult.reason
      }
      if (catsResult.status === "fulfilled") {
        setCategories(catsResult.value)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the menu")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const visibleProducts = useMemo(() => {
    const q = query.trim().toLowerCase()
    const catOrder = new Map(categories.map((c) => [c._id, c.order ?? 0]))
    return products
      .filter((p) => {
        if (q) return p.name.toLowerCase().includes(q)
        return !category || (p.category ?? "") === category
      })
      .sort((a, b) => {
        // Out-of-stock and disabled always sink to the bottom
        const aOut = (a.stock <= 0 || a.status === "disabled") ? 1 : 0
        const bOut = (b.stock <= 0 || b.status === "disabled") ? 1 : 0
        if (aOut !== bOut) return aOut - bOut
        const aOrd = catOrder.get(a.category ?? "") ?? 9999
        const bOrd = catOrder.get(b.category ?? "") ?? 9999
        if (aOrd !== bOrd) return aOrd - bOrd
        return a.name.localeCompare(b.name)
      })
  }, [products, categories, category, query])

  const qtyInCart = useMemo(
    () => new Map(cart.map((l) => [l.product._id, l.quantity])),
    [cart]
  )

  function addToCart(p: Product) {
    setSuccess(null)
    setCart((prev) => {
      const line = prev.find((l) => l.product._id === p._id)
      if (!line) return [...prev, { product: p, quantity: 1 }]
      if (line.quantity >= p.stock) return prev
      return prev.map((l) =>
        l.product._id === p._id ? { ...l, quantity: l.quantity + 1 } : l
      )
    })
  }

  function setQty(productId: string, qty: number) {
    setCart((prev) =>
      qty <= 0
        ? prev.filter((l) => l.product._id !== productId)
        : prev.map((l) =>
            l.product._id === productId
              ? { ...l, quantity: Math.min(qty, l.product.stock) }
              : l
          )
    )
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.product._id !== productId))
  }

  const total = cart.reduce((sum, l) => sum + getLineTotal(l.product, l.quantity), 0)
  const itemCount = cart.reduce((sum, l) => sum + l.quantity, 0)

  async function submit() {
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    try {
      const order = await ordersApi.create(
        cart.map((l) => ({ productId: l.product._id, quantity: l.quantity }))
      )
      setCart([])
      const num = order.orderNumber != null ? `#${String(order.orderNumber).padStart(4, "0")}` : ""
      setSuccess(`Order ${num} placed — ₱${order.total.toFixed(2)}`)
      await load() // stock changed on the server
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place order")
      await load() // e.g. someone else took the stock — refresh the menu
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-dvh flex-col sm:flex-row">
      {/* ---- Menu ---- */}
      <div className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        <h1>New Order</h1>

        {error && <ErrorBanner message={error} />}

        <div className="mb-4">
          <SearchBox value={query} onChange={setQuery} placeholder="Search products…" />
        </div>

        <div className={`mb-5 flex flex-wrap gap-2 transition-opacity duration-150 ${query ? "opacity-40" : ""}`}>
          <Chip active={category === ""} onClick={() => { setCategory(""); setQuery("") }}>
            All
          </Chip>
          {categories.map((c) => (
            <Chip key={c._id} active={category === c._id} onClick={() => { setCategory(c._id); setQuery("") }} color={c.color}>
              {c.name}
            </Chip>
          ))}
        </div>

        {loading ? (
          <EmptyState>Loading menu…</EmptyState>
        ) : visibleProducts.length === 0 ? (
          <EmptyState>
            {query
              ? `No products match "${query}".`
              : category
              ? `No products in ${categories.find((c) => c._id === category)?.name ?? category}.`
              : "No products yet — add some on the Products page."}
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
            {visibleProducts.map((p) => {
              const inCart = qtyInCart.get(p._id) ?? 0
              const out = p.stock <= 0
              const unavailable = out || p.status === "disabled"
              const hasDiscount = p.discountQty && p.discountQty >= 2 && p.discountPrice != null
              return (
                <button
                  key={p._id}
                  onClick={() => addToCart(p)}
                  disabled={unavailable}
                  className={
                    "relative flex flex-col items-start gap-2 rounded-xl border p-5 text-left transition sm:p-6 lg:p-4 xl:p-5 " +
                    (unavailable
                      ? "cursor-not-allowed border-[var(--border)] opacity-50"
                      : "cursor-pointer border-[var(--border)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-bg)]")
                  }
                >
                  {inCart > 0 && (
                    <span className="absolute right-2.5 top-2.5 flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-xs font-semibold text-white">
                      {inCart}
                    </span>
                  )}
                  <span className="pr-8 text-base font-medium leading-snug text-[var(--text-h)]">{p.name}</span>
                  <span className="text-base font-semibold tabular-nums text-[var(--accent)]">
                    ₱{p.price.toFixed(2)}
                  </span>
                  {hasDiscount && (
                    <span className="text-xs tabular-nums text-green-600">
                      {p.discountQty}× for ₱{p.discountPrice!.toFixed(2)}
                    </span>
                  )}
                  <span className="text-xs text-[var(--text)]">
                    {p.status === "disabled" ? "Unavailable" : out ? "Out of stock" : `${p.stock} in stock`}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ---- Receipt ---- */}
      <aside className="flex w-full shrink-0 flex-col border-t border-[var(--border)] sm:w-72 sm:border-l sm:border-t-0 lg:w-96">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="m-0 text-lg">Current order</h2>
        </div>

        <div className="max-h-56 overflow-y-auto px-5 py-4 sm:max-h-none sm:min-h-40 sm:flex-1">
          {success && (
            <p className="mb-3 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-600">
              {success}
            </p>
          )}

          {cart.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--text)]">
              No items yet — tap a product to add it.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {cart.map((l) => (
                <li key={l.product._id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[var(--text-h)]">
                      {l.product.name}
                    </p>
                    <p className="text-xs tabular-nums text-[var(--text)]">
                      ₱{l.product.price.toFixed(2)} each
                    </p>
                    {l.product.discountQty && l.quantity >= l.product.discountQty && l.product.discountPrice != null && (
                      <p className="text-xs text-green-600">
                        {Math.floor(l.quantity / l.product.discountQty)}× deal applied
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setQty(l.product._id, l.quantity - 1)}
                      aria-label={`Decrease ${l.product.name}`}
                      className={qtyBtnCls}
                    >
                      −
                    </button>
                    <span className="w-7 text-center tabular-nums text-[var(--text-h)]">
                      {l.quantity}
                    </span>
                    <button
                      onClick={() => setQty(l.product._id, l.quantity + 1)}
                      disabled={l.quantity >= l.product.stock}
                      aria-label={`Increase ${l.product.name}`}
                      className={qtyBtnCls}
                    >
                      +
                    </button>
                  </div>

                  <span className="w-16 shrink-0 text-right tabular-nums text-[var(--text-h)]">
                    ₱{getLineTotal(l.product, l.quantity).toFixed(2)}
                  </span>

                  <button
                    onClick={() => removeLine(l.product._id)}
                    aria-label={`Remove ${l.product.name}`}
                    className="shrink-0 cursor-pointer text-[var(--text)] transition hover:text-red-500"
                  >
                    <XSmallIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-[var(--border)] px-5 py-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm text-[var(--text)]">
              Total{itemCount > 0 && ` · ${itemCount} item${itemCount === 1 ? "" : "s"}`}
            </span>
            <span className="text-xl font-semibold tabular-nums text-[var(--text-h)]">
              ₱{total.toFixed(2)}
            </span>
          </div>
          <button
            onClick={submit}
            disabled={cart.length === 0 || submitting}
            className={`${btnPrimaryCls} w-full`}
          >
            {submitting ? "Placing order…" : "Place order"}
          </button>
        </div>
      </aside>
    </div>
  )
}
