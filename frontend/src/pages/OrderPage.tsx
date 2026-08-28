import { useEffect, useMemo, useRef, useState } from "react"
import type { Product, Category, User, TableKey, Portion } from "../types"
import { TABLE_KEYS } from "../types"
import { productsApi, categoriesApi, ordersApi, usersApi } from "../api"
import { getLineTotal, getFeeTotal } from "../pricing"
import { getChange } from "../tender"
import { hasStockFor, isTracked, isUnavailable, stockLabel } from "../stock"
import { useTableCarts, type CartLine } from "../hooks/useTableCarts"
import { ErrorBanner, EmptyState, XSmallIcon, SearchBox, btnPrimaryCls, btnOutlineCls, PrinterIcon, inputCls } from "../components/ui"
import { printReceipt } from "../utils/printReceipt"
import Modal from "../components/Modal"

function tableLabel(t: TableKey): string {
  return t === "order" ? "Counter" : `Table ${t}`
}

// What one unit of this line costs — the half rate when it's a half serving.
function unitPrice(l: CartLine): number {
  return l.portion === "half" ? (l.product.halfPrice ?? l.product.price) : l.product.price
}

// The Half / add-on controls floated over a product card's bottom corner.
const cardCtrlCls =
  "flex h-9 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-lg border border-[var(--accent-border)] bg-[var(--surface)] px-2.5 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-white"

// h-10/w-10 (40px) — a touch-friendly size that still keeps cart rows compact.
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
  const { activeTable, setActiveTable, cart, itemCounts, addToCart, setQty, setLineFee, removeLine, clearActive } =
    useTableCarts(products)
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "gcash">("cash")
  const [isStaffMeal, setIsStaffMeal] = useState(false)
  const [staffMealRecipient, setStaffMealRecipient] = useState("")
  const [users, setUsers] = useState<User[]>([])
  const [usersLoaded, setUsersLoaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [lastOrder, setLastOrder] = useState<import("../types").Order | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  // Cash handed over, kept as the raw input string so "not typed yet" stays
  // distinct from a deliberate 0. Cleared every time the modal opens so one
  // customer's tender can never carry into the next order.
  const [amountReceived, setAmountReceived] = useState("")

  // The add-on rate being typed, held until blur commits it. Only one box can
  // have focus, so one draft is enough. Committing per keystroke would re-key
  // the cart row — the rate is part of a line's identity — and tear the input
  // out from under the cursor.
  const [feeDraft, setFeeDraft] = useState<{ key: string; text: string } | null>(null)

  // Tracks the most recently tapped product so its cart-count badge can replay
  // a pop animation — gives instant tactile feedback on a tablet with no hover state.
  const [justAdded, setJustAdded] = useState<{ id: string; tick: number } | null>(null)
  const addTick = useRef(0)

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

  // Staff meals only belong to the general Order tab — never a table. Clear the
  // toggle whenever a table tab is active so it can't leak onto a table order.
  useEffect(() => {
    if (activeTable !== "order") {
      setIsStaffMeal(false)
      setStaffMealRecipient("")
    }
  }, [activeTable])

  // Auto-dismiss the "order placed" toast after 6s (longer to give time to hit Print).
  useEffect(() => {
    if (!success) return
    const id = setTimeout(() => setSuccess(null), 6000)
    return () => clearTimeout(id)
  }, [success])

  useEffect(() => {
    if (!pendingBarcodeSku || products.length === 0) return
    const match = products.find(
      (p) => p.sku && p.sku.toLowerCase() === pendingBarcodeSku.toLowerCase()
    )
    if (match) {
      if (!isUnavailable(match)) {
        handleAdd(match)
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
        // "All" excludes unavailable items entirely — they get their own
        // trailing section instead (see groupedProducts). A specific category
        // still includes its unavailable items; the sort below sinks them
        // to the bottom of that category's grid.
        if (category === "") return !isUnavailable(p)
        return (p.category ?? "") === category
      })
      .sort((a, b) => {
        // Out-of-stock and disabled always sink to the bottom — matters for
        // search results and a specific category's grid; the "All" view
        // never has any to sort since it excludes them upstream.
        const aOut = isUnavailable(a) ? 1 : 0
        const bOut = isUnavailable(b) ? 1 : 0
        if (aOut !== bOut) return aOut - bOut
        const aOrd = catOrder.get(a.category ?? "") ?? 9999
        const bOrd = catOrder.get(b.category ?? "") ?? 9999
        if (aOrd !== bOrd) return aOrd - bOrd
        return a.name.localeCompare(b.name)
      })
  }, [products, categories, category, query])

  // Summed across portions: the card badge shows the whole dish's count, so a
  // full and a half of the same thing read as 2, not whichever line came last.
  const qtyInCart = useMemo(() => {
    const counts = new Map<string, number>()
    for (const l of cart) counts.set(l.product._id, (counts.get(l.product._id) ?? 0) + l.quantity)
    return counts
  }, [cart])

  // When browsing "All" with no search active, split the menu into per-category
  // sections (available items only) plus one trailing "Unavailable" section for
  // out-of-stock/disabled products, so staff can scan straight to the right zone
  // instead of one long grid with unavailable items scattered at the bottom of
  // each category. Filtering to a single category or searching shows a flat
  // grid instead, since grouping adds no value once the list is already
  // narrowed down (and a specific category already excludes unavailable items).
  const groupedProducts = useMemo(() => {
    if (category !== "" || query.trim() !== "") return null
    const byCat = new Map<string, Product[]>()
    for (const p of visibleProducts) {
      const key = p.category ?? ""
      if (!byCat.has(key)) byCat.set(key, [])
      byCat.get(key)!.push(p)
    }
    const catOrder = new Map(categories.map((c) => [c._id, c.order ?? 0]))
    const catById = new Map(categories.map((c) => [c._id, c]))
    const keys = Array.from(byCat.keys()).sort((a, b) => {
      if (a === "") return 1
      if (b === "") return -1
      return (catOrder.get(a) ?? 9999) - (catOrder.get(b) ?? 9999)
    })
    const sections = keys.map((k) => ({
      key: k || "uncategorized",
      label: catById.get(k)?.name ?? "Other",
      color: catById.get(k)?.color,
      products: byCat.get(k)!,
    }))

    const unavailable = products
      .filter((p) => isUnavailable(p))
      .sort((a, b) => a.name.localeCompare(b.name))
    if (unavailable.length > 0) {
      sections.push({ key: "unavailable", label: `Unavailable (${unavailable.length})`, color: undefined, products: unavailable })
    }

    return sections
  }, [visibleProducts, category, query, categories, products])

  function handleAdd(p: Product, portion: Portion = "full", fee: number | null = null) {
    setSuccess(null)
    addToCart(p, portion, fee)
    addTick.current += 1
    setJustAdded({ id: p._id, tick: addTick.current })
  }

  // What one line costs all in — goods plus its add-on.
  const lineCost = (l: CartLine) =>
    getLineTotal(l.product, l.quantity, l.portion) + getFeeTotal(l.fee, l.quantity)

  const total = cart.reduce((sum, l) => sum + lineCost(l), 0)
  const itemCount = cart.reduce((sum, l) => sum + l.quantity, 0)

  // Change is only meaningful for cash: GCash is transferred to the exact
  // peso and a staff meal is always ₱0.00, so neither can leave any owing.
  const tenderable = !isStaffMeal && paymentMethod === "cash"
  const change = getChange(amountReceived, total)

  function renderCard(p: Product) {
    const inCart = qtyInCart.get(p._id) ?? 0
    const unavailable = isUnavailable(p)
    const hasDiscount = p.discountQty && p.discountQty >= 2 && p.discountPrice != null
    // The ½ control has to live outside the card button — a button can't nest
    // inside another button — so it's a sibling positioned over the corner.
    const offersHalf = p.halfPrice != null && !unavailable
    const offersFee = p.feeAmount != null && p.feeLabel && !unavailable
    return (
      <div key={p._id} className="relative">
      <button
        onClick={() => handleAdd(p)}
        disabled={unavailable}
        className={
          // h-full keeps every card in a row the same height. The grid cell
          // already stretches; without it the button is content-sized, so a
          // wrapped name or a missing stock line leaves the row ragged.
          "relative flex h-full w-full flex-col items-start gap-2 rounded-xl border p-5 text-left transition sm:p-6 lg:p-4 xl:p-5 " +
          // The Half / add-on controls float over the bottom corner, so the
          // text has to stop short of them. On a two-column phone grid a card
          // is ~170px wide and the stock line would otherwise run underneath.
          (offersHalf || offersFee ? "pb-14 " : "") +
          (unavailable
            ? "cursor-not-allowed border-[var(--border)] opacity-50"
            : "cursor-pointer border-[var(--border)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-bg)]")
        }
      >
        {inCart > 0 && (
          <span
            key={justAdded?.id === p._id ? justAdded.tick : "static"}
            className={
              "absolute right-2.5 top-2.5 flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-xs font-semibold text-white " +
              (justAdded?.id === p._id ? "animate-[add-pop_220ms_ease-out]" : "")
            }
          >
            {inCart}
          </span>
        )}
        <span className="pr-8 text-base font-medium leading-snug text-[var(--text-h)]">{p.name}</span>
        <span className={`text-base font-semibold tabular-nums ${unavailable ? "text-[var(--text)]" : "text-[var(--accent)]"}`}>
          ₱{p.price.toFixed(2)}
        </span>
        {hasDiscount && (
          <span className="text-xs tabular-nums text-green-600">
            {p.discountQty}× for ₱{p.discountPrice!.toFixed(2)}
          </span>
        )}
        {/* Names the add-on that the corner button charges for. The button has
            room for the amount and nothing else, and its tooltip is no use on
            a tablet — so the words have to be on the card itself. */}
        {offersFee && (
          <span className="max-w-full truncate text-xs tabular-nums text-[var(--accent)]">
            {p.feeLabel} +₱{p.feeAmount!.toFixed(2)}
          </span>
        )}
        {/* Untracked is bookkeeping, not something the cashier acts on — only
            a shortage or a switched-off item earns words here. The empty line
            still holds its height: a row of nothing but untracked items would
            otherwise shrink until the Half button sat on top of the price. */}
        <span className="min-h-4 text-xs text-[var(--text)]">
          {p.status === "disabled"
            ? "Unavailable"
            : isTracked(p.stock)
              ? stockLabel(p.stock)
              : null}
        </span>
      </button>

      {/* These can't nest inside the card button, so they're siblings floated
          over its bottom corner. Laid out as one flex row rather than two
          independently-positioned buttons: the fee amount sets its own width,
          so any offset guessed against the Half button would eventually be
          wrong. The card reserves this row's height in its padding. */}
      {(offersHalf || offersFee) && (
        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5">
          {offersFee && (
            // Adds the item *with* its add-on. Tapping the card itself adds it
            // without — the customer taking the noodles home wants no water.
            <button
              onClick={() => handleAdd(p, "full", p.feeAmount!)}
              aria-label={`Add ${p.name} with ${p.feeLabel} — ₱${p.feeAmount!.toFixed(2)}`}
              title={`${p.feeLabel} · ₱${p.feeAmount!.toFixed(2)}`}
              className={cardCtrlCls}
            >
              +₱{p.feeAmount!.toFixed(0)}
            </button>
          )}
          {offersHalf && (
            <button
              onClick={() => handleAdd(p, "half")}
              aria-label={`Add half ${p.name} — ₱${p.halfPrice!.toFixed(2)}`}
              title={`Half · ₱${p.halfPrice!.toFixed(2)}`}
              className={cardCtrlCls}
            >
              Half
            </button>
          )}
        </div>
      )}
      </div>
    )
  }

  async function submit() {
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    try {
      // Staff meals and the general order tab carry no table number.
      const tableNumber =
        !isStaffMeal && activeTable !== "order" ? Number(activeTable) : undefined
      const order = await ordersApi.create(
        cart.map((l) => ({ productId: l.product._id, quantity: l.quantity, portion: l.portion, ...(l.fee != null ? { fee: l.fee } : {}) })),
        paymentMethod,
        isStaffMeal ? "staff_meal" : "sale",
        isStaffMeal && staffMealRecipient ? staffMealRecipient : undefined,
        tableNumber,
      )
      clearActive()
      setPaymentMethod("cash")
      setIsStaffMeal(false)
      setStaffMealRecipient("")
      setAmountReceived("")
      setLastOrder(order)
      const num = order.orderNumber != null ? `#${String(order.orderNumber).padStart(4, "0")}` : ""
      // The change is what the cashier needs on screen at this exact moment —
      // they read it off the toast while counting the drawer, after the modal
      // has closed. Recomputed against order.total because the server, not the
      // cart preview, is the source of truth for what was actually charged.
      // Falls back to the total when no tender was entered or it fell short.
      const changeDue = tenderable ? getChange(amountReceived, order.total) : null
      setSuccess(
        isStaffMeal
          ? `Staff meal ${num} recorded`
          : changeDue !== null && changeDue >= 0
            ? `Order ${num} placed — change ₱${changeDue.toFixed(2)}`
            : `Order ${num} placed — ₱${order.total.toFixed(2)}`,
      )
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
      {/* pt-3 (not py-6) so the search bar lines up with the table-tabs row and
          the sidebar toggle across the top; keep the roomier bottom padding. */}
      <div className="min-w-0 flex-1 overflow-y-auto px-4 pb-6 pt-3 sm:px-6 lg:px-8">
        {error && <ErrorBanner message={error} />}

        <div className="mb-4">
          <SearchBox value={query} onChange={setQuery} placeholder="Search products…" className="max-w-md" />
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
        ) : (groupedProducts ? groupedProducts.length === 0 : visibleProducts.length === 0) ? (
          // In the "All" view, "empty" means no sections at all — if every
          // product is unavailable there's still an "Unavailable (N)" section
          // to show, so we key off groupedProducts rather than visibleProducts.
          <EmptyState>
            {query
              ? `No products match "${query}".`
              : category
              ? `No products in ${categories.find((c) => c._id === category)?.name ?? category}.`
              : "No products yet — add some on the Products page."}
          </EmptyState>
        ) : groupedProducts ? (
          <div className="flex flex-col gap-6">
            {groupedProducts.map((section) => (
              <div key={section.key}>
                <h2 className="m-0 mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                  {section.color && (
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: section.color }} />
                  )}
                  {section.label}
                </h2>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
                  {section.products.map(renderCard)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
            {visibleProducts.map(renderCard)}
          </div>
        )}
      </div>

      {/* ---- Receipt ---- */}
      <aside className="flex w-full shrink-0 flex-col border-t border-[var(--border)] sm:w-72 sm:border-l sm:border-t-0 lg:w-96">
        {/* Table tabs — same toggle-button styling as the payment selector below.
            A green corner dot marks tables with an order in progress. */}
        <div className="border-b border-[var(--border)] px-5 py-3">
          <div className="flex gap-1">
            {TABLE_KEYS.map((t) => {
              const occupied = itemCounts[t] > 0
              const active = activeTable === t
              return (
                <button
                  key={t}
                  onClick={() => setActiveTable(t)}
                  title={t === "order" ? "Counter" : `Table ${t}`}
                  className={
                    "relative flex h-9 cursor-pointer items-center justify-center rounded-lg border text-sm font-medium transition " +
                    (t === "order" ? "shrink-0 px-3 " : "flex-1 px-1 ") +
                    (active
                      ? "border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--accent)]"
                      : occupied
                        ? "border-[var(--border)] text-[var(--text-h)] hover:bg-[var(--social-bg)]"
                        : "border-[var(--border)] text-[var(--text)] hover:bg-[var(--social-bg)]")
                  }
                >
                  {t === "order" ? "Counter" : t}
                  {occupied && !active && (
                    <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
        <div className="border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 text-lg">{tableLabel(activeTable)}</h2>
            {activeTable === "order" && (
              <button
                onClick={() => { setIsStaffMeal((v) => !v); setStaffMealRecipient("") }}
                className={
                  "h-8 cursor-pointer rounded-lg border px-3 text-xs font-medium transition " +
                  (isStaffMeal
                    ? "border-purple-500 bg-purple-500/10 text-purple-600"
                    : "border-[var(--border)] text-[var(--text)] hover:bg-[var(--social-bg)]")
                }
              >
                Staff meal
              </button>
            )}
          </div>
        </div>

        <div
          className={
            "overflow-y-auto px-5 py-4 sm:min-h-40 sm:flex-1 " +
            (cart.length === 0
              ? "flex max-h-56 items-center justify-center sm:max-h-none"
              : "max-h-56 sm:max-h-none")
          }
        >
          {cart.length === 0 ? (
            <p className="text-center text-sm text-[var(--text)]">
              No items yet — tap a product to add it.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {cart.map((l) => (
                <li key={l.key} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[var(--text-h)]">
                      {l.product.name}
                      {l.portion === "half" && (
                        <span className="ml-1.5 rounded bg-[var(--accent-bg)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
                          Half
                        </span>
                      )}
                    </p>
                    <p className="text-xs tabular-nums text-[var(--text)]">
                      ₱{unitPrice(l).toFixed(2)} each
                    </p>
                    {l.portion === "full" && l.product.discountQty && l.quantity >= l.product.discountQty && l.product.discountPrice != null && (
                      <p className="text-xs text-green-600">
                        {Math.floor(l.quantity / l.product.discountQty)}× deal applied
                      </p>
                    )}
                    {/* The rate is editable here rather than in the product:
                        it's a one-off for this sale, not a repricing. */}
                    {l.fee != null && (
                      // min-w-0 + truncate on the label: the cart column is
                      // narrow on a phone, and a long add-on name would
                      // otherwise push the input and its × off the row.
                      <label className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-[var(--accent)]">
                        <span className="min-w-0 truncate">{l.product.feeLabel} ₱</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          // Typed into a draft and committed on blur, never per
                          // keystroke. The rate is part of the line's identity,
                          // so committing re-keys this row: React would tear
                          // the input down mid-edit and focus would go with it,
                          // leaving 10 impossible to carry on to 11. Holding
                          // the text also keeps an emptied box empty, where
                          // Number("") would otherwise commit ₱0.
                          value={feeDraft?.key === l.key ? feeDraft.text : l.fee}
                          onChange={(e) => setFeeDraft({ key: l.key, text: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur()
                          }}
                          onBlur={() => {
                            const text = feeDraft?.key === l.key ? feeDraft.text : null
                            setFeeDraft(null)
                            if (text == null) return
                            const next = Number(text)
                            // Anything unusable leaves the committed rate as it
                            // was, rather than guessing at what was meant.
                            if (text.trim() === "" || Number.isNaN(next) || next < 0) return
                            setLineFee(l, next)
                          }}
                          aria-label={`${l.product.feeLabel} rate for ${l.product.name}`}
                          className="w-12 shrink-0 rounded border border-[var(--border)] bg-[var(--bg)] px-1 py-0.5 text-xs tabular-nums text-[var(--text-h)] outline-none focus-visible:border-[var(--accent)]"
                        />
                        <button
                          onClick={() => setLineFee(l, null)}
                          aria-label={`Remove ${l.product.feeLabel} from ${l.product.name}`}
                          className="shrink-0 cursor-pointer px-1 text-sm leading-none text-[var(--text)] transition hover:text-red-500"
                        >
                          ×
                        </button>
                      </label>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setQty(l, l.quantity - 1)}
                      aria-label={`Decrease ${l.product.name}`}
                      className={qtyBtnCls}
                    >
                      −
                    </button>
                    <span className="w-7 text-center tabular-nums text-[var(--text-h)]">
                      {l.quantity}
                    </span>
                    <button
                      onClick={() => setQty(l, l.quantity + 1)}
                      disabled={!hasStockFor(l.product.stock, l.quantity + 1)}
                      aria-label={`Increase ${l.product.name}`}
                      className={qtyBtnCls}
                    >
                      +
                    </button>
                  </div>

                  <span className="w-16 shrink-0 text-right tabular-nums text-[var(--text-h)]">
                    ₱{lineCost(l).toFixed(2)}
                  </span>

                  <button
                    onClick={() => removeLine(l)}
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
            onClick={() => { setAmountReceived(""); setConfirmOpen(true) }}
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
            {!isStaffMeal && activeTable !== "order" && (
              <span className="inline-flex items-center rounded-full bg-[var(--accent-bg)] px-2.5 py-0.5 text-xs font-semibold text-[var(--accent)]">
                Table {activeTable}
              </span>
            )}
            {isStaffMeal && staffMealRecipient && (
              <span className="text-sm text-[var(--text)]">for <span className="font-medium text-[var(--text-h)]">{staffMealRecipient}</span></span>
            )}
          </div>

          <ul className="flex flex-col gap-2 border-y border-[var(--border)] py-3">
            {cart.map((l) => (
              <li key={l.key} className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 truncate text-[var(--text-h)]">
                  {l.product.name}
                  {l.portion === "half" && <span className="text-[var(--accent)]"> · Half</span>}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-[var(--text)]">
                  {l.quantity} × ₱{unitPrice(l).toFixed(2)}
                </span>
                <span className="w-20 shrink-0 text-right tabular-nums text-[var(--text-h)]">
                  ₱{lineCost(l).toFixed(2)}
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

          {/* Cash tendered — optional. Left blank, this renders nothing extra
              and the modal behaves exactly as it did before. */}
          {tenderable && (
            <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
              <label className="flex items-center justify-between gap-3 text-sm text-[var(--text)]">
                Amount received
                <span className="w-36 shrink-0">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={amountReceived}
                    onChange={(e) => setAmountReceived(e.target.value)}
                    placeholder="0.00"
                    className={`${inputCls} text-right tabular-nums`}
                  />
                </span>
              </label>

              {change !== null && (
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-[var(--text)]">
                    {change < 0 ? "Short" : "Change"}
                  </span>
                  <span
                    className={`text-lg font-semibold tabular-nums ${
                      change < 0 ? "text-red-500" : "text-emerald-600"
                    }`}
                  >
                    {change < 0 ? "−" : ""}₱{Math.abs(change).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

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

      {/* Success toast — floats over the screen, auto-dismisses */}
      {success && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-2.5 pr-3 text-sm font-medium text-[var(--text-h)] shadow-[var(--shadow)] animate-[toast-in_200ms_ease-out]">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span className="pr-1">{success}</span>
            {lastOrder && (
              <button
                onClick={() => printReceipt(lastOrder)}
                title="Print receipt"
                aria-label="Print receipt"
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text)] transition hover:bg-[var(--social-bg)] hover:text-[var(--text-h)]"
              >
                <PrinterIcon />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
