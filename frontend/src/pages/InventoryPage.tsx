import { useEffect, useMemo, useState } from "react"
import type { Product, NewProduct, Category } from "../types"
import { productsApi, categoriesApi } from "../api"
import { useAuth } from "../auth"
import Modal from "../components/Modal"
import {
  PageShell, PageHeader, ErrorBanner, Toolbar, SearchBox, TableCard, EmptyState,
  SortTh, PlusIcon, PencilIcon, TrashIcon,
  inputCls, selectCls, btnPrimaryCls, btnOutlineCls, btnDangerCls,
  iconBtnCls, iconBtnDangerCls, fieldLabelCls, PAGE_SIZE, Paginator,
} from "../components/ui"

type SortKey = "name" | "sku" | "category" | "price" | "stock"
type SortDir = "asc" | "desc"

const EMPTY: NewProduct = { name: "", sku: "", price: 0, stock: 0, category: "", costPrice: null, discountQty: null, discountPrice: null }

function StockBadge({ stock }: { stock: number }) {
  if (stock === 0)
    return (
      <span className="inline-flex items-center rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-500">
        Out of stock
      </span>
    )
  if (stock <= 5)
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-400/20 px-2.5 py-0.5 text-xs font-medium text-yellow-600">
        Low · {stock}
      </span>
    )
  return <span className="tabular-nums text-[var(--text-h)]">{stock}</span>
}

export default function InventoryPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("category")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [page, setPage] = useState(1)

  // Add / edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Product | null>(null)
  const [form, setForm] = useState<NewProduct>(EMPTY)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [skuTouched, setSkuTouched] = useState(false)
  const [discountOn, setDiscountOn] = useState(false)

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Restock modal
  const [restockTarget, setRestockTarget] = useState<Product | null>(null)
  const [delta, setDelta] = useState("")
  const [restockError, setRestockError] = useState<string | null>(null)
  const [restocking, setRestocking] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [prodsResult, catsResult] = await Promise.allSettled([
        productsApi.list({ limit: 500 }),
        categoriesApi.list(),
      ])
      if (prodsResult.status === "fulfilled") setProducts(prodsResult.value.data)
      else throw prodsResult.reason
      if (catsResult.status === "fulfilled") setCategories(catsResult.value)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inventory")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function generateSku(name: string): string {
    const existing = new Set(products.map((p) => p.sku).filter(Boolean))
    const prefix = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3).padEnd(3, "X")
    for (let i = 0; i < 30; i++) {
      const n = String(Math.floor(100 + Math.random() * 900))
      const sku = `${prefix}-${n}`
      if (!existing.has(sku)) return sku
    }
    return `${prefix}-${Date.now().toString(36).slice(-3).toUpperCase()}`
  }

  const catMap = useMemo(
    () => new Map(categories.map((c) => [c._id, c])),
    [categories]
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = products.filter((p) => {
      if (categoryFilter && (p.category ?? "") !== categoryFilter) return false
      return !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q) || (catMap.get(p.category ?? "")?.name ?? "").toLowerCase().includes(q)
    })
    return [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortKey === "stock") {
        cmp = a.stock - b.stock
      } else if (sortKey === "price") {
        cmp = a.price - b.price
      } else if (sortKey === "sku") {
        cmp = (a.sku ?? "").localeCompare(b.sku ?? "")
      } else if (sortKey === "category") {
        const aOrd = catMap.get(a.category ?? "")?.order ?? 9999
        const bOrd = catMap.get(b.category ?? "")?.order ?? 9999
        cmp = aOrd !== bOrd ? aOrd - bOrd : a.name.localeCompare(b.name)
      } else {
        cmp = a.name.localeCompare(b.name)
      }
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [products, catMap, query, categoryFilter, sortKey, sortDir])

  useEffect(() => { setPage(1) }, [query, categoryFilter, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const paged = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir("asc") }
  }

  const outCount = products.filter((p) => p.stock === 0).length
  const lowCount = products.filter((p) => p.stock > 0 && p.stock <= 5).length

  // Add / edit
  function openAdd() {
    setEditTarget(null)
    setSkuTouched(false)
    setDiscountOn(false)
    setForm({ ...EMPTY, sku: generateSku("") })
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(p: Product) {
    setEditTarget(p)
    setSkuTouched(true)
    setDiscountOn(p.discountQty != null)
    setForm({ name: p.name, sku: p.sku ?? "", price: p.price, stock: p.stock, category: p.category ?? "", costPrice: p.costPrice ?? null, discountQty: p.discountQty ?? null, discountPrice: p.discountPrice ?? null })
    setFormError(null)
    setModalOpen(true)
  }

  async function handleSubmit() {
    setFormError(null)
    if (!form.name || form.price <= 0) {
      setFormError("Name and a price greater than 0 are required")
      return
    }
    setSubmitting(true)
    try {
      if (editTarget) {
        const updated = await productsApi.update(editTarget._id, form)
        setProducts((prev) => prev.map((p) => (p._id === updated._id ? updated : p)))
      } else {
        await productsApi.create(form)
        await load()
      }
      setModalOpen(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save product")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleStatus(p: Product) {
    const newStatus = p.status === "disabled" ? "active" : "disabled"
    setProducts((prev) =>
      prev.map((prod) => (prod._id === p._id ? { ...prod, status: newStatus } : prod))
    )
    try {
      await productsApi.update(p._id, { status: newStatus })
    } catch {
      setProducts((prev) =>
        prev.map((prod) => (prod._id === p._id ? { ...prod, status: p.status } : prod))
      )
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await productsApi.remove(deleteTarget._id)
      setProducts((prev) => prev.filter((p) => p._id !== deleteTarget._id))
      setDeleteTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete product")
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  // Restock
  function openRestock(p: Product) {
    setRestockTarget(p)
    setDelta("")
    setRestockError(null)
  }

  async function handleRestock() {
    if (!restockTarget) return
    const qty = parseInt(delta, 10)
    if (!qty || qty <= 0) {
      setRestockError("Enter a positive whole number")
      return
    }
    setRestocking(true)
    setRestockError(null)
    try {
      const updated = await productsApi.adjustStock(restockTarget._id, qty)
      setProducts((prev) => prev.map((p) => (p._id === updated._id ? updated : p)))
      setRestockTarget(null)
    } catch (err) {
      setRestockError(err instanceof Error ? err.message : "Failed to update stock")
    } finally {
      setRestocking(false)
    }
  }

  const deltaNum = parseInt(delta, 10)
  const newStock = restockTarget && deltaNum > 0 ? restockTarget.stock + deltaNum : null

  const isFiltering = query.trim() !== "" || categoryFilter !== ""

  return (
    <PageShell>
      <PageHeader
        title="Inventory"
        action={isAdmin ? (
          <button onClick={openAdd} className={btnPrimaryCls}>
            <PlusIcon />
            Add product
          </button>
        ) : undefined}
      />

      {!loading && products.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {outCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-500/10 px-3 py-1 text-sm font-medium text-red-500">
              {outCount} out of stock
            </span>
          )}
          {lowCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-yellow-400/20 px-3 py-1 text-sm font-medium text-yellow-600">
              {lowCount} low stock
            </span>
          )}
          {outCount === 0 && lowCount === 0 && (
            <span className="inline-flex items-center rounded-full bg-green-500/10 px-3 py-1 text-sm font-medium text-green-600">
              All products stocked
            </span>
          )}
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <EmptyState>Loading…</EmptyState>
      ) : products.length === 0 && !isFiltering ? (
        <EmptyState>No products yet. Add your first one with the button above.</EmptyState>
      ) : (
        <>
          <Toolbar count={`${visible.length} of ${products.length}`}>
            <SearchBox value={query} onChange={setQuery} placeholder="Search by name, SKU or category…" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className={selectCls + " text-sm"}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </Toolbar>

          {visible.length === 0 ? (
            <EmptyState>No products match the current filters.</EmptyState>
          ) : (
            <>
              <TableCard>
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                    <SortTh label="Name"     col="name"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="SKU"      col="sku"      sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Category" col="category" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    {isAdmin && <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-[var(--text)]">Cost price</th>}
                    <SortTh label="Price"      col="price"    align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Stock"      col="stock"    align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <th className="w-24 px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-[var(--text)]">Status</th>
                    {isAdmin && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((p) => {
                    const cat = catMap.get(p.category ?? "")
                    return (
                      <tr
                        key={p._id}
                        onClick={isAdmin ? () => openEdit(p) : undefined}
                        className={
                          "border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--social-bg)] " +
                          (isAdmin ? "cursor-pointer" : "")
                        }
                      >
                        <td className="px-4 py-3 font-medium text-[var(--text-h)]">{p.name}</td>
                        <td className="px-4 py-3 text-[var(--text)]">{p.sku || "—"}</td>
                        <td className="px-4 py-3">
                          {cat ? (
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: cat.color }} />
                              <span className="text-[var(--text)]">{cat.name}</span>
                            </div>
                          ) : (
                            <span className="text-[var(--text)]">—</span>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3 text-right tabular-nums text-[var(--text)]">
                            {p.costPrice != null ? `₱${p.costPrice.toFixed(2)}` : "—"}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--text-h)]">₱{p.price.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">
                          <StockBadge stock={p.stock} />
                        </td>
                        <td className="px-4 py-3">
                          {isAdmin ? (
                            <div className="flex justify-center">
                              <button
                                onClick={(e) => { e.stopPropagation(); void handleToggleStatus(p) }}
                                title={p.status === "disabled" ? "Enable product" : "Disable product"}
                                className={`flex h-6 w-11 items-center rounded-full border transition-colors ${
                                  p.status !== "disabled"
                                    ? "justify-end border-[var(--accent)] bg-[var(--accent-bg)]"
                                    : "justify-start border-[var(--border)] bg-[var(--social-bg)]"
                                }`}
                              >
                                <span className={`mx-0.5 h-4 w-4 rounded-full transition-colors ${
                                  p.status !== "disabled" ? "bg-[var(--accent)]" : "bg-[var(--text)]"
                                }`} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-center">
                              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                p.status !== "disabled"
                                  ? "bg-green-500/10 text-green-600"
                                  : "bg-[var(--social-bg)] text-[var(--text)]"
                              }`}>
                                {p.status !== "disabled" ? "Available" : "Unavailable"}
                              </span>
                            </div>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); openRestock(p) }}
                                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-xs text-[var(--text-h)] transition hover:bg-[var(--social-bg)]"
                              >
                                <PlusIcon size={12} />
                                Add stock
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); openEdit(p) }} title="Edit product" aria-label="Edit product" className={iconBtnCls}>
                                <PencilIcon />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(p) }} title="Delete product" aria-label="Delete product" className={iconBtnDangerCls}>
                                <TrashIcon />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </TableCard>
              <Paginator page={page} totalPages={totalPages} total={visible.length} onPage={setPage} />
            </>
          )}
        </>
      )}

      {/* Add / Edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? "Edit product" : "Add product"}>
        <form onSubmit={(e) => { e.preventDefault(); void handleSubmit() }} className="flex flex-col gap-3">
          <label className={fieldLabelCls}>
            Name
            <input
              value={form.name}
              onChange={(e) => {
                const name = e.target.value
                setForm((prev) => ({
                  ...prev,
                  name,
                  ...(!editTarget && !skuTouched ? { sku: generateSku(name) } : {}),
                }))
              }}
              placeholder="e.g. Coca-Cola 1L"
              className={inputCls}
              autoFocus
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className={fieldLabelCls}>
              SKU
              <div className="flex gap-1.5">
                <input
                  value={form.sku}
                  onChange={(e) => { setSkuTouched(true); setForm({ ...form, sku: e.target.value }) }}
                  placeholder="e.g. CC-1L"
                  className={`${inputCls} flex-1 min-w-0`}
                />
                {!editTarget && (
                  <button
                    type="button"
                    title="Generate a new SKU"
                    onClick={() => { setSkuTouched(false); setForm((prev) => ({ ...prev, sku: generateSku(prev.name) })) }}
                    className="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text)] transition-colors hover:bg-[var(--social-bg)] hover:text-[var(--text-h)]"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 4v6h6" /><path d="M23 20v-6h-6" />
                      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <label className={fieldLabelCls}>
              Category
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={`w-full ${selectCls}`}
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className={fieldLabelCls}>
              Cost price (₱)
              <input
                type="number" min="0" step="0.01"
                value={form.costPrice ?? ""}
                onChange={(e) => setForm({ ...form, costPrice: e.target.value !== "" ? Number(e.target.value) : null })}
                placeholder="optional"
                className={inputCls}
              />
            </label>
            <label className={fieldLabelCls}>
              Selling price (₱)
              <input type="number" min="0" step="0.01" value={form.price || ""} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} placeholder="0.00" className={inputCls} />
            </label>
          </div>
          {form.costPrice != null && form.price > 0 && (() => {
            const profit = form.price - form.costPrice
            const margin = (profit / form.price) * 100
            return (
              <p className={`text-xs ${profit >= 0 ? "text-green-600" : "text-red-500"}`}>
                Profit ₱{profit.toFixed(2)} · {margin.toFixed(1)}% margin
              </p>
            )
          })()}

          {editTarget ? (
            <div className={fieldLabelCls}>
              Stock
              <div className="flex h-10 items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 tabular-nums text-[var(--text)]">
                {editTarget.stock}
                <span className="ml-1.5 text-xs">remaining — use Add stock to adjust</span>
              </div>
            </div>
          ) : (
            <label className={fieldLabelCls}>
              Initial stock
              <input type="number" min="0" value={form.stock || ""} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} placeholder="0" className={inputCls} />
            </label>
          )}

          <div className="flex items-center justify-between border-t border-[var(--border)] pt-3">
            <span className="text-sm text-[var(--text-h)]">Quantity discount</span>
            <button
              type="button"
              onClick={() => {
                const next = !discountOn
                setDiscountOn(next)
                if (!next) setForm((prev) => ({ ...prev, discountQty: null, discountPrice: null }))
              }}
              className={`flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                discountOn
                  ? "justify-end border-[var(--accent)] bg-[var(--accent-bg)]"
                  : "justify-start border-[var(--border)] bg-[var(--social-bg)]"
              }`}
            >
              <span className={`mx-0.5 h-4 w-4 rounded-full transition-colors ${
                discountOn ? "bg-[var(--accent)]" : "bg-[var(--text)]"
              }`} />
            </button>
          </div>

          {discountOn && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-3">
                <label className={fieldLabelCls}>
                  Trigger qty
                  <input
                    type="number" min="2" step="1"
                    value={form.discountQty ?? ""}
                    onChange={(e) => setForm({ ...form, discountQty: e.target.value !== "" ? Math.max(2, Math.floor(Number(e.target.value))) : null, discountPrice: null })}
                    placeholder="e.g. 3"
                    className={inputCls}
                  />
                </label>
                <label className={fieldLabelCls}>
                  Total price (₱)
                  <input
                    type="number" min="0" step="0.01"
                    value={form.discountPrice ?? ""}
                    onChange={(e) => setForm({ ...form, discountPrice: e.target.value !== "" ? Number(e.target.value) : null })}
                    placeholder={form.discountQty ? `e.g. ${((form.price || 0) * (form.discountQty || 1) - 1).toFixed(2)}` : "—"}
                    disabled={!form.discountQty}
                    className={inputCls}
                  />
                </label>
              </div>
              {form.discountQty && form.discountPrice != null && (() => {
                const regular = (form.price || 0) * form.discountQty
                const saving = regular - form.discountPrice
                return saving > 0 ? (
                  <p className="text-xs text-green-600">
                    Buy {form.discountQty} → ₱{form.discountPrice.toFixed(2)} · saves ₱{saving.toFixed(2)}
                  </p>
                ) : null
              })()}
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

      {/* Delete confirmation modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Remove product?">
        <p className="text-[var(--text)]">
          This will permanently delete{" "}
          <span className="font-medium text-[var(--text-h)]">{deleteTarget?.name}</span>
          . This cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setDeleteTarget(null)} className={btnOutlineCls}>Cancel</button>
          <button onClick={handleDelete} disabled={deleting} className={btnDangerCls}>
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Modal>

      {/* Restock modal */}
      <Modal
        open={!!restockTarget}
        onClose={() => setRestockTarget(null)}
        title={`Add stock — ${restockTarget?.name ?? ""}`}
      >
        {restockTarget && (
          <form
            onSubmit={(e) => { e.preventDefault(); void handleRestock() }}
            className="flex flex-col gap-4"
          >
            <div className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-4 py-3">
              <span className="text-sm text-[var(--text)]">Current stock</span>
              <span className="font-semibold tabular-nums text-[var(--text-h)]">{restockTarget.stock}</span>
            </div>

            <label className={fieldLabelCls}>
              Quantity to add
              <input
                type="number"
                min="1"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                placeholder="e.g. 50"
                className={inputCls}
                autoFocus
              />
            </label>

            {newStock !== null && (
              <div className="flex items-center justify-between rounded-lg border border-[var(--accent-border)] bg-[var(--accent-bg)] px-4 py-3 text-sm">
                <span className="text-[var(--text)]">New stock</span>
                <span className="font-semibold tabular-nums text-[var(--accent)]">
                  {restockTarget.stock} + {deltaNum} = {newStock}
                </span>
              </div>
            )}

            {restockError && <p className="text-sm text-red-500">{restockError}</p>}

            <div className="mt-1 flex justify-end gap-3">
              <button type="button" onClick={() => setRestockTarget(null)} className={btnOutlineCls}>Cancel</button>
              <button
                type="submit"
                disabled={restocking || !delta || deltaNum <= 0}
                className={btnPrimaryCls}
              >
                {restocking ? "Saving…" : newStock !== null ? `Add ${deltaNum} units` : "Add stock"}
              </button>
            </div>
          </form>
        )}
      </Modal>

    </PageShell>
  )
}
