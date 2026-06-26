import { useEffect, useMemo, useRef, useState } from "react"
import type { Product, Category, User } from "../types"
import { productsApi, categoriesApi, ordersApi, usersApi } from "../api"
import { getLineTotal } from "../pricing"
import { ErrorBanner, EmptyState, XSmallIcon, SearchBox, btnPrimaryCls, btnOutlineCls } from "../components/ui"
import Modal from "../components/Modal"

type CartLine = { product: Product; quantity: number }

const qtyBtnCls =
  "flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-h)] transition hover:bg-[var(--social-bg)] disabled:cursor-not-allowed disabled:opacity-40"

// Pick black or white text for a solid color fill, based on perceived luminance,
// so an active chip stays readable for any category color (e.g. yellow).
function readableTextOn(hex: string): string {
  let h = hex.replace("#", "").trim()
  if (h.length === 3) h = h.split("").map((c) => c + c).join("")
  if (h.length !== 6) return "#ffffff"
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? "#1a1a1a" : "#ffffff"
}

function Chip({
  active, onClick, color, children,
}: {
  active: boolean
  onClick: () => void
  color?: string
  children: React.ReactNode
}) {
  const style = color
    ? active
      ? { backgroundColor: color, borderColor: color, color: readableTextOn(color) }
      : { backgroundColor: `color-mix(in srgb, ${color} 30%, var(--social-bg))` }
    : undefined
  return (
    <button
      onClick={onClick}
      style={style}
      className={
        "inline-flex h-10 shrink-0 cursor-pointer items-center rounded-full border px-5 text-sm font-medium transition-colors " +
        (active
          ? color
            ? "border-transparent"
            : "border-transparent bg-[var(--accent)] text-white"
          : color
            ? "border-[var(--border)] text-[var(--text-h)] hover:brightness-110"
            : "border-[var(--border)] font-normal text-[var(--text)] hover:bg-[var(--social-bg)] hover:text-[var(--text-h)]")
      }
    >
      {children}
    </button>
  )
}

interface OrderPageProps {
  pendingBarcodeSku: string | null
  onBarcodeConsumed: () => void
  /** True while this is the visible page. OrderPage stays mounted (to keep the
   *  in-progress cart), so we refetch the menu whenever it becomes active. */
  active: boolean
}

export default function OrderPage({ pendingBarcodeSku, onBarcodeConsumed, active }: OrderPageProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [category, setCategory] = useState("") // "" = All
  const [query, setQuery] = useState("")
  const [cart, setCart] = useState<CartLine[]>([])
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "gcash">("cash")
  const [isStaffMeal, setIsStaffMeal] = useState(false)
  const [staffMealRecipient, setStaffMealRecipient] = useState("")
  const [users, setUsers] = useState<User[]>([])
  const [usersLoaded, setUsersLoaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Bumped on every load() call so a slower, older request can't overwrite the
  // results of a newer one (e.g. navigating away and back quickly).
  const loadToken = useRef(0)

  async function load() {
    const token = ++loadToken.current
    setError(null)
    try {
      const [prodsResult, catsResult] = await Promise.allSettled([
        // The menu needs the full catalog, not one page of it.
        productsApi.list({ limit: 500 }),
        categoriesApi.list(),
      ])
      if (token !== loadToken.current) return // a newer load() superseded this one
      if (prodsResult.status === "fulfilled") {
        setProducts(prodsResult.value.data)
      } else {
        throw prodsResult.reason
      }
      if (catsResult.status === "fulfilled") {
        setCategories(catsResult.value)
      }
    } catch (err) {
      if (token !== loadToken.current) return
      setError(err instanceof Error ? err.message : "Failed to load the menu")
    } finally {
      if (token === loadToken.current) setLoading(false)
    }
  }

  // Refetch whenever the page becomes active so CRUD done on other pages
  // (inventory, categories) is always reflected here without a manual refresh.
  useEffect(() => { if (active) load() }, [active])

  useEffect(() => {
    if (isStaffMeal && !usersLoaded) {
      usersApi.list().then((u) => { setUsers(u); setUsersLoaded(true) }).catch(() => {})
    }
  }, [isStaffMeal, usersLoaded])

  useEffect(() => {
    if (!pendingBarcodeSku || products.length === 0) return
    const match = products.find(
      (p) => p.sku && p.sku.toLowerCase() === pendingBarcodeSku.toLowerCase()
    )
    if (match) {
      if (match.stock > 0 && match.status !== "disabled") {
        addToCart(match)
      } else {
        setError(`"${match.name}" is unavailable`)
      }
    } else {
      setError(`No product found for barcode: ${pendingBarcodeSku}`)
    }
    onBarcodeConsumed()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingBarcodeSku, products])

  const visibleProducts = useMemo(() => {
    const q = query.trim().toLowerCase()
    const catOrder = new Map(categories.map((c) => [c._id, c.order ?? 0]))
    return products
      .filter((p) => {
        if (q) return p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q)
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
        cart.map((l) => ({ productId: l.product._id, quantity: l.quantity })),
        paymentMethod,
        isStaffMeal ? "staff_meal" : "sale",
        isStaffMeal && staffMealRecipient ? staffMealRecipient : undefined,
      )
      setCart([])
      setPaymentMethod("cash")
      setIsStaffMeal(false)
      setStaffMealRecipient("")
      const num = order.orderNumber != null ? `#${String(order.orderNumber).padStart(4, "0")}` : ""
      setSuccess(isStaffMeal ? `Staff meal ${num} recorded` : `Order ${num} placed — ₱${order.total.toFixed(2)}`)
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
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 text-lg">Current order</h2>
            <button
              onClick={() => { setIsStaffMeal((v) => !v); setStaffMealRecipient("") }}
              className={
                "h-8 rounded-lg border px-3 text-xs font-medium transition " +
                (isStaffMeal
                  ? "border-purple-500 bg-purple-500/10 text-purple-600"
                  : "border-[var(--border)] text-[var(--text)] hover:bg-[var(--social-bg)]")
              }
            >
              Staff meal
            </button>
          </div>
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
            {isStaffMeal ? (
              <span className="text-xl font-semibold tabular-nums text-purple-600">₱0.00</span>
            ) : (
              <span className="text-xl font-semibold tabular-nums text-[var(--text-h)]">
                ₱{total.toFixed(2)}
              </span>
            )}
          </div>

          {/* Recipient selector — staff meal only */}
          {isStaffMeal && (
            <div className="mb-3">
              <select
                value={staffMealRecipient}
                onChange={(e) => setStaffMealRecipient(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-h)] outline-none transition focus-visible:ring-2 focus-visible:ring-purple-500"
              >
                <option value="">Staff member (optional)</option>
                {users.map((u) => (
                  <option key={u._id} value={u.name}>{u.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Payment method toggle — hidden for staff meals */}
          {!isStaffMeal && (
          <div className="mb-3 flex gap-2">
            {(["cash", "gcash"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={
                  "flex-1 cursor-pointer rounded-lg border py-2 text-sm font-medium capitalize transition " +
                  (paymentMethod === m
                    ? m === "gcash"
                      ? "border-blue-500 bg-blue-500/10 text-blue-500"
                      : "border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--text)] hover:bg-[var(--social-bg)]")
                }
              >
                {m === "gcash" ? "GCash" : "Cash"}
              </button>
            ))}
          </div>
          )}

          <button
            onClick={() => setConfirmOpen(true)}
            disabled={cart.length === 0 || submitting}
            className={`${btnPrimaryCls} w-full ${isStaffMeal ? "bg-purple-600 hover:bg-purple-700 focus-visible:ring-purple-500" : ""}`}
          >
            {isStaffMeal ? "Record staff meal" : "Place order"}
          </button>
        </div>
      </aside>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm order">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            {isStaffMeal ? (
              <span className="inline-flex items-center rounded-full bg-purple-500/10 px-2.5 py-0.5 text-xs font-semibold text-purple-600">
                Staff meal
              </span>
            ) : paymentMethod === "gcash" ? (
              <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-500">
                GCash
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
                Cash
              </span>
            )}
            {isStaffMeal && staffMealRecipient && (
              <span className="text-sm text-[var(--text)]">for <span className="font-medium text-[var(--text-h)]">{staffMealRecipient}</span></span>
            )}
          </div>

          <ul className="flex flex-col gap-2 border-y border-[var(--border)] py-3">
            {cart.map((l) => (
              <li key={l.product._id} className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 truncate text-[var(--text-h)]">{l.product.name}</span>
                <span className="shrink-0 text-sm tabular-nums text-[var(--text)]">
                  {l.quantity} × ₱{l.product.price.toFixed(2)}
                </span>
                <span className="w-20 shrink-0 text-right tabular-nums text-[var(--text-h)]">
                  ₱{getLineTotal(l.product, l.quantity).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex items-baseline justify-between">
            <span className="text-sm text-[var(--text)]">
              Total · {itemCount} item{itemCount === 1 ? "" : "s"}
            </span>
            {isStaffMeal ? (
              <span className="text-xl font-semibold tabular-nums text-purple-600">₱0.00</span>
            ) : (
              <span className="text-xl font-semibold tabular-nums text-[var(--text-h)]">
                ₱{total.toFixed(2)}
              </span>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirmOpen(false)} className={btnOutlineCls}>
              Cancel
            </button>
            <button
              onClick={() => { setConfirmOpen(false); void submit() }}
              disabled={submitting}
              className={`${btnPrimaryCls} ${isStaffMeal ? "bg-purple-600 hover:bg-purple-700 focus-visible:ring-purple-500" : ""}`}
            >
              {submitting ? (isStaffMeal ? "Recording…" : "Placing…") : (isStaffMeal ? "Confirm staff meal" : "Confirm order")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
