import { useEffect, useMemo, useRef, useState } from "react"
import type { Order, OrderSummary, Product, Category, StockAdjustment, Expense, SummaryItemRow } from "../types"
import { wastageReasonLabel, orderItemLabel } from "../types"
import { ordersApi, productsApi, categoriesApi, stockAdjustmentsApi, expensesApi } from "../api"
import { ErrorBanner, PageShell, SearchBox, selectDenseCls } from "../components/ui"
import { hasStock } from "../stock"

import {
  BUSINESS_DAY_CUTOFF_HOUR,
  toDateStr, toMonthStr, toWeekStr,
  currentBusinessDate, nowBusiness,
  dayRange, weekRange, monthRange,
} from "../utils/dateHelpers"

type DateMode = "all" | "day" | "week" | "month"

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

function inRangeExpense(e: Expense, from: Date, to: Date): boolean {
  const d = new Date(e.date)
  return d >= from && d <= to
}

function periodLabel(mode: DateMode, pick: string): string {
  if (mode === "all") return "All time"
  if (!pick) return ""
  if (mode === "day") {
    return new Date(pick + "T12:00:00").toLocaleDateString("en", {
      month: "long", day: "numeric", year: "numeric",
    })
  }
  if (mode === "week") {
    const [from] = weekRange(pick)
    // Display the Mon–Sun calendar span even though the window starts at the
    // cutoff (the business-week boundary sits at 04:00 on those dates).
    const sun = new Date(from.getTime() + 6 * 86400000)
    return `${from.toLocaleDateString("en", { month: "short", day: "numeric" })} – ${sun.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}`
  }
  return new Date(pick + "-02").toLocaleDateString("en", { month: "long", year: "numeric" })
}

// Which bucket the trend chart asks the server for in each view.
const TREND_BUCKET: Record<DateMode, "hour" | "day" | "month"> = {
  all:   "month",
  day:   "hour",
  week:  "day",
  month: "day",
}

const PREV_LABEL: Record<DateMode, string> = {
  all:   "",
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
  selectedIndex = null,
  onSelectIndex,
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
  /** Index of the bar to highlight, or null. Pairs with onSelectIndex. */
  selectedIndex?: number | null
  /** Makes every bar tappable. Only a printed label or a hover tooltip could
   *  reveal a bar's value before, and a touch screen can produce neither. */
  onSelectIndex?: (index: number | null) => void
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
        const selected = selectedIndex === i
        const Bar = onSelectIndex ? "button" : "div"
        return (
          <Bar
            key={i}
            {...(onSelectIndex
              ? {
                  type: "button" as const,
                  // Tapping the selected bar again clears it, so the readout
                  // can be dismissed without hunting for a close control.
                  onClick: () => onSelectIndex(selected ? null : i),
                  "aria-pressed": selected,
                  "aria-label": valueFmt ? `${d.label}: ${valueFmt(d.value)}` : `${d.label}: ${d.value}`,
                }
              : {})}
            title={valueFmt ? `${d.label}: ${valueFmt(d.value)}` : `${d.label}: ${d.value}`}
            className={
              "flex h-full flex-1 flex-col items-center gap-1 bg-transparent p-0 " +
              (onSelectIndex ? "cursor-pointer focus-visible:outline-none" : "")
            }
          >
            <div className="flex w-full flex-1 flex-col justify-end">
              <div
                className="relative rounded-t-sm transition-all"
                style={{
                  height: `${Math.max((d.value / max) * maxPct, d.value > 0 ? 2 : 0.5)}%`,
                  backgroundColor: color,
                  // The selected bar goes fully opaque rather than changing
                  // colour, so it reads as the same series, just picked out.
                  opacity: selected ? 1 : d.value > 0 ? 0.82 : 0.12,
                  outline: selected ? "2px solid var(--accent)" : undefined,
                  outlineOffset: selected ? "1px" : undefined,
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
          </Bar>
        )
      })}
    </div>
  )
}

function RankList({
  items,
  valueFmt = String,
}: {
  items: { label: string; value: number; sub?: string }[]
  valueFmt?: (v: number) => string
}) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1">
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

// A native <select> pops its list wherever the browser decides — upward when
// it judges there's more room above, which happens once this card sits low in
// a tablet viewport. This renders the menu itself, anchored with top-full, so
// it always drops downward. Trade-off: no OS picker on touch devices.
function CategoryFilter({
  value, onChange, options,
}: {
  value: string
  onChange: (next: string) => void
  options: string[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  return (
    <div ref={ref} className="relative min-w-0 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filter by category"
        className={`${selectDenseCls} flex max-w-[9.5rem] items-center gap-1.5`}
      >
        <span className="truncate">{value || "All categories"}</span>
        <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3 shrink-0 opacity-70" aria-hidden>
          <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-20 mt-1 max-h-52 w-44 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg [scrollbar-width:thin]"
        >
          {["", ...options].map((opt) => (
            <button
              key={opt || "__all"}
              type="button"
              role="option"
              aria-selected={value === opt}
              onClick={() => { onChange(opt); setOpen(false) }}
              className={`block w-full cursor-pointer truncate rounded-md px-2.5 py-1.5 text-left text-xs transition ${
                value === opt
                  ? "bg-[var(--accent-bg)] font-medium text-[var(--accent)]"
                  : "text-[var(--text-h)] hover:bg-[var(--social-bg)]"
              }`}
            >
              {opt || "All categories"}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- main component ----

const inputCls =
  "h-10 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text-h)] outline-none transition focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-[var(--accent)]"

export default function DashboardPage() {
  const [summary, setSummary] = useState<OrderSummary | null>(null)
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [wastageAdjs, setWastageAdjs] = useState<StockAdjustment[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [peakHourCounts, setPeakHourCounts] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateMode, setDateMode] = useState<DateMode>("day")
  const [datePick, setDatePick] = useState(() => currentBusinessDate())
  const [stockAlertFilter, setStockAlertFilter] = useState<"all" | "out" | "low">("all")
  // By Product panel filters — narrow the list only, never the figures above it.
  const [productQuery, setProductQuery] = useState("")
  const [productCategory, setProductCategory] = useState("")
  // Which trend bar the reader has picked out. Only the top few bars print a
  // value and a tooltip needs a pointer, so on a phone or tablet this is the
  // only way to read the rest.
  const [trendPick, setTrendPick] = useState<number | null>(null)

  function switchMode(mode: DateMode) {
    setDateMode(mode)
    if (mode === "day")        setDatePick(currentBusinessDate())
    else if (mode === "week")  setDatePick(toWeekStr(nowBusiness()))
    else if (mode === "month") setDatePick(toMonthStr(nowBusiness()))
    else                       setDatePick("")
  }

  const [curFrom, curTo] = useMemo(
    () => (datePick ? getRange(dateMode, datePick) : [new Date(0), new Date()]),
    [dateMode, datePick],
  )
  const [prvFrom, prvTo] = useMemo(
    () => dateMode === "all" ? [new Date(0), new Date(0)] : getPrevRange(dateMode, curFrom),
    [dateMode, curFrom],
  )

  // Catalog and all-time figures don't depend on the selected period.
  useEffect(() => {
    ;(async () => {
      try {
        const [p, c, ph] = await Promise.all([
          productsApi.list({ limit: 500 }),
          categoriesApi.list(),
          ordersApi.peakHours(Intl.DateTimeFormat().resolvedOptions().timeZone),
        ])
        setProducts(p.data)
        setCategories(c)
        setPeakHourCounts(ph.hours)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard")
      }
    })()
  }, [])

  // Every order figure is aggregated by the server. Summing a page of orders in
  // the browser understated all of them once the shop passed the page limit,
  // and worse, each new order pushed an older one out of the window — so new
  // sales replaced old revenue rather than adding to it.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setRefreshing(true)
      const range = dateMode === "all" ? {} : { from: prvFrom.toISOString(), to: curTo.toISOString() }
      const period = dateMode === "all" ? {} : { from: curFrom.toISOString(), to: curTo.toISOString() }
      try {
        const [s, recent, w, ex] = await Promise.all([
          ordersApi.summary({
            ...period,
            ...(dateMode === "all" ? {} : { prevFrom: prvFrom.toISOString(), prevTo: prvTo.toISOString() }),
            bucket: TREND_BUCKET[dateMode],
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
          // The Recent Orders panel wants five rows, not a total — a page of
          // five is exactly right and can't truncate anything that matters.
          ordersApi.list({ limit: 5, ...period }),
          stockAdjustmentsApi.list({ type: "wastage", limit: 1000, ...range }),
          expensesApi.list({ limit: 1000, ...range }),
        ])
        if (cancelled) return
        setSummary(s)
        setRecentOrders(recent.data.filter((o) => o.status !== "voided" && o.orderType !== "staff_meal"))
        setWastageAdjs(w.data)
        setExpenses(ex.data)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load dashboard")
      } finally {
        // A stale response must not clear the spinner for the request that
        // superseded it.
        if (!cancelled) {
          setRefreshing(false)
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dateMode, curFrom, prvFrom, prvTo, curTo])

  // Voided and staff meal orders are excluded from every figure below — the
  // server leaves them out of the aggregate rather than the browser filtering
  // them after the fact.
  const cur = summary?.current
  const prv = summary?.previous

  const curExpenses = useMemo(() => {
    const active = expenses.filter((e) => !e.voided)
    if (dateMode === "all") return active
    return active.filter((e) => inRangeExpense(e, curFrom, curTo))
  }, [expenses, dateMode, curFrom, curTo])
  const curExpensesTotal = useMemo(() => curExpenses.reduce((s, e) => s + e.amount, 0), [curExpenses])


  // KPIs
  const curRevenue   = cur?.revenue ?? 0
  const prvRevenue   = prv?.revenue ?? 0
  const curItemsSold = cur?.itemsSold ?? 0
  const curOrderCount = cur?.orderCount ?? 0

  // Wastage — loss from written-off stock, from stock_adjustments collection.
  const curWastageAdjs = useMemo(
    () => wastageAdjs.filter((a) => {
      const d = new Date(a.createdAt)
      return !a.voided && d >= curFrom && d <= curTo
    }),
    [wastageAdjs, curFrom, curTo],
  )
  const curWastageCost = useMemo(
    () => curWastageAdjs.reduce((s, a) => s + (a.costPrice ?? 0) * a.quantity, 0),
    [curWastageAdjs],
  )

  // Profit — uses current costPrice from product catalog (not snapshotted on orders)
  const costByName = useMemo(
    () => new Map(products.map((p) => [p.name, p.costPrice ?? null])),
    [products],
  )
  // The server has already netted off every line that carried a cost snapshot.
  // What it can't do is the fallback: a line sold without one is costed from
  // the current catalog by name, and never for a half serving — the catalog
  // figure is the full portion's cost, so using it would report a wild loss on
  // every half.
  const fallbackCost = (row: SummaryItemRow) =>
    row.portion === "half" ? null : costByName.get(row.name) ?? null

  const calcProfit = (rows: SummaryItemRow[] | undefined) =>
    (rows ?? []).reduce((sum, row) => {
      sum += row.costedRevenue - row.costSum
      const uncostedQty = row.qty - row.costedQty
      if (uncostedQty > 0) {
        const cost = fallbackCost(row)
        if (cost != null) sum += row.revenue - row.costedRevenue - cost * uncostedQty
      }
      return sum
    }, 0)
  const curProfit = useMemo(() => calcProfit(cur?.items), [cur, costByName])
  const prvProfit = useMemo(() => calcProfit(prv?.items), [prv, costByName])
  // One entry per label that sold anything with no cost to apply at all.
  const missingCostCount = useMemo(
    () =>
      (cur?.items ?? []).filter(
        (row) => row.qty > row.costedQty && fallbackCost(row) == null,
      ).length,
    [cur, costByName],
  )

  // Revenue trend — adapts to selected mode
  const revenueTrend = useMemo(() => {
    // The server returns only buckets that saw sales; every view below lays out
    // its own axis and reads values off this map, so empty days still get a bar.
    const byKey = new Map((summary?.series ?? []).map((b) => [b.key, b.value]))
    const at = (key: string) => byKey.get(key) ?? 0

    if (dateMode === "all") {
      if (byKey.size === 0) return []
      // One bar per month from the first month with sales to now, so a quiet
      // month reads as a gap in the run rather than vanishing from the axis.
      const [firstYear, firstMonth] = [...byKey.keys()].sort()[0].split("-").map(Number)
      const bars: { label: string; value: number }[] = []
      const cursor = new Date(firstYear, firstMonth - 1, 1)
      const now = new Date()
      while (cursor <= now) {
        bars.push({
          label: cursor.toLocaleDateString("en", { month: "short", year: "2-digit" }),
          value: at(toMonthStr(cursor)),
        })
        cursor.setMonth(cursor.getMonth() + 1)
      }
      return bars
    }
    if (!datePick) return []
    if (dateMode === "day") {
      const hourLabel = (h: number) =>
        h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`
      // 6am→midnight operating window; the trailing 12am bar collects the whole
      // after-midnight closing tail (00:00 up to the cutoff), which still
      // belongs to this business day.
      const indices = [...Array.from({ length: 18 }, (_, i) => i + 6), 0]
      return indices.map((h) => ({
        label: hourLabel(h),
        value:
          h === 0
            ? Array.from({ length: BUSINESS_DAY_CUTOFF_HOUR }, (_, i) => at(String(i))).reduce((s, v) => s + v, 0)
            : at(String(h)),
      }))
    }
    if (dateMode === "week") {
      const [wFrom] = weekRange(datePick)
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      return Array.from({ length: 7 }, (_, i) => ({
        label: days[i],
        value: at(toDateStr(new Date(wFrom.getTime() + i * 86400000))),
      }))
    }
    // month: one bar per business day
    const [my, mm] = datePick.split("-").map(Number)
    const daysInMonth = new Date(my, mm, 0).getDate()
    return Array.from({ length: daysInMonth }, (_, i) => ({
      label: String(i + 1),
      value: at(`${datePick}-${String(i + 1).padStart(2, "0")}`),
    }))
  }, [dateMode, datePick, summary])

  const trendTitle = dateMode === "day" ? "Hourly Revenue" : dateMode === "all" ? "Monthly Revenue" : "Daily Revenue"

  // The pick is an index into the bars, so it can't outlive the bars it points
  // at — switching period would otherwise read out a stale day's takings.
  useEffect(() => { setTrendPick(null) }, [revenueTrend])
  const pickedBar = trendPick != null ? revenueTrend[trendPick] : undefined

  // Top products
  const topProducts = useMemo(() => {
    // The server groups by name and portion, which is the same split this list
    // wants: halves report as their own row because they sell at a different
    // price and margin, and folding them in would hide both. The raw product
    // name rides along because the category lookup is keyed on it — "Adobo
    // (Half)" would miss and fall into Other.
    return [...(cur?.items ?? [])]
      .sort((a, b) => b.qty - a.qty)
      .map((row) => ({
        label: orderItemLabel(row),
        name: row.name,
        value: row.qty,
        sub: `${fmtMoney(row.revenue)} revenue`,
      }))
  }, [cur])

  // Product name → category name. Order items carry a snapshot of the product
  // name, so anything since renamed or deleted falls through to "Other" —
  // the same bucket products with no category land in.
  const catByProductName = useMemo(() => {
    const catIdMap = new Map(categories.map((c) => [c._id, c.name]))
    return new Map(
      products.map((p) => [p.name, p.category ? (catIdMap.get(p.category) ?? "Other") : "Other"])
    )
  }, [products, categories])

  // Options stay keyed off the full category list rather than what happens to
  // have sold, so the dropdown doesn't reshuffle as the period changes.
  // "Other" only appears when something actually landed in that bucket.
  const productCategoryOptions = useMemo(() => {
    const names = categories.map((c) => c.name).sort((a, b) => a.localeCompare(b))
    const hasOther = topProducts.some((p) => (catByProductName.get(p.name) ?? "Other") === "Other")
    return hasOther ? [...names, "Other"] : names
  }, [categories, topProducts, catByProductName])

  const productsFiltered = productQuery.trim() !== "" || productCategory !== ""

  const visibleProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    return topProducts.filter((p) => {
      if (q && !p.label.toLowerCase().includes(q)) return false
      if (productCategory && (catByProductName.get(p.name) ?? "Other") !== productCategory) return false
      return true
    })
  }, [topProducts, catByProductName, productQuery, productCategory])

  // Category breakdown — qty sold + revenue
  const categoryRevenue = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number }>()
    for (const row of cur?.items ?? []) {
      const cat = catByProductName.get(row.name) ?? "Other"
      const e = map.get(cat) ?? { qty: 0, revenue: 0 }
      map.set(cat, { qty: e.qty + row.qty, revenue: e.revenue + row.revenue })
    }
    return [...map.entries()]
      .sort((a, b) => b[1].qty - a[1].qty)
      .map(([label, d]) => ({ label, value: d.qty, sub: `${fmtMoney(d.revenue)} revenue` }))
  }, [cur, catByProductName])

  // Peak hours — always all-time for enough signal, so the counts come from the
  // server aggregate rather than the period-scoped orders held here.
  const peakHours = useMemo(() => {
    const hourLabel = (h: number) =>
      h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`
    const indices = [...Array.from({ length: 18 }, (_, i) => i + 6), 0]
    return indices.map((h) => ({
      label: hourLabel(h),
      // 12am bar folds in the after-midnight closing tail (matches the
      // Hourly Revenue chart).
      value: h === 0
        ? peakHourCounts.slice(0, BUSINESS_DAY_CUTOFF_HOUR).reduce((s, n) => s + n, 0)
        : peakHourCounts[h] ?? 0,
    }))
  }, [peakHourCounts])

  // Untracked products are skipped: with no count they can be neither out nor low.
  const outOfStock = useMemo(
    () => products.filter((p) => p.stock === 0 && p.status !== "disabled"),
    [products],
  )
  const lowStock = useMemo(
    () =>
      products
        .filter((p) => hasStock(p.stock) && p.stock <= 5 && p.status !== "disabled")
        .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0)),
    [products],
  )


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
          <p className="mt-0.5 text-sm text-[var(--text)]">
            {periodLabel(dateMode, datePick)}
            {refreshing && <span className="ml-2 text-xs opacity-70">updating…</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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

          {/* Calendar picker — type changes with mode */}
          {dateMode === "day" && (
            <input
              type="date"
              value={datePick}
              max={currentBusinessDate()}
              onChange={(e) => setDatePick(e.target.value)}
              className={inputCls}
            />
          )}
          {dateMode === "week" && (
            <input
              type="week"
              value={datePick}
              max={toWeekStr(nowBusiness())}
              onChange={(e) => setDatePick(e.target.value)}
              className={inputCls}
            />
          )}
          {dateMode === "month" && (
            <input
              type="month"
              value={datePick}
              max={toMonthStr(nowBusiness())}
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
          label="Expenses"
          value={fmtMoney(curExpensesTotal)}
          note={`${curExpenses.length} entr${curExpenses.length === 1 ? "y" : "ies"}`}
        />
        <KpiCard
          label="Items Sold"
          value={String(curItemsSold)}
          note={`across ${curOrderCount} order${curOrderCount === 1 ? "" : "s"}`}
        />
      </div>

      {/* Revenue trend + top products */}
      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-3">
          {/* The picked bar's value sits on the title line rather than in a row
              of its own: the By Product card beside this one is pinned to this
              card's height, and a new row would break the edge they share. */}
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--text-h)]">
              {trendTitle}{" "}
              <span className="font-normal text-[var(--text)]">· {periodLabel(dateMode, datePick)}</span>
            </p>
            {pickedBar && (
              <p className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-[var(--accent)]">
                {pickedBar.label} · {fmtMoney(pickedBar.value)}
              </p>
            )}
          </div>
          {revenueTrend.every((d) => d.value === 0) ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-[var(--text)]">
              No sales for this period
            </div>
          ) : dateMode === "day" ? (
            <BarChart data={revenueTrend} valueFmt={fmtMoney} height={220} barMaxW={8} rotateLabels showValues
              selectedIndex={trendPick} onSelectIndex={setTrendPick} />
          ) : dateMode === "month" ? (
            // A month of bars is wider than a phone, so it scrolls. The fade on
            // the right edge is the only cue that there is more to reach.
            <div className="relative">
              <div className="overflow-x-auto">
                <BarChart data={revenueTrend} valueFmt={fmtMoney} height={220} barMaxW={10} rotateLabels showValues maxLabels={5} minWidth={560}
                  selectedIndex={trendPick} onSelectIndex={setTrendPick} />
              </div>
              <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--surface)] to-transparent sm:hidden" />
            </div>
          ) : (
            <BarChart data={revenueTrend} valueFmt={fmtMoney} height={200} showValues
              selectedIndex={trendPick} onSelectIndex={setTrendPick} />
          )}
        </div>

        {/* 296px is the trend card's natural height in day mode (p-5 twice +
            title + mb-4 + the 220px chart), so both cards in this row end on
            the same edge. Keep the two in step if either ever changes. */}
        {/* pr-2.5 rather than the p-5 the other cards use: the list below
            permanently reserves a ~10px scrollbar gutter, so trimming the
            card's own right padding by the same amount leaves the visual gap
            even on both sides. Every row then carries a matching pr-2.5 and
            they share one right edge at every width — no breakpoint involved,
            which is what went wrong when this was lg-only. */}
        <div className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 pr-2.5 lg:col-span-2 lg:max-h-[296px]">
          <p className="mb-3 shrink-0 pr-2.5 text-sm font-semibold text-[var(--text-h)]">
            By Product{" "}
            <span className="font-normal text-[var(--text)]">
              · {periodLabel(dateMode, datePick)}
              {productsFiltered && ` · ${visibleProducts.length} of ${topProducts.length}`}
            </span>
          </p>

          {topProducts.length > 0 && (
            <div className="mb-3 flex shrink-0 items-center gap-2 pr-2.5">
              <SearchBox
                dense
                value={productQuery}
                onChange={setProductQuery}
                placeholder="Search product"
                className="min-w-0 flex-1"
              />
              <CategoryFilter
                value={productCategory}
                onChange={setProductCategory}
                options={productCategoryOptions}
              />
            </div>
          )}

          {/* The gutter is reserved at every width, not just where the list
              actually scrolls, so the right edge never shifts between
              breakpoints or when filtering drops the list below the cap. */}
          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-color:var(--border)_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin]">
            {topProducts.length === 0 ? (
              <p className="text-sm text-[var(--text)]">No orders yet for this period.</p>
            ) : visibleProducts.length === 0 ? (
              <p className="text-sm text-[var(--text)]">
                No products match.{" "}
                <button
                  onClick={() => { setProductQuery(""); setProductCategory("") }}
                  className="cursor-pointer font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                >
                  Clear filters
                </button>
              </p>
            ) : (
              <RankList items={visibleProducts} valueFmt={(v) => `${v} sold`} />
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

      {/* Stock alerts + Wastage + Recent orders */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 max-h-[360px]">
          <div className="mb-4 shrink-0 flex items-center gap-2">
            <p className="text-sm font-semibold text-[var(--text-h)]">Stock Alerts</p>
            {outOfStock.length > 0 && (
              <button
                onClick={() => setStockAlertFilter(f => f === "out" ? "all" : "out")}
                className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${stockAlertFilter === "out" ? "bg-red-500 text-white" : "bg-red-500/15 text-red-500 hover:bg-red-500/25"}`}
              >
                {outOfStock.length} out of stock
              </button>
            )}
            {lowStock.length > 0 && (
              <button
                onClick={() => setStockAlertFilter(f => f === "low" ? "all" : "low")}
                className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${stockAlertFilter === "low" ? "bg-yellow-500 text-white" : "bg-yellow-400/20 text-yellow-600 hover:bg-yellow-400/30"}`}
              >
                {lowStock.length} low
              </button>
            )}
          </div>
          {outOfStock.length === 0 && lowStock.length === 0 ? (
            <p className="text-sm text-green-600">All products are well-stocked.</p>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto flex flex-col gap-2">
              {(stockAlertFilter !== "low" ? outOfStock : []).map((p) => {
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
              {(stockAlertFilter !== "out" ? lowStock : []).map((p) => {
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

        <div className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 max-h-[360px]">
          <div className="mb-4 shrink-0 flex items-center gap-2">
            <p className="text-sm font-semibold text-[var(--text-h)]">Wastage</p>
            {curWastageAdjs.length > 0 && (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-500">
                {fmtMoney(curWastageCost)}
              </span>
            )}
          </div>
          {curWastageAdjs.length === 0 ? (
            <p className="text-sm text-green-600">No wastage recorded for this period.</p>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto flex flex-col gap-2">
              {curWastageAdjs.map((a) => (
                <div key={a._id} className="flex items-center justify-between rounded-lg bg-red-500/10 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--text-h)]">{a.productName}</p>
                    {a.reason && <p className="text-xs text-[var(--text)]">{wastageReasonLabel(a.reason)}</p>}
                  </div>
                  <div className="ml-2 shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-red-500">−{a.quantity}</p>
                    <p className="text-[11px] tabular-nums text-[var(--text)]">{a.costPrice != null && a.costPrice > 0 ? fmtMoney(a.costPrice * a.quantity) : "—"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 max-h-[360px]">
          <div className="mb-4 shrink-0 flex items-center">
            <p className="text-sm font-semibold text-[var(--text-h)]">Recent Orders</p>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-[var(--text)]">No orders for this period.</p>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto flex flex-col gap-2 pb-2">
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
