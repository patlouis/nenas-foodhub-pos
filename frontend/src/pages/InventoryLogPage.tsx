import { useCallback, useEffect, useRef, useState } from "react"
import type { StockAdjustment } from "../types"
import { wastageReasonLabel } from "../types"
import { stockAdjustmentsApi } from "../api"
import Modal from "../components/Modal"
import {
  PageShell, PageHeader, ErrorBanner, Toolbar, TableCard, EmptyState,
  BanIcon, iconBtnDangerCls, btnOutlineCls, btnDangerCls,
  PAGE_SIZE, Paginator,
} from "../components/ui"

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

export default function InventoryLogPage() {
  const [data, setData] = useState<StockAdjustment[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCost, setTotalCost] = useState(0)
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<"" | "wastage" | "receiving">("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // void modal
  const [voidTarget, setVoidTarget] = useState<StockAdjustment | null>(null)
  const [voiding, setVoiding] = useState(false)
  const [voidError, setVoidError] = useState<string | null>(null)

  const loadToken = useRef(0)

  const load = useCallback(() => {
    const token = ++loadToken.current
    setLoading(true)
    setError(null)
    stockAdjustmentsApi
      .list({
        page,
        limit: PAGE_SIZE,
        ...(typeFilter ? { type: typeFilter } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to: `${to}T23:59:59` } : {}),
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
  }, [page, typeFilter, from, to])

  useEffect(() => { load() }, [load])

  const sorted = sortDir === "asc" ? [...data].reverse() : data

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

  return (
    <PageShell>
      <PageHeader title="Inventory Log" />

      {error && <ErrorBanner message={error} />}

      <Toolbar>
        <div className="flex flex-wrap gap-2">
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value as "" | "wastage" | "receiving"); setPage(1) }}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-h)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <option value="">All types</option>
            <option value="wastage">Wastage</option>
            <option value="receiving">Receiving</option>
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1) }}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-h)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1) }}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-h)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          />
          {(typeFilter || from || to) && (
            <button
              onClick={() => { setTypeFilter(""); setFrom(""); setTo(""); setPage(1) }}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--social-bg)]"
            >
              Clear
            </button>
          )}
        </div>

        {total > 0 && (
          <div className="flex items-center gap-4 text-sm text-[var(--text)]">
            <span>{total} record{total !== 1 ? "s" : ""}</span>
            {(typeFilter === "wastage" || !typeFilter) && (
              <span className="font-medium text-red-500">
                {fmtMoney(totalCost)} lost
              </span>
            )}
          </div>
        )}
      </Toolbar>

      <TableCard>
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wide text-[var(--text)]">
              <th className="px-4 py-3">
                <button
                  onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}
                  className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium uppercase tracking-wide text-[var(--accent)] transition-colors"
                >
                  Date
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    {sortDir === "asc"
                      ? <polyline points="18 15 12 9 6 15" />
                      : <polyline points="6 9 12 15 18 9" />}
                  </svg>
                </button>
              </th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Cost/unit</th>
              <th className="px-4 py-3 text-right">Total cost</th>
              <th className="px-4 py-3">By</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {loading && data.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-[var(--text)]">Loading…</td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <EmptyState>No records yet</EmptyState>
                </td>
              </tr>
            ) : (
              sorted.map((adj) => {
                const totalCostRow = adj.costPrice * adj.quantity
                return (
                  <tr key={adj._id} className={`transition-colors hover:bg-[var(--social-bg)] ${adj.voided ? "opacity-50" : ""}`}>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--text)]">{fmtDate(adj.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-[var(--text-h)]">{adj.productName}</td>
                    <td className="px-4 py-3"><TypeBadge type={adj.type} /></td>
                    <td className="px-4 py-3 text-[var(--text)]">
                      {adj.type === "wastage" ? wastageReasonLabel(adj.reason) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--text-h)]">
                      <span className={adj.type === "wastage" ? "text-red-500" : "text-green-600"}>
                        {adj.type === "wastage" ? "−" : "+"}{adj.quantity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--text)]">
                      {fmtMoney(adj.costPrice)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-[var(--text-h)]">
                      {fmtMoney(totalCostRow)}
                    </td>
                    <td className="px-4 py-3 text-[var(--text)]">{adj.adjustedByName}</td>
                    <td className="px-4 py-3 text-right">
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
                      {adj.voided && (
                        <span className="text-xs text-[var(--text)]">Voided</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
      </TableCard>

      {totalPages > 1 && (
        <Paginator page={page} totalPages={totalPages} total={total} onPage={setPage} />
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
