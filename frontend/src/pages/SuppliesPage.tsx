import { useEffect, useMemo, useState } from "react"
import type { Supply, NewSupply } from "../types"
import { suppliesApi } from "../api"
import Modal from "../components/Modal"
import {
  PageShell, PageHeader, ErrorBanner, Toolbar, SearchBox, TableCard, EmptyState,
  SortTh, PlusIcon, PencilIcon, LogIcon, QuantityStepper,
  inputCls, selectCls, btnPrimaryCls, btnOutlineCls, btnDangerCls,
  iconBtnCls, fieldLabelCls, PAGE_SIZE_INVENTORY, Paginator,
} from "../components/ui"

type SortKey = "name" | "quantity" | "unitCost"
type SortDir = "asc" | "desc"

const EMPTY: NewSupply = { name: "", unit: "", quantity: 0, unitCost: undefined, lowStockAt: null }

function QuantityBadge({ quantity, lowStockAt }: { quantity: number; lowStockAt: number | null }) {
  if (quantity === 0)
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-500">
        Out
      </span>
    )
  if (lowStockAt != null && quantity <= lowStockAt)
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-400/20 px-2.5 py-0.5 text-xs font-medium text-yellow-600">
        Low · {quantity}
      </span>
    )
  return <span className="tabular-nums text-[var(--text-h)]">{quantity}</span>
}

export default function SuppliesPage({ onViewLog }: { onViewLog?: () => void }) {
  const [supplies, setSupplies] = useState<Supply[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "archived">("active")
  const [quantityFilter, setQuantityFilter] = useState<"" | "out" | "low">("")
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE_INVENTORY)

  // Add / edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Supply | null>(null)
  const [form, setForm] = useState<NewSupply>(EMPTY)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Restock modal
  const [restockTarget, setRestockTarget] = useState<Supply | null>(null)
  const [restockQty, setRestockQty] = useState("")
  const [restockCost, setRestockCost] = useState("")
  const [restockError, setRestockError] = useState<string | null>(null)
  const [restocking, setRestocking] = useState(false)

  // Consume modal
  const [consumeTarget, setConsumeTarget] = useState<Supply | null>(null)
  const [consumeQty, setConsumeQty] = useState("")
  const [consumeReason, setConsumeReason] = useState("")
  const [consumeError, setConsumeError] = useState<string | null>(null)
  const [consuming, setConsuming] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await suppliesApi.list({ limit: 500 })
      setSupplies(res.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load supplies")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = supplies.filter((s) => {
      if (statusFilter && s.status !== statusFilter) return false
      if (quantityFilter === "out" && s.quantity !== 0) return false
      if (quantityFilter === "low" && !(s.quantity > 0 && s.lowStockAt != null && s.quantity <= s.lowStockAt)) return false
      return !q || s.name.toLowerCase().includes(q) || s.unit.toLowerCase().includes(q)
    })
    return [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortKey === "quantity") cmp = a.quantity - b.quantity
      else if (sortKey === "unitCost") cmp = (a.unitCost ?? -1) - (b.unitCost ?? -1)
      else cmp = a.name.localeCompare(b.name)
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [supplies, query, statusFilter, quantityFilter, sortKey, sortDir])

  useEffect(() => { setPage(1) }, [query, statusFilter, quantityFilter, sortKey, sortDir, pageSize])

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize))
  const paged = visible.slice((page - 1) * pageSize, page * pageSize)

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir("asc") }
  }

  const lowCount = supplies.filter((s) => s.status === "active" && s.lowStockAt != null && s.quantity > 0 && s.quantity <= s.lowStockAt).length
  const outCount = supplies.filter((s) => s.status === "active" && s.quantity === 0).length

  // If the active quantity filter's badge would disappear (count hit 0), clear
  // it so the table doesn't stay stuck showing an empty filtered list.
  useEffect(() => {
    if ((quantityFilter === "out" && outCount === 0) || (quantityFilter === "low" && lowCount === 0)) {
      setQuantityFilter("")
    }
  }, [quantityFilter, outCount, lowCount])

  // Add / edit
  function openAdd() {
    setEditTarget(null)
    setForm(EMPTY)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(s: Supply) {
    setEditTarget(s)
    setForm({ name: s.name, unit: s.unit, lowStockAt: s.lowStockAt ?? null })
    setFormError(null)
    setModalOpen(true)
  }

  async function handleSubmit() {
    setFormError(null)
    if (!form.name.trim() || !form.unit.trim()) {
      setFormError("Name and unit are required")
      return
    }
    if (!editTarget && form.quantity && form.quantity > 0 && !form.unitCost) {
      setFormError("Unit cost is required when adding an initial quantity")
      return
    }
    setSubmitting(true)
    try {
      if (editTarget) {
        const updated = await suppliesApi.update(editTarget._id, {
          name: form.name, unit: form.unit, lowStockAt: form.lowStockAt ?? null,
        })
        setSupplies((prev) => prev.map((s) => (s._id === updated._id ? updated : s)))
      } else {
        await suppliesApi.create(form)
        await load()
      }
      setModalOpen(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save supply")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleStatus(s: Supply) {
    const newStatus = s.status === "archived" ? "active" : "archived"
    setSupplies((prev) => prev.map((sup) => (sup._id === s._id ? { ...sup, status: newStatus } : sup)))
    try {
      await suppliesApi.update(s._id, { status: newStatus })
    } catch {
      setSupplies((prev) => prev.map((sup) => (sup._id === s._id ? { ...sup, status: s.status } : sup)))
    }
  }

  // Restock
  function openRestock(s: Supply) {
    setRestockTarget(s)
    setRestockQty("")
    setRestockCost(s.unitCost != null ? String(s.unitCost) : "")
    setRestockError(null)
  }

  async function handleRestock() {
    if (!restockTarget) return
    const qty = Number(restockQty)
    if (!restockQty.trim() || isNaN(qty) || qty <= 0) {
      setRestockError("Enter a quantity greater than 0")
      return
    }
    const cost = Number(restockCost)
    if (!restockCost.trim() || isNaN(cost) || cost <= 0) {
      setRestockError("Enter a unit cost greater than 0")
      return
    }
    setRestocking(true)
    setRestockError(null)
    try {
      const { supply } = await suppliesApi.restock(restockTarget._id, qty, cost)
      setSupplies((prev) => prev.map((s) => (s._id === supply._id ? supply : s)))
      setRestockTarget(null)
    } catch (err) {
      setRestockError(err instanceof Error ? err.message : "Failed to restock")
    } finally {
      setRestocking(false)
    }
  }

  const restockQtyNum = Number(restockQty)
  const restockNewQty = restockTarget && restockQtyNum > 0 ? restockTarget.quantity + restockQtyNum : null

  // Consume
  function openConsume(s: Supply) {
    setConsumeTarget(s)
    setConsumeQty("")
    setConsumeReason("")
    setConsumeError(null)
  }

  async function handleConsume() {
    if (!consumeTarget) return
    const qty = Number(consumeQty)
    if (!consumeQty.trim() || isNaN(qty) || qty <= 0) {
      setConsumeError("Enter a quantity greater than 0")
      return
    }
    if (qty > consumeTarget.quantity) {
      setConsumeError(`Only ${consumeTarget.quantity} ${consumeTarget.unit} on hand`)
      return
    }
    setConsuming(true)
    setConsumeError(null)
    try {
      const { supply } = await suppliesApi.consume(consumeTarget._id, qty, consumeReason.trim() || undefined)
      setSupplies((prev) => prev.map((s) => (s._id === supply._id ? supply : s)))
      setConsumeTarget(null)
    } catch (err) {
      setConsumeError(err instanceof Error ? err.message : "Failed to record usage")
    } finally {
      setConsuming(false)
    }
  }

  const consumeQtyNum = Number(consumeQty)
  const consumeNewQty = consumeTarget && consumeQtyNum > 0 ? consumeTarget.quantity - consumeQtyNum : null

  const isFiltering = query.trim() !== "" || statusFilter !== "active"

  return (
    <PageShell>
      <PageHeader
        title="Supplies"
        action={
          <div className="flex items-center gap-2">
            {onViewLog && (
              <button onClick={onViewLog} className={btnOutlineCls}>
                <span className="flex items-center gap-2">
                  <LogIcon />
                  Supply Log
                </span>
              </button>
            )}
            <button onClick={openAdd} className={btnPrimaryCls}>
              <PlusIcon />
              Add supply
            </button>
          </div>
        }
      />

      {!loading && supplies.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {outCount > 0 && (
            <button
              onClick={() => setQuantityFilter((f) => (f === "out" ? "" : "out"))}
              aria-pressed={quantityFilter === "out"}
              title={quantityFilter === "out" ? "Show all supplies" : "Show only out-of-stock supplies"}
              className={
                "inline-flex cursor-pointer items-center rounded-full bg-red-500/10 px-3 py-1 text-sm font-medium text-red-500 transition hover:bg-red-500/20 " +
                (quantityFilter === "out" ? "ring-2 ring-red-500/60" : "")
              }
            >
              {outCount} out of stock
            </button>
          )}
          {lowCount > 0 && (
            <button
              onClick={() => setQuantityFilter((f) => (f === "low" ? "" : "low"))}
              aria-pressed={quantityFilter === "low"}
              title={quantityFilter === "low" ? "Show all supplies" : "Show only low-stock supplies"}
              className={
                "inline-flex cursor-pointer items-center rounded-full bg-yellow-400/20 px-3 py-1 text-sm font-medium text-yellow-600 transition hover:bg-yellow-400/30 " +
                (quantityFilter === "low" ? "ring-2 ring-yellow-500/60" : "")
              }
            >
              {lowCount} low stock
            </button>
          )}
          {outCount === 0 && lowCount === 0 && (
            <span className="inline-flex items-center rounded-full bg-green-500/10 px-3 py-1 text-sm font-medium text-green-600">
              All supplies stocked
            </span>
          )}
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <EmptyState>Loading…</EmptyState>
      ) : supplies.length === 0 && !isFiltering ? (
        <EmptyState>No supplies yet. Add your first one with the button above.</EmptyState>
      ) : (
        <>
          <Toolbar count={`${visible.length} of ${supplies.length}`}>
            <SearchBox value={query} onChange={setQuery} placeholder="Search by name or unit…" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "" | "active" | "archived")}
              className={selectCls + " text-sm"}
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="">All</option>
            </select>
          </Toolbar>

          {visible.length === 0 ? (
            <EmptyState>No supplies match the current filters.</EmptyState>
          ) : (
            <>
              {/* Mobile: card list */}
              <div className="flex flex-col gap-3 sm:hidden">
                {paged.map((s) => (
                  <div key={s._id} className="rounded-xl border border-[var(--border)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--text-h)]">{s.name}</p>
                        <p className="mt-1 text-xs text-[var(--text)]">{s.unit}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="tabular-nums text-[var(--text)]">{s.unitCost != null ? `₱${s.unitCost.toFixed(2)}` : "—"}</span>
                        <QuantityBadge quantity={s.quantity} lowStockAt={s.lowStockAt} />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2">
                      <div className="flex items-center gap-1">
                        {s.quantity > 0 && (
                          <button
                            onClick={() => openConsume(s)}
                            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-xs text-[var(--text-h)] transition hover:bg-red-500/10 hover:text-red-500"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            Use
                          </button>
                        )}
                        <button
                          onClick={() => openRestock(s)}
                          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-xs text-[var(--text-h)] transition hover:bg-[var(--social-bg)]"
                        >
                          <PlusIcon size={12} />
                          Restock
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => void handleToggleStatus(s)}
                          title={s.status === "archived" ? "Unarchive" : "Archive"}
                          className={`flex h-6 w-11 items-center rounded-full border transition-colors ${
                            s.status !== "archived"
                              ? "justify-end border-[var(--accent)] bg-[var(--accent-bg)]"
                              : "justify-start border-[var(--border)] bg-[var(--social-bg)]"
                          }`}
                        >
                          <span className={`mx-0.5 h-4 w-4 rounded-full transition-colors ${s.status !== "archived" ? "bg-[var(--accent)]" : "bg-[var(--text)]"}`} />
                        </button>
                        <button onClick={() => openEdit(s)} title="Edit supply" aria-label="Edit supply" className={iconBtnCls}>
                          <PencilIcon />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden sm:block">
                <TableCard>
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                      <SortTh label="Name" col="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-[var(--text)]">Unit</th>
                      <SortTh label="Cost/unit" col="unitCost" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortTh label="Quantity" col="quantity" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <th className="w-24 px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-[var(--text)]">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((s) => (
                      <tr key={s._id} className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--social-bg)]">
                        <td className="px-4 py-3 font-medium text-[var(--text-h)]">{s.name}</td>
                        <td className="px-4 py-3 text-[var(--text)]">{s.unit}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--text)]">
                          {s.unitCost != null ? `₱${s.unitCost.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right"><QuantityBadge quantity={s.quantity} lowStockAt={s.lowStockAt} /></td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center">
                            <button
                              onClick={() => void handleToggleStatus(s)}
                              title={s.status === "archived" ? "Unarchive" : "Archive"}
                              className={`flex h-6 w-11 items-center rounded-full border transition-colors ${
                                s.status !== "archived"
                                  ? "justify-end border-[var(--accent)] bg-[var(--accent-bg)]"
                                  : "justify-start border-[var(--border)] bg-[var(--social-bg)]"
                              }`}
                            >
                              <span className={`mx-0.5 h-4 w-4 rounded-full transition-colors ${s.status !== "archived" ? "bg-[var(--accent)]" : "bg-[var(--text)]"}`} />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {s.quantity > 0 && (
                              <button
                                onClick={() => openConsume(s)}
                                title="Log usage"
                                className="inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--border)] px-2.5 text-xs text-[var(--text-h)] transition hover:bg-red-500/10 hover:text-red-500"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                Use
                              </button>
                            )}
                            <button
                              onClick={() => openRestock(s)}
                              className="inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--border)] px-2.5 text-xs text-[var(--text-h)] transition hover:bg-[var(--social-bg)]"
                            >
                              <PlusIcon size={12} />
                              Restock
                            </button>
                            <button onClick={() => openEdit(s)} title="Edit supply" aria-label="Edit supply" className={iconBtnCls}>
                              <PencilIcon />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableCard>
              </div>
              <Paginator page={page} totalPages={totalPages} total={visible.length} pageSize={pageSize} onPage={setPage} onPageSize={(n) => setPageSize(n)} />
            </>
          )}
        </>
      )}

      {/* Add / Edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? "Edit supply" : "Add supply"}>
        <form onSubmit={(e) => { e.preventDefault(); void handleSubmit() }} className="flex flex-col gap-3">
          <label className={fieldLabelCls}>
            Name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Cooking oil"
              className={inputCls}
              autoFocus
            />
          </label>

          <label className={fieldLabelCls}>
            Unit
            <input
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="e.g. liter, tank, kg"
              className={inputCls}
            />
          </label>

          <label className={fieldLabelCls}>
            Low stock threshold <span className="text-xs font-normal text-[var(--text)]">(optional)</span>
            <input
              type="number" min="0" step="any"
              value={form.lowStockAt ?? ""}
              onChange={(e) => setForm({ ...form, lowStockAt: e.target.value !== "" ? Number(e.target.value) : null })}
              placeholder="e.g. 2"
              className={inputCls}
            />
          </label>

          {!editTarget && (
            <div className="grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-3">
              <label className={fieldLabelCls}>
                Initial quantity
                <input
                  type="number" min="0" step="any"
                  value={form.quantity || ""}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value !== "" ? Number(e.target.value) : 0 })}
                  placeholder="0"
                  className={inputCls}
                />
              </label>
              <label className={fieldLabelCls}>
                Unit cost (₱)
                <input
                  type="number" min="0" step="0.01"
                  value={form.unitCost ?? ""}
                  onChange={(e) => setForm({ ...form, unitCost: e.target.value !== "" ? Number(e.target.value) : undefined })}
                  placeholder="required if quantity > 0"
                  className={inputCls}
                />
              </label>
            </div>
          )}

          {formError && <p className="text-sm text-red-500">{formError}</p>}

          <div className="mt-1 flex justify-end gap-3">
            <button type="button" onClick={() => setModalOpen(false)} className={btnOutlineCls}>Cancel</button>
            <button type="submit" disabled={submitting} className={btnPrimaryCls}>
              {submitting ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Restock modal */}
      <Modal
        open={!!restockTarget}
        onClose={() => setRestockTarget(null)}
        title={`Restock — ${restockTarget?.name ?? ""}`}
      >
        {restockTarget && (
          <form onSubmit={(e) => { e.preventDefault(); void handleRestock() }} className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-4 py-3">
              <span className="text-sm text-[var(--text)]">Current quantity</span>
              <span className="font-semibold tabular-nums text-[var(--text-h)]">{restockTarget.quantity} {restockTarget.unit}</span>
            </div>

            <label className={fieldLabelCls}>
              Quantity to add
              <QuantityStepper
                value={restockQty}
                onChange={setRestockQty}
                min={0}
                placeholder={`e.g. 5 ${restockTarget.unit}`}
                autoFocus
              />
            </label>

            <label className={fieldLabelCls}>
              Cost per unit (₱)
              <input
                type="number" min="0" step="0.01"
                value={restockCost}
                onChange={(e) => setRestockCost(e.target.value)}
                placeholder="0.00"
                className={inputCls}
              />
              <span className="text-xs font-normal text-[var(--text)]">
                Logs a supplies expense for this purchase and becomes the new unit cost.
              </span>
            </label>

            {restockNewQty !== null && (
              <div className="flex items-center justify-between rounded-lg border border-[var(--accent-border)] bg-[var(--accent-bg)] px-4 py-3 text-sm">
                <span className="text-[var(--text)]">New quantity</span>
                <span className="font-semibold tabular-nums text-[var(--accent)]">
                  {restockTarget.quantity} + {restockQtyNum} = {restockNewQty}
                </span>
              </div>
            )}

            {restockError && <p className="text-sm text-red-500">{restockError}</p>}

            <div className="mt-1 flex justify-end gap-3">
              <button type="button" onClick={() => setRestockTarget(null)} className={btnOutlineCls}>Cancel</button>
              <button type="submit" disabled={restocking} className={btnPrimaryCls}>
                {restocking ? "Saving…" : "Restock"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Consume modal */}
      <Modal
        open={!!consumeTarget}
        onClose={() => setConsumeTarget(null)}
        title={`Log usage — ${consumeTarget?.name ?? ""}`}
      >
        {consumeTarget && (
          <form onSubmit={(e) => { e.preventDefault(); void handleConsume() }} className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-4 py-3">
              <span className="text-sm text-[var(--text)]">Current quantity</span>
              <span className="font-semibold tabular-nums text-[var(--text-h)]">{consumeTarget.quantity} {consumeTarget.unit}</span>
            </div>

            <label className={fieldLabelCls}>
              Quantity used
              <QuantityStepper
                value={consumeQty}
                onChange={setConsumeQty}
                min={0}
                max={consumeTarget.quantity}
                placeholder={`e.g. 1.5 ${consumeTarget.unit}`}
                autoFocus
              />
            </label>

            <label className={fieldLabelCls}>
              Reason <span className="text-xs font-normal text-[var(--text)]">(optional)</span>
              <input
                value={consumeReason}
                onChange={(e) => setConsumeReason(e.target.value)}
                placeholder="e.g. Used for frying"
                maxLength={200}
                className={inputCls}
              />
            </label>

            {consumeNewQty !== null && consumeNewQty >= 0 && (
              <div className="flex items-center justify-between rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
                <span className="text-[var(--text)]">New quantity</span>
                <span className="font-semibold tabular-nums text-red-500">
                  {consumeTarget.quantity} − {consumeQtyNum} = {consumeNewQty}
                </span>
              </div>
            )}

            {consumeError && <p className="text-sm text-red-500">{consumeError}</p>}

            <div className="mt-1 flex justify-end gap-3">
              <button type="button" onClick={() => setConsumeTarget(null)} className={btnOutlineCls}>Cancel</button>
              <button
                type="submit"
                disabled={consuming || !consumeQty || consumeQtyNum <= 0 || consumeQtyNum > consumeTarget.quantity}
                className={btnDangerCls}
              >
                {consuming ? "Saving…" : "Log usage"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </PageShell>
  )
}
