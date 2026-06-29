import { useCallback, useEffect, useRef, useState } from "react"
import type { Expense, ExpenseCategory } from "../types"
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "../types"
import { expensesApi } from "../api"
import Modal from "../components/Modal"
import {
  PageShell, PageHeader, ErrorBanner, Toolbar, TableCard, EmptyState,
  SortTh, BanIcon, PlusIcon, iconBtnDangerCls, btnOutlineCls, btnDangerCls,
  btnPrimaryCls, fieldLabelCls, inputCls, PAGE_SIZE, Paginator, SearchBox,
} from "../components/ui"

type DateMode = "all" | "day" | "week" | "month"
type SortKey = "date" | "amount" | "category" | "createdAt"

function toDateStr(d: Date) { return d.toLocaleDateString("sv") }
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
function fmtDate(iso: string) {
  const d = new Date(iso)
  const date = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  return `${date} · ${time}`
}
function fmtMoney(n: number) {
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const BADGE_COLORS: Record<ExpenseCategory, string> = {
  utilities: "bg-yellow-500/10 text-yellow-600",
  salaries:  "bg-purple-500/10 text-purple-500",
  supplies:  "bg-green-500/10 text-green-600",
  repairs:   "bg-orange-500/10 text-orange-500",
  other:     "bg-[var(--social-bg)] text-[var(--text)]",
}

function CategoryBadge({ category }: { category: ExpenseCategory }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE_COLORS[category]}`}>
      {EXPENSE_CATEGORY_LABELS[category]}
    </span>
  )
}

const pickerCls = "h-10 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text-h)] outline-none transition focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-[var(--accent)]"

export default function ExpensesPage() {
  const [data, setData] = useState<Expense[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [totalAmount, setTotalAmount] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<"" | ExpenseCategory>("")
  const [dateMode, setDateMode] = useState<DateMode>("all")
  const [datePick, setDatePick] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("date")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [addCat, setAddCat] = useState<ExpenseCategory>("utilities")
  const [addDesc, setAddDesc] = useState("")
  const [addAmount, setAddAmount] = useState("")
  const [addQty, setAddQty] = useState("")
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const [voidTarget, setVoidTarget] = useState<Expense | null>(null)
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
    expensesApi
      .list({
        page,
        limit: pageSize,
        sortKey,
        sortDir,
        ...(search         ? { q: search }                : {}),
        ...(categoryFilter ? { category: categoryFilter } : {}),
        ...(from           ? { from }                     : {}),
        ...(to             ? { to }                       : {}),
      })
      .then((res) => {
        if (token !== loadToken.current) return
        setData(res.data)
        setTotal(res.total)
        setTotalPages(res.totalPages)
        setTotalAmount(res.totalAmount ?? 0)
      })
      .catch((err) => {
        if (token !== loadToken.current) return
        setError(err instanceof Error ? err.message : "Failed to load")
      })
      .finally(() => {
        if (token === loadToken.current) setLoading(false)
      })
  }, [page, pageSize, search, categoryFilter, from, to, sortKey, sortDir])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [pageSize, search, categoryFilter, dateMode, datePick, sortKey, sortDir])

  const isFiltering = search !== "" || categoryFilter !== "" || dateMode !== "all"

  function openAdd() {
    setAddCat("utilities")
    setAddDesc("")
    setAddAmount("")
    setAddQty("")
    setAddError(null)
    setAddOpen(true)
  }

  async function handleAdd() {
    const amount = Number(addAmount)
    if (!addAmount.trim() || isNaN(amount) || amount <= 0) {
      setAddError("Enter a valid amount greater than 0")
      return
    }
    if (!addDesc.trim()) {
      setAddError("Description is required")
      return
    }
    const qty = addQty.trim() ? Number(addQty) : undefined
    if (qty !== undefined && (isNaN(qty) || qty < 0.01)) {
      setAddError("Quantity must be at least 0.01")
      return
    }
    setAdding(true)
    setAddError(null)
    try {
      await expensesApi.create({
        amount,
        category: addCat,
        description: addDesc.trim(),
        qty,
      })
      setAddOpen(false)
      load()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add expense")
    } finally {
      setAdding(false)
    }
  }

  async function handleVoid() {
    if (!voidTarget) return
    setVoiding(true)
    setVoidError(null)
    try {
      await expensesApi.void(voidTarget._id)
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
      <PageHeader
        title="Expenses"
        action={
          <button onClick={openAdd} className={btnPrimaryCls}>
            <PlusIcon /> Add Expense
          </button>
        }
      />

      {error && <ErrorBanner message={error} />}

      {loading && data.length === 0 ? (
        <EmptyState>Loading…</EmptyState>
      ) : total === 0 && !isFiltering ? (
        <EmptyState>No expenses yet — add your first expense above.</EmptyState>
      ) : (
        <>
          <Toolbar count={`${total} record${total === 1 ? "" : "s"}`}>
            <SearchBox value={search} onChange={(v) => setSearch(v)} placeholder="Search description…" />
            <div className="flex flex-wrap items-center gap-2">
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
                  onChange={(e) => setDatePick(e.target.value)} className={pickerCls} />
              )}
              {dateMode === "week" && (
                <input type="week" value={datePick} max={toWeekStr(new Date())}
                  onChange={(e) => setDatePick(e.target.value)} className={pickerCls} />
              )}
              {dateMode === "day" && (
                <input type="date" value={datePick} max={toDateStr(new Date())}
                  onChange={(e) => setDatePick(e.target.value)} className={pickerCls} />
              )}
              <select
                value={categoryFilter}
                onChange={(e) => { setCategoryFilter(e.target.value as "" | ExpenseCategory); setPage(1) }}
                className={pickerCls}
              >
                <option value="">All categories</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
          </Toolbar>

          {total > 0 && (
            <div className="mb-3 flex items-center justify-between rounded-lg border border-[var(--border)] border-l-4 border-l-[var(--accent)] bg-[var(--surface)] px-4 py-3 text-sm">
              <span className="text-[var(--text)]">
                {total} expense{total === 1 ? "" : "s"}{dateMode !== "all" ? ` for selected ${dateMode}` : ""}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text)]">Total</span>
                <span className="font-semibold tabular-nums text-[var(--text-h)]">{fmtMoney(totalAmount)}</span>
              </div>
            </div>
          )}

          {total === 0 ? (
            <EmptyState>
              No records{dateMode !== "all" ? ` for the selected ${dateMode}` : ""}
              {categoryFilter ? ` in category "${EXPENSE_CATEGORY_LABELS[categoryFilter]}"` : ""}.
            </EmptyState>
          ) : (
            <>
              {/* Mobile: card list */}
              <div className="flex flex-col gap-3 sm:hidden">
                {data.map((exp) => (
                  <div key={exp._id} className={"rounded-xl border border-[var(--border)] p-4 " + (exp.voided ? "opacity-50" : "")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-medium text-[var(--text-h)]">
                          {fmtMoney(exp.amount)}
                          {exp.voided && (
                            <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-500">
                              Voided
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 whitespace-nowrap text-xs text-[var(--text)]">{fmtDate(exp.date)}</p>
                        {exp.description && <p className="mt-0.5 text-xs text-[var(--text)]">{exp.description}</p>}
                        {exp.qty !== undefined && <p className="mt-0.5 text-xs text-[var(--text)]">Qty: {exp.qty}</p>}
                      </div>
                      <CategoryBadge category={exp.category} />
                    </div>
                    {exp.voided && exp.voidedByName && (
                      <p className="mt-1.5 text-xs text-red-500">
                        Voided by {exp.voidedByName}{exp.voidedAt ? ` · ${fmtDate(exp.voidedAt)}` : ""}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-end border-t border-[var(--border)] pt-2">
                      {!exp.voided && (
                        <button
                          onClick={() => { setVoidTarget(exp); setVoidError(null) }}
                          title="Void expense" aria-label="Void expense"
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
                      <SortTh label="Date" col="date" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-48" />
                      <SortTh label="Category" col="category" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-[var(--text)]">Description</th>
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-[var(--text)]">Qty</th>
                      <SortTh label="Amount" col="amount" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                      <th className="w-16 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((exp) => (
                      <tr
                        key={exp._id}
                        className={"border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--social-bg)] " + (exp.voided ? "opacity-50" : "")}
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-[var(--text)]">{fmtDate(exp.date)}</td>
                        <td className="px-4 py-3">
                          <CategoryBadge category={exp.category} />
                        </td>
                        <td className="px-4 py-3 text-[var(--text)]">
                          <div className="flex flex-col gap-0.5">
                            <span>{exp.description ?? "—"}</span>
                            {exp.voided && (
                              <span className="text-xs text-red-500">
                                Voided{exp.voidedByName ? ` by ${exp.voidedByName}` : ""}{exp.voidedAt ? ` · ${fmtDate(exp.voidedAt)}` : ""}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-[var(--text)]">
                          {exp.qty ?? "—"}
                        </td>
                        <td className={`px-4 py-3 text-right tabular-nums font-medium text-[var(--text-h)] ${exp.voided ? "line-through" : ""}`}>
                          {fmtMoney(exp.amount)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            {!exp.voided && (
                              <button
                                onClick={() => { setVoidTarget(exp); setVoidError(null) }}
                                title="Void expense" aria-label="Void expense"
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

      {/* Add Expense modal */}
      <Modal open={addOpen} title="Add Expense" onClose={() => setAddOpen(false)}>
        <div className="flex flex-col gap-4">
          <label className={fieldLabelCls}>
            Category
            <select
              value={addCat}
              onChange={(e) => setAddCat(e.target.value as ExpenseCategory)}
              className="h-10 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text-h)] outline-none transition focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </label>
          <label className={fieldLabelCls}>
            Description
            <textarea
              value={addDesc}
              onChange={(e) => setAddDesc(e.target.value)}
              placeholder="e.g. June rent, Meralco bill…"
              maxLength={200} rows={2}
              className="resize-none rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-h)] outline-none transition focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
          </label>
          <label className={fieldLabelCls}>
            Amount (₱)
            <input
              type="number" min="0.01" step="0.01"
              value={addAmount}
              onChange={(e) => setAddAmount(e.target.value)}
              placeholder="0.00"
              className={inputCls}
            />
          </label>
          <label className={fieldLabelCls}>
            Qty <span className="text-xs font-normal text-[var(--text)]">(optional)</span>
            <input
              type="number" min="0.01" step="any"
              value={addQty}
              onChange={(e) => setAddQty(e.target.value)}
              placeholder="e.g. 3, 1.5"
              className={inputCls}
            />
          </label>
          {addError && <ErrorBanner message={addError} />}
          <div className="flex justify-end gap-2">
            <button onClick={() => setAddOpen(false)} className={btnOutlineCls}>Cancel</button>
            <button onClick={handleAdd} disabled={adding} className={btnPrimaryCls}>
              {adding ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Void modal */}
      {voidTarget && (
        <Modal open={!!voidTarget} title="Void expense" onClose={() => setVoidTarget(null)}>
          <p className="text-[var(--text)]">
            Void{" "}
            <span className="font-semibold text-[var(--text-h)]">
              {fmtMoney(voidTarget.amount)} · {EXPENSE_CATEGORY_LABELS[voidTarget.category]}
            </span>
            ? This cannot be undone.
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
