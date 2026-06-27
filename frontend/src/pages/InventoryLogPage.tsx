import { useCallback, useEffect, useRef, useState } from "react"
import type { StockAdjustment } from "../types"
import { wastageReasonLabel } from "../types"
import { stockAdjustmentsApi } from "../api"
import Modal from "../components/Modal"
import {
  PageShell, PageHeader, ErrorBanner, Toolbar, TableCard, EmptyState,
  SortTh, BanIcon, iconBtnDangerCls, btnOutlineCls, btnDangerCls,
  PAGE_SIZE, Paginator, SearchBox,
} from "../components/ui"

type DateMode = "all" | "day" | "week" | "month"
type SortKey = "createdAt" | "productName" | "type" | "quantity" | "costPrice"

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
function monthRange(s: string): [string, string] {
  const [y, m] = s.split("-").map(Number)
  return [new Date(y, m - 1, 1).toISOString(), new Date(y, m, 0, 23, 59, 59, 999).toISOString()]
}
function weekRange(s: string): [string, string] {
  const [yr, wk] = s.split("-W").map(Number)
  const jan4 = new Date(yr, 0, 4)
  const j4d = jan4.getDay() || 7
  const mon = new Date(jan4.getTime() + (wk - 1) * 7 * 86400000 - (j4d - 1) * 86400000)
  mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon.getTime() + 6 * 86400000)
  sun.setHours(23, 59, 59, 999)
  return [mon.toISOString(), sun.toISOString()]
}
function dayRange(s: string): [string, string] {
  return [new Date(s + "T00:00:00").toISOString(), new Date(s + "T23:59:59.999").toISOString()]
}

function TypeBadge({ type }: { type: StockAdjustment["type"] }) {
  if (type === "wastage") {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-500">
        Wastage
      </span>
    )
  }
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-semibold text-green-600">
      Receiving
    </span>
  )
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  })
}

function fmtMoney(n: number) {
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const inputCls = "h-10 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text-h)] outline-none transition focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-[var(--accent)]"

export default function InventoryLogPage() {
  const [data, setData] = useState<StockAdjustment[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCost, setTotalCost] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<"" | "wastage" | "receiving">("")
  const [dateMode, setDateMode] = useState<DateMode>("all")
  const [datePick, setDatePick] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("createdAt")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [voidTarget, setVoidTarget] = useState<StockAdjustment | null>(null)
  const [voiding, setVoiding] = useState(false)
  const [voidError, setVoidError] = useState<string | null>(null)

  const loadToken = useRef(0)

  function switchMode(mode: DateMode) {
    setDateMode(mode)
    const now = new Date()
    if (mode === "day")        setDatePick(toDateStr(now))
    else if (mode === "week")  setDatePick(toWeekStr(now))
    else if (mode === "month") setDatePick(toMonthStr(now))
    else                       setDatePick("")
    setPage(1)
  }

  const [from, to] = (() => {
    if (!datePick) return [undefined, undefined]
    if (dateMode === "month") { const [f, t] = monthRange(datePick); return [f, t] }
    if (dateMode === "week")  { const [f, t] = weekRange(datePick);  return [f, t] }
    if (dateMode === "day")   { const [f, t] = dayRange(datePick);   return [f, t] }
    return [undefined, undefined]
  })()

  const load = useCallback(() => {
    const token = ++loadToken.current
    setLoading(true)
    setError(null)
    stockAdjustmentsApi
      .list({
        page,
        limit: pageSize,
        sortKey,
        sortDir,
        ...(search     ? { q: search }         : {}),
        ...(typeFilter ? { type: typeFilter }   : {}),
        ...(from       ? { from }               : {}),
        ...(to         ? { to }                 : {}),
      })
      .then((res) => {
        if (token !== loadToken.current) return
        setData(res.data)
        setTotal(res.total)
        setTotalPages(res.totalPages)
        setTotalCost(res.totalCost)
      })
      .catch((err) => {
        if (token !== loadToken.current) return
        setError(err instanceof Error ? err.message : "Failed to load")
      })
      .finally(() => {
        if (token === loadToken.current) setLoading(false)
      })
  }, [page, pageSize, search, typeFilter, from, to, sortKey, sortDir])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [pageSize, search, typeFilter, dateMode, datePick, sortKey, sortDir])

  const isFiltering = search !== "" || typeFilter !== "" || dateMode !== "all"

  async function handleVoid() {
    if (!voidTarget) return
    setVoiding(true)
    setVoidError(null)
    try {
      await stockAdjustmentsApi.void(voidTarget._id)
      setVoidTarget(null)
      load()
    } catch (err) {
      setVoidError(err instanceof Error ? err.message : "Failed to void")
    } finally {
      setVoiding(false)
    }
  }

  function handleSort(col: SortKey) {
    if (col === sortKey) setSortDir((d) => d === "asc" ? "desc" : "asc")
    else { setSortKey(col); setSortDir("desc") }
  }

  return (
    <PageShell>
      <PageHeader title="Inventory Log" />

      {error && <ErrorBanner message={error} />}

      {loading && data.length === 0 ? (
        <EmptyState>Loading…</EmptyState>
      ) : total === 0 && !isFiltering ? (
        <EmptyState>No stock adjustments yet — add stock or record wastage from the Inventory page.</EmptyState>
      ) : (
        <>
          <Toolbar count={`${total} record${total === 1 ? "" : "s"}`}>
            <SearchBox
              value={search}
              onChange={(v) => setSearch(v)}
              placeholder="Search product…"
            />
            <div className="flex flex-wrap items-center gap-2">
              {/* Date mode pills */}
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

              {dateMode === "month" && (
                <input type="month" value={datePick} max={toMonthStr(new Date())}
                  onChange={(e) => setDatePick(e.target.value)} className={inputCls} />
              )}
              {dateMode === "week" && (
                <input type="week" value={datePick} max={toWeekStr(new Date())}
                  onChange={(e) => setDatePick(e.target.value)} className={inputCls} />
              )}
              {dateMode === "day" && (
                <input type="date" value={datePick} max={toDateStr(new Date())}
                  onChange={(e) => setDatePick(e.target.value)} className={inputCls} />
              )}

              <select
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value as "" | "wastage" | "receiving"); setPage(1) }}
                className={inputCls}
              >
                <option value="">All types</option>
                <option value="wastage">Wastage</option>
                <option value="receiving">Receiving</option>
              </select>
            </div>
          </Toolbar>

          {/* Wastage cost summary banner */}
          {typeFilter === "wastage" && total > 0 && (
            <div className="mb-3 flex items-center justify-between rounded-lg border border-[var(--border)] border-l-4 border-l-red-500 bg-[var(--surface)] px-4 py-3 text-sm">
              <div className="flex items-center gap-2.5">
                <TypeBadge type="wastage" />
                <span className="text-[var(--text)]">{total} write-off{total === 1 ? "" : "s"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text)]">Total cost</span>
                <span className="font-semibold tabular-nums text-red-500">{fmtMoney(totalCost)}</span>
              </div>
            </div>
          )}

          {total === 0 ? (
            <EmptyState>No records{dateMode !== "all" ? ` for the selected ${dateMode}` : ""}{typeFilter ? ` of type "${typeFilter}"` : ""}.</EmptyState>
          ) : (
            <>
              {/* Mobile: card list */}
              <div className="flex flex-col gap-3 sm:hidden">
                {data.map((adj) => (
                  <div
                    key={adj._id}
                    className={"rounded-xl border border-[var(--border)] p-4 " + (adj.voided ? "opacity-50" : "")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-medium text-[var(--text-h)]">
                          {adj.productName}
                          {adj.voided && (
                            <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-500">
                              Voided
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--text)]">{fmtDate(adj.createdAt)}</p>
                      </div>
                      <TypeBadge type={adj.type} />
                    </div>
                    {adj.type === "wastage" && adj.reason && (
                      <p className="mt-1.5 text-xs text-[var(--text)]">{wastageReasonLabel(adj.reason)}</p>
                    )}
                    {adj.voided && adj.voidedByName && (
                      <p className="mt-1.5 text-xs text-red-500">
                        Voided by {adj.voidedByName}{adj.voidedAt ? ` · ${fmtDate(adj.voidedAt)}` : ""}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2">
                      <div className="flex items-center gap-3 text-sm">
                        <span className={`font-semibold tabular-nums ${adj.type === "wastage" ? "text-red-500" : "text-green-600"}`}>
                          {adj.type === "wastage" ? "−" : "+"}{adj.quantity}
                        </span>
                        <span className={`tabular-nums text-[var(--text-h)] ${adj.voided ? "line-through" : ""}`}>
                          {adj.costPrice != null ? fmtMoney(adj.costPrice * adj.quantity) : "—"}
                        </span>
                      </div>
                      {!adj.voided && (
                        <button
                          onClick={() => { setVoidTarget(adj); setVoidError(null) }}
                          title="Void adjustment"
                          aria-label="Void adjustment"
                          className={iconBtnDangerCls}
                        >
                          <BanIcon />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden sm:block">
                <TableCard>
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                      <SortTh label="Date" col="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-48" />
                      <SortTh label="Product" col="productName" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <SortTh label="Type" col="type" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-[var(--text)]">Reason</th>
                      <SortTh label="Qty" col="quantity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                      <SortTh label="Cost/unit" col="costPrice" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-[var(--text)]">Total cost</th>
                      <th className="w-16 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((adj) => (
                      <tr
                        key={adj._id}
                        className={
                          "border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--social-bg)] " +
                          (adj.voided ? "opacity-50" : "")
                        }
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-[var(--text)]">{fmtDate(adj.createdAt)}</td>
                        <td className="px-4 py-3 font-medium text-[var(--text-h)]">
                          <span className="flex items-center gap-1.5">
                            {adj.productName}
                            {adj.voided && (
                              <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-500">
                                Voided
                              </span>
                            )}
                          </span>
                          {adj.voided && adj.voidedByName && (
                            <span className="text-xs font-normal text-red-500">
                              by {adj.voidedByName}{adj.voidedAt ? ` · ${fmtDate(adj.voidedAt)}` : ""}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3"><TypeBadge type={adj.type} /></td>
                        <td className="px-4 py-3 text-[var(--text)]">
                          {adj.type === "wastage" ? wastageReasonLabel(adj.reason) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span className={adj.type === "wastage" ? "text-red-500" : "text-green-600"}>
                            {adj.type === "wastage" ? "−" : "+"}{adj.quantity}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right tabular-nums text-[var(--text)] ${adj.voided ? "line-through" : ""}`}>
                          {adj.costPrice != null ? fmtMoney(adj.costPrice) : "—"}
                        </td>
                        <td className={`px-4 py-3 text-right tabular-nums font-medium text-[var(--text-h)] ${adj.voided ? "line-through" : ""}`}>
                          {adj.costPrice != null ? fmtMoney(adj.costPrice * adj.quantity) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            {!adj.voided && (
                              <button
                                onClick={() => { setVoidTarget(adj); setVoidError(null) }}
                                title="Void adjustment"
                                aria-label="Void adjustment"
                                className={iconBtnDangerCls}
                              >
                                <BanIcon />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableCard>
              </div>
            </>
          )}

          <Paginator page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
        </>
      )}

      {voidTarget && (
        <Modal open={!!voidTarget} title="Void adjustment" onClose={() => setVoidTarget(null)}>
          <p className="text-[var(--text)]">
            Void{" "}
            <span className="font-semibold text-[var(--text-h)]">
              {voidTarget.type === "wastage" ? "−" : "+"}{voidTarget.quantity} × {voidTarget.productName}
            </span>
            ?{" "}
            {voidTarget.type === "wastage"
              ? "Stock will be restored."
              : "Stock will be reduced."}
          </p>
          {voidError && <ErrorBanner message={voidError} />}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setVoidTarget(null)} className={btnOutlineCls}>Cancel</button>
            <button onClick={handleVoid} disabled={voiding} className={btnDangerCls}>
              {voiding ? "Voiding…" : "Void"}
            </button>
          </div>
        </Modal>
      )}
    </PageShell>
  )
}
