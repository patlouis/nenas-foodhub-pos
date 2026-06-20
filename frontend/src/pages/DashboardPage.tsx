import { useEffect, useMemo, useState } from "react"
import type { Order, Product, Category } from "../types"
import { ordersApi, productsApi, categoriesApi } from "../api"
import { ErrorBanner, PageShell } from "../components/ui"

type DateMode = "day" | "week" | "month"

// ---- date helpers (mirrors OrderHistoryPage) ----
function toDateStr(d: Date)  { return d.toLocaleDateString("sv") }
function toMonthStr(d: Date) { return d.toLocaleDateString("sv").slice(0, 7) }
function toWeekStr(d: Date): string {
  const t = new Date(d)
  t.setHours(0, 0, 0, 0)
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7))
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

function getRange(mode: DateMode, pick: string): [Date, Date] {
  if (mode === "day")   return dayRange(pick)
  if (mode === "week")  return weekRange(pick)
  return monthRange(pick)
}

function getPrevRange(mode: DateMode, from: Date): [Date, Date] {
  if (mode === "day") {
    const d = new Date(from.getTime() - 86400000)
    return dayRange(toDateStr(d))
  }
  if (mode === "week") {
    const d = new Date(from.getTime() - 7 * 86400000)
    return weekRange(toWeekStr(d))
  }
  const d = new Date(from)
  d.setMonth(d.getMonth() - 1)
  return monthRange(toMonthStr(d))
}

function inRange(o: Order, from: Date, to: Date): boolean {
  if (!o.createdAt) return false
  const d = new Date(o.createdAt)
  return d >= from && d <= to
}

function periodLabel(mode: DateMode, pick: string): string {
  if (!pick) return ""
  if (mode === "day") {
    return new Date(pick + "T12:00:00").toLocaleDateString("en", {
      month: "long", day: "numeric", year: "numeric",
    })
  }
  if (mode === "week") {
    const [from, to] = weekRange(pick)
    return `${from.toLocaleDateString("en", { month: "short", day: "numeric" })} – ${to.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}`
  }
  return new Date(pick + "-02").toLocaleDateString("en", { month: "long", year: "numeric" })
}

const PREV_LABEL: Record<DateMode, string> = {
  day:   "vs prev day",
  week:  "vs prev week",
  month: "vs prev month",
}

// ---- format helpers ----
function fmtMoney(n: number) {
  return `₱${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtPct(cur: number, prev: number): number | undefined {
  if (cur === 0 && prev === 0) return undefined
  if (prev === 0) return 100
  return ((cur - prev) / prev) * 100
}
function lt(item: Order["items"][number]): number {
  return item.lineTotal ?? item.price * item.quantity
}

// ---- sub-components ----

function KpiCard({
  label, value, trend, note,
}: {
  label: string
  value: string
  trend?: number
  note?: string
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text)]">{label}</p>
      <p className="text-[1.65rem] font-bold leading-none tabular-nums text-[var(--text-h)]">{value}</p>
      {(trend !== undefined || note) && (
        <p className="flex items-center gap-1.5 text-xs text-[var(--text)]">
          {trend !== undefined && (
            <span className={`font-semibold ${trend >= 0 ? "text-green-600" : "text-red-500"}`}>
              {trend >= 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(1)}%
            </span>
          )}
          {note}
        </p>
      )}
    </div>
  )
}

function BarChart({
  data,
  height = 140,
  color = "var(--accent)",
  valueFmt,
  labelStep = 1,
  barMaxW,
  rotateLabels = false,
  showValues = false,
  maxLabels,
  minWidth,
}: {
  data: { label: string; value: number }[]
  height?: number
  color?: string
  valueFmt?: (v: number) => string
  labelStep?: number
  barMaxW?: number
  rotateLabels?: boolean
  showValues?: boolean
  maxLabels?: number
  minWidth?: number
}) {
  const max = Math.max(...data.map((d) => d.value), 1)
  // When showing value labels above bars, cap bar scale at 55% so labels have room
  const maxPct = showValues ? 55 : 100

  // Indices of bars that get a value label (top N by value)
  const labelSet = useMemo(() => {
    if (!showValues || !maxLabels) return null
    const ranked = data
      .map((d, i) => ({ v: d.value, i }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, maxLabels)
    return new Set(ranked.map((x) => x.i))
  }, [data, showValues, maxLabels])

  return (
    <div className="flex items-end gap-0.5" style={{ height, minWidth }}>
      {data.map((d, i) => {
        const showLabel = showValues && d.value > 0 && (!labelSet || labelSet.has(i))
        return (
          <div
            key={i}
            title={valueFmt ? `${d.label}: ${valueFmt(d.value)}` : `${d.label}: ${d.value}`}
            className="flex h-full flex-1 flex-col items-center gap-1"
          >
            <div className="flex w-full flex-1 flex-col justify-end">
              <div
                className="relative rounded-t-sm transition-all"
                style={{
                  height: `${Math.max((d.value / max) * maxPct, d.value > 0 ? 2 : 0.5)}%`,
                  backgroundColor: color,
                  opacity: d.value > 0 ? 0.82 : 0.12,
                  width: barMaxW ? `min(100%, ${barMaxW}px)` : "100%",
                  margin: "0 auto",
                }}
              >
                {showLabel && (
                  rotateLabels ? (
                    <span
                      className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-[8px] leading-tight text-[var(--text)]"
                      style={{ writingMode: "vertical-lr" }}
                    >
                      {valueFmt ? valueFmt(d.value) : String(d.value)}
                    </span>
                  ) : (
                    <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap text-[9px] leading-tight text-[var(--text)]">
                      {valueFmt ? valueFmt(d.value) : String(d.value)}
                    </span>
                  )
                )}
              </div>
            </div>
            {rotateLabels ? (
              <span
                className="h-7 shrink-0 text-center text-[9px] leading-tight text-[var(--text)]"
                style={{ writingMode: "vertical-lr" }}
              >
                {i % labelStep === 0 ? d.label : ""}
              </span>
            ) : (
              <span className="w-full truncate text-center text-[10px] leading-tight text-[var(--text)]">
                {i % labelStep === 0 ? d.label : ""}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function RankList({
  items,
  valueFmt = String,
  limit = 7,
}: {
  items: { label: string; value: number; sub?: string }[]
  valueFmt?: (v: number) => string
  limit?: number
}) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="flex flex-col gap-3">
      {items.slice(0, limit).map((item, i) => (
        <div key={i} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-[var(--text-h)]">{item.label}</span>
            <span className="shrink-0 tabular-nums text-[var(--text)]">{valueFmt(item.value)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--social-bg)]">
            <div
              className="h-full rounded-full bg-[var(--accent)]"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
          {item.sub && <p className="text-[11px] text-[var(--text)]">{item.sub}</p>}
        </div>
      ))}
    </div>
  )
}

// ---- main component ----

const inputCls =
  "h-10 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text-h)] outline-none transition focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-[var(--accent)]"

export default function DashboardPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateMode, setDateMode] = useState<DateMode>("day")
  const [datePick, setDatePick] = useState(() => toDateStr(new Date()))

  function switchMode(mode: DateMode) {
    setDateMode(mode)
    const now = new Date()
    if (mode === "day")        setDatePick(toDateStr(now))
    else if (mode === "week")  setDatePick(toWeekStr(now))
    else if (mode === "month") setDatePick(toMonthStr(now))
  }

  useEffect(() => {
    ;(async () => {
      try {
        // Analytics need the full history/catalog, not one page of it.
        const [o, p, c] = await Promise.all([
          ordersApi.list({ limit: 1000 }),
          productsApi.list({ limit: 500 }),
          categoriesApi.list(),
        ])
        setOrders(o.data)
        setProducts(p.data)
        setCategories(c)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard")
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const [curFrom, curTo] = useMemo(
    () => (datePick ? getRange(dateMode, datePick) : [new Date(0), new Date()]),
    [dateMode, datePick],
  )
  const [prvFrom, prvTo] = useMemo(
    () => getPrevRange(dateMode, curFrom),
    [dateMode, curFrom],
  )

  // Voided orders never happened — exclude them from every metric below.
  const activeOrders = useMemo(() => orders.filter((o) => o.status !== "voided"), [orders])

  const curOrders = useMemo(
    () => activeOrders.filter((o) => inRange(o, curFrom, curTo)),
    [activeOrders, curFrom, curTo],
  )
  const prvOrders = useMemo(
    () => activeOrders.filter((o) => inRange(o, prvFrom, prvTo)),
    [activeOrders, prvFrom, prvTo],
  )

  // KPIs
  const curRevenue   = useMemo(() => curOrders.reduce((s, o) => s + o.total, 0), [curOrders])
  const prvRevenue   = useMemo(() => prvOrders.reduce((s, o) => s + o.total, 0), [prvOrders])
  const curItemsSold = useMemo(
    () => curOrders.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.quantity, 0), 0),
    [curOrders],
  )

  // Profit — uses current costPrice from product catalog (not snapshotted on orders)
  const costByName = useMemo(
    () => new Map(products.map((p) => [p.name, p.costPrice ?? null])),
    [products],
  )
  const calcProfit = (orderList: Order[]) =>
    orderList.reduce((sum, o) => {
      for (const item of o.items) {
        const cost = costByName.get(item.name)
        if (cost != null) sum += lt(item) - cost * item.quantity
      }
      return sum
    }, 0)
  const curProfit = useMemo(() => calcProfit(curOrders), [curOrders, costByName])
  const prvProfit = useMemo(() => calcProfit(prvOrders), [prvOrders, costByName])
  const missingCostCount = useMemo(
    () => products.filter((p) => p.costPrice == null && p.status !== "disabled").length,
    [products],
  )

  // Revenue trend — adapts to selected mode
  const revenueTrend = useMemo(() => {
    if (!datePick) return []
    if (dateMode === "day") {
      const hourLabel = (h: number) =>
        h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`
      const indices = [...Array.from({ length: 18 }, (_, i) => i + 6), 0]
      return indices.map((h) => {
        const value = curOrders
          .filter((o) => o.createdAt && new Date(o.createdAt).getHours() === h)
          .reduce((s, o) => s + o.total, 0)
        return { label: hourLabel(h), value }
      })
    }
    if (dateMode === "week") {
      const [wFrom] = weekRange(datePick)
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      return Array.from({ length: 7 }, (_, i) => {
        const from = new Date(wFrom.getTime() + i * 86400000)
        from.setHours(0, 0, 0, 0)
        const to = new Date(from.getTime() + 86400000 - 1)
        const value = activeOrders
          .filter((o) => o.createdAt && inRange(o, from, to))
          .reduce((s, o) => s + o.total, 0)
        return { label: days[i], value }
      })
    }
    // month: one bar per calendar day
    const [mFrom, mTo] = monthRange(datePick)
    const daysInMonth = mTo.getDate()
    return Array.from({ length: daysInMonth }, (_, i) => {
      const from = new Date(mFrom)
      from.setDate(i + 1)
      from.setHours(0, 0, 0, 0)
      const to = new Date(from)
      to.setHours(23, 59, 59, 999)
      const value = activeOrders
        .filter((o) => o.createdAt && inRange(o, from, to))
        .reduce((s, o) => s + o.total, 0)
      return { label: String(i + 1), value }
    })
  }, [dateMode, datePick, curOrders, activeOrders])

  const trendTitle = dateMode === "day" ? "Hourly Revenue" : "Daily Revenue"

  // Top products
  const topProducts = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number }>()
    for (const o of curOrders) {
      for (const item of o.items) {
        const e = map.get(item.name) ?? { qty: 0, revenue: 0 }
        map.set(item.name, { qty: e.qty + item.quantity, revenue: e.revenue + lt(item) })
      }
    }
    return [...map.entries()]
      .sort((a, b) => b[1].qty - a[1].qty)
      .map(([name, d]) => ({ label: name, value: d.qty, sub: `${fmtMoney(d.revenue)} revenue` }))
  }, [curOrders])

  // Category breakdown — qty sold + revenue
  const categoryRevenue = useMemo(() => {
    const catIdMap = new Map(categories.map((c) => [c._id, c.name]))
    const catByProductName = new Map(
      products.map((p) => [p.name, p.category ? (catIdMap.get(p.category) ?? "Other") : "Other"])
    )
    const map = new Map<string, { qty: number; revenue: number }>()
    for (const o of curOrders) {
      for (const item of o.items) {
        const cat = catByProductName.get(item.name) ?? "Other"
        const e = map.get(cat) ?? { qty: 0, revenue: 0 }
        map.set(cat, { qty: e.qty + item.quantity, revenue: e.revenue + lt(item) })
      }
    }
    return [...map.entries()]
      .sort((a, b) => b[1].qty - a[1].qty)
      .map(([label, d]) => ({ label, value: d.qty, sub: `${fmtMoney(d.revenue)} revenue` }))
  }, [curOrders, products, categories])

  // Peak hours — always all-time for enough signal
  const peakHours = useMemo(() => {
    const buckets = new Array<number>(24).fill(0)
    for (const o of activeOrders) {
      if (!o.createdAt) continue
      buckets[new Date(o.createdAt).getHours()]++
    }
    const hourLabel = (h: number) =>
      h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`
    const indices = [...Array.from({ length: 18 }, (_, i) => i + 6), 0]
    return indices.map((h) => ({ label: hourLabel(h), value: buckets[h] }))
  }, [activeOrders])

  // Inventory alerts
  const outOfStock = useMemo(
    () => products.filter((p) => p.stock === 0 && p.status !== "disabled"),
    [products],
  )
  const lowStock = useMemo(
    () =>
      products
        .filter((p) => p.stock > 0 && p.stock <= 5 && p.status !== "disabled")
        .sort((a, b) => a.stock - b.stock),
    [products],
  )

  // Recent orders within selected period
  const recentOrders = useMemo(() => curOrders.slice(0, 5), [curOrders])

  if (loading) {
    return (
      <PageShell>
        <div className="flex h-64 items-center justify-center text-[var(--text)]">Loading dashboard…</div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0">Dashboard</h1>
          <p className="mt-0.5 text-sm text-[var(--text)]">{periodLabel(dateMode, datePick)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mode pills */}
          <div className="flex gap-1">
            {(["day", "week", "month"] as DateMode[]).map((m) => (
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
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          {/* Calendar picker — type changes with mode */}
          {dateMode === "day" && (
            <input
              type="date"
              value={datePick}
              max={toDateStr(new Date())}
              onChange={(e) => setDatePick(e.target.value)}
              className={inputCls}
            />
          )}
          {dateMode === "week" && (
            <input
              type="week"
              value={datePick}
              max={toWeekStr(new Date())}
              onChange={(e) => setDatePick(e.target.value)}
              className={inputCls}
            />
          )}
          {dateMode === "month" && (
            <input
              type="month"
              value={datePick}
              max={toMonthStr(new Date())}
              onChange={(e) => setDatePick(e.target.value)}
              className={inputCls}
            />
          )}
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* KPI row */}
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          label="Revenue"
          value={fmtMoney(curRevenue)}
          trend={fmtPct(curRevenue, prvRevenue)}
          note={PREV_LABEL[dateMode]}
        />
        <KpiCard
          label="Profit"
          value={fmtMoney(curProfit)}
          trend={fmtPct(curProfit, prvProfit)}
          note={missingCostCount > 0 ? `${missingCostCount} missing cost` : PREV_LABEL[dateMode]}
        />
        <KpiCard
          label="Orders"
          value={String(curOrders.length)}
          trend={fmtPct(curOrders.length, prvOrders.length)}
          note={PREV_LABEL[dateMode]}
        />
        <KpiCard
          label="Items Sold"
          value={String(curItemsSold)}
          note={`across ${curOrders.length} order${curOrders.length === 1 ? "" : "s"}`}
        />
      </div>

      {/* Revenue trend + top products */}
      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-3">
          <p className="mb-4 text-sm font-semibold text-[var(--text-h)]">
            {trendTitle}{" "}
            <span className="font-normal text-[var(--text)]">· {periodLabel(dateMode, datePick)}</span>
          </p>
          {revenueTrend.every((d) => d.value === 0) ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-[var(--text)]">
              No sales for this period
            </div>
          ) : dateMode === "day" ? (
            <BarChart data={revenueTrend} valueFmt={fmtMoney} height={220} barMaxW={8} rotateLabels showValues />
          ) : dateMode === "month" ? (
            <div className="overflow-x-auto">
              <BarChart data={revenueTrend} valueFmt={fmtMoney} height={220} barMaxW={10} rotateLabels showValues maxLabels={5} minWidth={560} />
            </div>
          ) : (
            <BarChart data={revenueTrend} valueFmt={fmtMoney} height={200} showValues />
          )}
        </div>

        <div className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-2 lg:max-h-[296px]">
          <p className="mb-4 shrink-0 text-sm font-semibold text-[var(--text-h)]">
            Best Sellers{" "}
            <span className="font-normal text-[var(--text)]">· {periodLabel(dateMode, datePick)}</span>
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {topProducts.length === 0 ? (
              <p className="text-sm text-[var(--text)]">No orders yet for this period.</p>
            ) : (
              <RankList items={topProducts} valueFmt={(v) => `${v} sold`} />
            )}
          </div>
        </div>
      </div>

      {/* Peak hours + category */}
      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-3">
          <p className="mb-4 text-sm font-semibold text-[var(--text-h)]">
            Peak Hours{" "}
            <span className="font-normal text-[var(--text)]">· all time</span>
          </p>
          {peakHours.every((h) => h.value === 0) ? (
            <div className="flex h-[160px] items-center justify-center text-sm text-[var(--text)]">
              No data yet
            </div>
          ) : (
            <BarChart data={peakHours} valueFmt={(v) => `${v} orders`} height={160} barMaxW={8} rotateLabels />
          )}
        </div>

        <div className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-2 lg:max-h-[236px]">
          <p className="mb-4 shrink-0 text-sm font-semibold text-[var(--text-h)]">
            By Category{" "}
            <span className="font-normal text-[var(--text)]">· {periodLabel(dateMode, datePick)}</span>
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {categoryRevenue.length === 0 ? (
              <p className="text-sm text-[var(--text)]">No orders yet for this period.</p>
            ) : (
              <RankList items={categoryRevenue} valueFmt={(v) => `${v} sold`} />
            )}
          </div>
        </div>
      </div>

      {/* Inventory alerts + recent orders */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-4 flex items-center gap-2">
            <p className="text-sm font-semibold text-[var(--text-h)]">Stock Alerts</p>
            {(outOfStock.length > 0 || lowStock.length > 0) && (
              <span className="rounded-full bg-yellow-400/20 px-2 py-0.5 text-xs font-medium text-yellow-600">
                {outOfStock.length + lowStock.length} item{outOfStock.length + lowStock.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {outOfStock.length === 0 && lowStock.length === 0 ? (
            <p className="text-sm text-green-600">All products are well-stocked.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {outOfStock.map((p) => {
                const catName = p.category ? categories.find((c) => c._id === p.category)?.name : undefined
                return (
                  <div key={p._id} className="flex items-center justify-between rounded-lg bg-red-500/10 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-h)]">{p.name}</p>
                      {catName && <p className="text-xs text-[var(--text)]">{catName}</p>}
                    </div>
                    <span className="text-sm font-semibold text-red-500">Out of stock</span>
                  </div>
                )
              })}
              {lowStock.map((p) => {
                const catName = p.category ? categories.find((c) => c._id === p.category)?.name : undefined
                return (
                  <div key={p._id} className="flex items-center justify-between rounded-lg bg-yellow-400/10 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-h)]">{p.name}</p>
                      {catName && <p className="text-xs text-[var(--text)]">{catName}</p>}
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-yellow-600">{p.stock} left</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="mb-4 text-sm font-semibold text-[var(--text-h)]">Recent Orders</p>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-[var(--text)]">No orders for this period.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentOrders.map((o) => (
                <div key={o._id} className="flex items-center gap-3 rounded-lg bg-[var(--social-bg)] px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--text-h)]">
                      {o.orderNumber != null
                        ? `#${String(o.orderNumber).padStart(4, "0")}`
                        : `#${o._id.slice(-4)}`}
                      {o.cashierName && (
                        <span className="ml-2 text-xs font-normal text-[var(--text)]">
                          by {o.cashierName}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-[var(--text)]">
                      {o.items
                        .slice(0, 2)
                        .map((i) => `${i.quantity}× ${i.name}`)
                        .join(", ")}
                      {o.items.length > 2 && ` +${o.items.length - 2} more`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular-nums font-semibold text-[var(--text-h)]">
                      ₱{o.total.toFixed(2)}
                    </p>
                    <p className="text-[11px] text-[var(--text)]">
                      {o.createdAt
                        ? new Date(o.createdAt).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  )
}
