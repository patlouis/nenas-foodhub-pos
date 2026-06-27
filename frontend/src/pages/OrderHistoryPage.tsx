import { useCallback, useEffect, useRef, useState } from "react"
import type { Order } from "../types"
import { ordersApi } from "../api"
import { useAuth } from "../auth"
import Modal from "../components/Modal"
import {
  PageShell, PageHeader, ErrorBanner, Toolbar, SearchBox, TableCard, EmptyState,
  SortTh, EyeIcon, BanIcon, iconBtnCls, iconBtnDangerCls, btnOutlineCls, btnDangerCls,
  PAGE_SIZE, Paginator,
} from "../components/ui"

const ITEM_PREVIEW = 3

function ItemsList({ items }: { items: import("../types").OrderItem[] }) {
  const shown = items.slice(0, ITEM_PREVIEW)
  const rest = items.length - ITEM_PREVIEW
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((i, idx) => (
        <span
          key={idx}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 text-xs"
        >
          <span className="font-semibold tabular-nums text-[var(--accent)]">{i.quantity}×</span>
          <span className="text-[var(--text-h)]">{i.name}</span>
        </span>
      ))}
      {rest > 0 && (
        <span className="inline-flex items-center rounded-full bg-[var(--social-bg)] px-2.5 py-0.5 text-xs text-[var(--text)]">
          +{rest} more
        </span>
      )}
    </div>
  )
}

function StaffMealBadge() {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-purple-500/10 px-2.5 py-0.5 text-xs font-semibold text-purple-600">
      Staff meal
    </span>
  )
}

function TypeBadge({ order }: { order: Order }) {
  if (order.orderType === "staff_meal") return <StaffMealBadge />
  return <PaymentBadge method={order.paymentMethod} />
}

function TableBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-[var(--accent-bg)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
      Table {n}
    </span>
  )
}

function PaymentBadge({ method }: { method?: "cash" | "gcash" }) {
  return method === "gcash" ? (
    <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-500">
      GCash
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
      Cash
    </span>
  )
}

type SortKey = "date" | "cashier" | "total" | "payment"
type SortDir = "asc" | "desc"
type DateMode = "all" | "month" | "week" | "day"

// ---- date helpers ----
function toDateStr(d: Date)  { return d.toLocaleDateString("sv") }           // YYYY-MM-DD
function toMonthStr(d: Date) { return d.toLocaleDateString("sv").slice(0, 7) } // YYYY-MM
function toWeekStr(d: Date): string {
  const t = new Date(d)
  t.setHours(0, 0, 0, 0)
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)) // nearest Thursday
  const w1 = new Date(t.getFullYear(), 0, 4)
  const wn = 1 + Math.round(((t.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7)
  return `${t.getFullYear()}-W${String(wn).padStart(2, "0")}`
}

function monthRange(s: string): [Date, Date] {
  const [y, m] = s.split("-").map(Number)
  return [new Date(y, m - 1, 1), new Date(y, m, 0, 23, 59, 59, 999)]
}
function weekRange(s: string): [Date, Date] {
  const [yr, wk] = s.split("-W").map(Number)
  const jan4 = new Date(yr, 0, 4)
  const j4d = jan4.getDay() || 7
  const mon = new Date(jan4.getTime() + (wk - 1) * 7 * 86400000 - (j4d - 1) * 86400000)
  mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon.getTime() + 6 * 86400000)
  sun.setHours(23, 59, 59, 999)
  return [mon, sun]
}
function dayRange(s: string): [Date, Date] {
  return [new Date(s + "T00:00:00"), new Date(s + "T23:59:59.999")]
}

function itemCount(o: Order) {
  return o.items.reduce((sum, i) => sum + i.quantity, 0)
}

function orderLabel(o: Order) {
  return o.orderNumber != null
    ? `#${String(o.orderNumber).padStart(4, "0")}`
    : `#${o._id.slice(-6)}`
}

function formatDate(iso?: string) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export default function OrderHistoryPage() {
  const { user } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<Order | null>(null)
  const [voiding, setVoiding] = useState(false)

  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [dateMode, setDateMode] = useState<DateMode>("all")
  const [datePick, setDatePick] = useState("") // value for the active mode's picker
  const [paymentType, setPaymentType] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc") // newest first
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [totalAmount, setTotalAmount] = useState<number | undefined>(undefined)
  const isFirstLoad = useRef(true)

  function switchMode(mode: DateMode) {
    setDateMode(mode)
    const now = new Date()
    if (mode === "month") setDatePick(toMonthStr(now))
    else if (mode === "week")  setDatePick(toWeekStr(now))
    else if (mode === "day")   setDatePick(toDateStr(now))
    else setDatePick("")
  }

  const [viewTarget, setViewTarget] = useState<Order | null>(null)

  // Debounce search so we don't fire a request on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => { setPage(1) }, [debouncedQuery, dateMode, datePick, paymentType, sortKey, sortDir, pageSize])

  const fetchOrders = useCallback(async () => {
    if (isFirstLoad.current) setLoading(true)
    setError(null)
    try {
      let from: string | undefined
      let to: string | undefined
      if (datePick) {
        let range: [Date, Date] | null = null
        if (dateMode === "month") range = monthRange(datePick)
        else if (dateMode === "week") range = weekRange(datePick)
        else if (dateMode === "day") range = dayRange(datePick)
        if (range) {
          from = range[0].toISOString()
          to = range[1].toISOString()
        }
      }
      const res = await ordersApi.list({
        page, limit: pageSize,
        q: debouncedQuery || undefined,
        from, to,
        paymentType: paymentType || undefined,
        sortKey, sortDir,
      })
      setOrders(res.data)
      setTotal(res.total)
      setTotalPages(res.totalPages)
      setTotalAmount(res.totalAmount)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load orders")
    } finally {
      setLoading(false)
      isFirstLoad.current = false
    }
  }, [page, pageSize, debouncedQuery, dateMode, datePick, paymentType, sortKey, sortDir])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  async function handleVoid() {
    if (!voidTarget) return
    setVoiding(true)
    try {
      const updated = await ordersApi.void(voidTarget._id)
      setOrders((prev) => prev.map((o) => (o._id === updated._id ? updated : o)))
      setVoidTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to void order")
      setVoidTarget(null)
    } finally {
      setVoiding(false)
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "date" ? "desc" : "asc")
    }
  }


  const isFiltering = query.trim() !== "" || dateMode !== "all" || paymentType !== ""

  return (
    <PageShell>
      <PageHeader title="Order History" />

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <EmptyState>Loading…</EmptyState>
      ) : total === 0 && !isFiltering ? (
        <EmptyState>No orders yet — place one from the New Order screen.</EmptyState>
      ) : (
        <>
          <Toolbar count={`${total} order${total === 1 ? "" : "s"}`}>
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="Search by cashier, product, or order #…"
            />
            <div className="flex items-center gap-2">
              {/* Mode pills */}
              <div className="flex gap-1">
                {(["all", "day", "week", "month"] as DateMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => switchMode(m)}
                    className={
                      "h-10 cursor-pointer rounded-lg px-3 text-sm font-medium capitalize transition " +
                      (dateMode === m
                        ? "bg-[var(--accent)] text-white"
                        : "border border-[var(--border)] text-[var(--text)] hover:bg-[var(--social-bg)] hover:text-[var(--text-h)]")
                    }
                  >
                    {m === "all" ? "All" : m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>

              {/* Calendar picker — changes type based on active mode */}
              {dateMode === "month" && (
                <input
                  type="month"
                  value={datePick}
                  max={toMonthStr(new Date())}
                  onChange={(e) => setDatePick(e.target.value)}
                  className="h-10 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text-h)] outline-none transition focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                />
              )}
              {dateMode === "week" && (
                <input
                  type="week"
                  value={datePick}
                  max={toWeekStr(new Date())}
                  onChange={(e) => setDatePick(e.target.value)}
                  className="h-10 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text-h)] outline-none transition focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                />
              )}
              {dateMode === "day" && (
                <input
                  type="date"
                  value={datePick}
                  max={toDateStr(new Date())}
                  onChange={(e) => setDatePick(e.target.value)}
                  className="h-10 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text-h)] outline-none transition focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                />
              )}

              {/* Payment filter — secondary, after date */}
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                className="h-10 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text-h)] outline-none transition focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <option value="">All payments</option>
                <option value="cash">Cash</option>
                <option value="gcash">GCash</option>
                <option value="staff_meal">Staff meal</option>
              </select>
            </div>
          </Toolbar>

          {user?.role === "admin" && paymentType === "staff_meal" && (
            <div className="mb-3 flex items-center justify-between rounded-lg border border-[var(--border)] border-l-4 border-l-purple-500 bg-[var(--surface)] px-4 py-3 text-sm">
              <div className="flex items-center gap-2.5">
                <StaffMealBadge />
                <span className="text-[var(--text)]">{total} meal{total === 1 ? "" : "s"} recorded</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text)]">No charge</span>
                <span className="font-semibold tabular-nums text-purple-600">₱0.00</span>
              </div>
            </div>
          )}
          {user?.role === "admin" && totalAmount !== undefined && paymentType !== "staff_meal" && (
            <div className={`mb-3 flex items-center justify-between rounded-lg border border-[var(--border)] border-l-4 bg-[var(--surface)] px-4 py-3 text-sm ${paymentType === "gcash" ? "border-l-blue-500" : "border-l-emerald-500"}`}>
              <div className="flex items-center gap-2.5">
                <PaymentBadge method={paymentType as "cash" | "gcash"} />
                <span className="text-[var(--text)]">{total} order{total === 1 ? "" : "s"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text)]">Total collected</span>
                <span className="font-semibold tabular-nums text-[var(--text-h)]">
                  ₱{totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}

          {total === 0 ? (
            <EmptyState>
              No orders{dateMode !== "all" ? ` for the selected ${dateMode}` : ""}
              {query ? ` matching "${query}"` : ""}.
            </EmptyState>
          ) : (
            <>
            {/* Mobile: card list (a fixed-column table can't fit a date + cashier + items row on a phone) */}
            <div className="flex flex-col gap-3 sm:hidden">
              {orders.map((o) => {
                const voided = o.status === "voided"
                const staffMeal = o.orderType === "staff_meal"
                return (
                  <div
                    key={o._id}
                    onClick={() => setViewTarget(o)}
                    className={`cursor-pointer rounded-xl border border-[var(--border)] p-4 transition-colors active:bg-[var(--social-bg)] ${voided ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--text-h)]">{formatDate(o.createdAt)}</p>
                        <p className="flex items-center gap-1.5 text-xs text-[var(--text)]">
                          {orderLabel(o)}
                          {o.tableNumber != null && <TableBadge n={o.tableNumber} />}
                          {voided && (
                            <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-500">
                              Voided
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className={`font-semibold tabular-nums ${voided ? "line-through text-[var(--text-h)]" : staffMeal ? "text-purple-600" : "text-[var(--text-h)]"}`}>
                          ₱{o.total.toFixed(2)}
                        </span>
                        <TypeBadge order={o} />
                      </div>
                    </div>

                    <p className="mt-2 text-sm text-[var(--text)]">{o.cashierName ?? "—"}</p>
                    {o.staffMealRecipient && (
                      <p className="text-xs text-purple-600">For: {o.staffMealRecipient}</p>
                    )}

                    <div className="mt-2">
                      <ItemsList items={o.items} />
                    </div>

                    <div className="mt-3 flex justify-end gap-1 border-t border-[var(--border)] pt-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); setViewTarget(o) }}
                        title="View receipt"
                        aria-label="View receipt"
                        className={iconBtnCls}
                      >
                        <EyeIcon />
                      </button>
                      {user?.role === "admin" && !voided && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setVoidTarget(o) }}
                          title="Void order"
                          aria-label="Void order"
                          className={iconBtnDangerCls}
                        >
                          <BanIcon />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop / tablet: table */}
            <div className="hidden sm:block">
              <TableCard>
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                    <SortTh label="Date"    col="date"    className="w-56" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Cashier" col="cashier" className="w-36" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Payment" col="payment" className="w-24" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-[var(--text)]">Items</th>
                    <SortTh label="Total"   col="total"   align="right" className="w-32" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <th className="w-16 px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const voided = o.status === "voided"
                    const staffMeal = o.orderType === "staff_meal"
                    return (
                    <tr
                      key={o._id}
                      onClick={() => setViewTarget(o)}
                      className={
                        "cursor-pointer border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--social-bg)] " +
                        (voided ? "opacity-50" : "")
                      }
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-[var(--text-h)]">{formatDate(o.createdAt)}</span>
                        <span className="flex items-center gap-1.5 text-xs text-[var(--text)]">
                          {orderLabel(o)}
                          {o.tableNumber != null && <TableBadge n={o.tableNumber} />}
                          {voided && (
                            <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-500">
                              Voided
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[var(--text)]">{o.cashierName ?? "—"}</span>
                        {o.staffMealRecipient && (
                          <span className="block text-xs text-purple-600">For: {o.staffMealRecipient}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <TypeBadge order={o} />
                      </td>
                      <td className="px-4 py-3">
                        <ItemsList items={o.items} />
                      </td>
                      <td className={`px-4 py-3 text-right font-medium tabular-nums ${voided ? "line-through text-[var(--text-h)]" : staffMeal ? "text-purple-600" : "text-[var(--text-h)]"}`}>
                        ₱{o.total.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setViewTarget(o) }}
                            title="View receipt"
                            aria-label="View receipt"
                            className={iconBtnCls}
                          >
                            <EyeIcon />
                          </button>
                          {user?.role === "admin" && !voided && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setVoidTarget(o) }}
                              title="Void order"
                              aria-label="Void order"
                              className={iconBtnDangerCls}
                            >
                              <BanIcon />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </TableCard>
            </div>
            <Paginator page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPage={setPage} onPageSize={(n) => setPageSize(n)} />
            </>
          )}
        </>
      )}

      {/* Receipt detail modal */}
      <Modal
        open={!!viewTarget}
        onClose={() => setViewTarget(null)}
        title={viewTarget ? `Order ${orderLabel(viewTarget)}` : "Order"}
      >
        {viewTarget && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4 text-sm text-[var(--text)]">
              <div className="flex flex-col items-start gap-1">
                <span>{formatDate(viewTarget.createdAt)}</span>
                <div className="flex items-center gap-1.5">
                  <TypeBadge order={viewTarget} />
                  {viewTarget.tableNumber != null && <TableBadge n={viewTarget.tableNumber} />}
                </div>
              </div>
              <span className="shrink-0">Cashier: <span className="text-[var(--text-h)]">{viewTarget.cashierName ?? "—"}</span></span>
            </div>

            {viewTarget.orderType === "staff_meal" && viewTarget.status !== "voided" && (
              <div className="rounded-lg bg-purple-500/10 px-3 py-2 text-sm text-purple-600">
                Staff meal — no charge, stock deducted
                {viewTarget.staffMealRecipient && (
                  <span className="block font-medium">For: {viewTarget.staffMealRecipient}</span>
                )}
              </div>
            )}

            {viewTarget.status === "voided" && (
              <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">
                Voided{viewTarget.voidedByName ? ` by ${viewTarget.voidedByName}` : ""}
                {viewTarget.voidedAt ? ` · ${formatDate(viewTarget.voidedAt)}` : ""}
              </div>
            )}

            <ul className="flex flex-col gap-2 border-y border-[var(--border)] py-3">
              {viewTarget.items.map((i, idx) => (
                <li key={idx} className="flex items-baseline gap-3">
                  <span className="min-w-0 flex-1 truncate text-[var(--text-h)]">{i.name}</span>
                  <span className="shrink-0 text-sm tabular-nums text-[var(--text)]">
                    {i.quantity} × ₱{i.price.toFixed(2)}
                  </span>
                  <span className="w-20 shrink-0 text-right tabular-nums text-[var(--text-h)]">
                    ₱{(i.lineTotal ?? i.price * i.quantity).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex items-baseline justify-between">
              <span className="text-sm text-[var(--text)]">
                Total · {itemCount(viewTarget)} item{itemCount(viewTarget) === 1 ? "" : "s"}
              </span>
              <span className="text-xl font-semibold tabular-nums text-[var(--text-h)]">
                ₱{viewTarget.total.toFixed(2)}
              </span>
            </div>

            {user?.role === "admin" && viewTarget.status !== "voided" && (
              <div className="flex justify-end">
                <button
                  onClick={() => { setVoidTarget(viewTarget); setViewTarget(null) }}
                  className={btnDangerCls}
                >
                  Void order
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Void confirmation modal */}
      <Modal open={!!voidTarget} onClose={() => setVoidTarget(null)} title="Void order?">
        <p className="text-[var(--text)]">
          This will void order{" "}
          <span className="font-medium text-[var(--text-h)]">{voidTarget ? orderLabel(voidTarget) : ""}</span>
          {" "}and restore its items back to stock. This cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setVoidTarget(null)} className={btnOutlineCls}>
            Cancel
          </button>
          <button onClick={handleVoid} disabled={voiding} className={btnDangerCls}>
            {voiding ? "Voiding…" : "Void order"}
          </button>
        </div>
      </Modal>
    </PageShell>
  )
}
