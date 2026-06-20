import { useCallback, useEffect, useRef, useState } from "react"
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

type SortKey = "category" | "name" | "sku" | "price" | "stock"
type SortDir = "asc" | "desc"

const EMPTY: NewProduct = { name: "", sku: "", price: 0, stock: 0, category: "", discountQty: null, discountPrice: null }

export default function ProductsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isFirstLoad = useRef(true)

  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("category")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Product | null>(null)
  const [form, setForm] = useState<NewProduct>(EMPTY)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [skuTouched, setSkuTouched] = useState(false)
  const [discountOn, setDiscountOn] = useState(false)

  // Generated SKUs are only checked against the currently loaded page —
  // the backend's unique index is the real guard, so a rare collision just
  // surfaces as a 409 the user can retry by regenerating.
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

  // Categories are few and unpaginated — load once.
  useEffect(() => {
    categoriesApi.list().then(setCategories).catch(() => {})
  }, [])

  // Debounce search so we don't fire a request on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => { setPage(1) }, [debouncedQuery, categoryFilter, sortKey, sortDir])

  const fetchProducts = useCallback(async () => {
    if (isFirstLoad.current) setLoading(true)
    setError(null)
    try {
      const res = await productsApi.list({
        page, limit: PAGE_SIZE,
        q: debouncedQuery || undefined,
        category: categoryFilter || undefined,
        sortKey, sortDir,
      })
      setProducts(res.data)
      setTotal(res.total)
      setTotalPages(res.totalPages)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products")
    } finally {
      setLoading(false)
      isFirstLoad.current = false
    }
  }, [page, debouncedQuery, categoryFilter, sortKey, sortDir])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const catMap = new Map(categories.map((c) => [c._id, c]))

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
    setForm({ name: p.name, sku: p.sku ?? "", price: p.price, stock: p.stock, category: p.category ?? "", discountQty: p.discountQty ?? null, discountPrice: p.discountPrice ?? null })
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
        // Jump to page 1 so the new product is visible; if we were already
        // there the page-change effect won't fire, so refetch explicitly.
        if (page === 1) await fetchProducts()
        else setPage(1)
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
      setDeleteTarget(null)
      // Deleting the last item on a page (other than page 1) would leave
      // an empty page — step back instead. Either way the effect (or this
      // direct call) refetches so the list reflects the deletion.
      if (products.length === 1 && page > 1) setPage((p) => p - 1)
      else await fetchProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete product")
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  const isFiltering = query.trim() !== "" || categoryFilter !== ""

  return (
    <PageShell>
      <PageHeader
        title="Products"
        action={isAdmin ? (
          <button onClick={openAdd} className={btnPrimaryCls}>
            <PlusIcon />
            Add product
          </button>
        ) : undefined}
      />

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <EmptyState>Loading…</EmptyState>
      ) : total === 0 && !isFiltering ? (
        <EmptyState>No products yet. Add your first one with the button above.</EmptyState>
      ) : (
        <>
          <Toolbar count={`${total} product${total === 1 ? "" : "s"}`}>
            <SearchBox value={query} onChange={setQuery} placeholder="Search by name or SKU…" />
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

          {total === 0 ? (
            <EmptyState>No products match the current filters.</EmptyState>
          ) : (
            <>
            <TableCard>
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                  <SortTh label="Name"     col="name"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="SKU"      col="sku"      sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Category" col="category" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Price"    col="price"    align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Stock"    col="stock"    align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <th className="w-20 px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-[var(--text)]">Status</th>
                  {isAdmin && <th className="w-20 px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const cat = catMap.get(p.category ?? "")
                  return (
                    <tr
                      key={p._id}
                      className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--social-bg)]"
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
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--text-h)]">₱{p.price.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--text-h)]">{p.stock}</td>
                      <td className="px-4 py-3">
                        {isAdmin ? (
                          <div className="flex justify-center">
                            <button
                              onClick={() => handleToggleStatus(p)}
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
                            <button onClick={() => openEdit(p)} title="Edit product" aria-label="Edit product" className={iconBtnCls}>
                              <PencilIcon />
                            </button>
                            <button onClick={() => setDeleteTarget(p)} title="Delete product" aria-label="Delete product" className={iconBtnDangerCls}>
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
            <Paginator page={page} totalPages={totalPages} total={total} onPage={setPage} />
            </>
          )}
        </>
      )}

      {/* Add / Edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? "Edit product" : "Add product"}>
        <form onSubmit={(e) => { e.preventDefault(); void handleSubmit() }} className="flex flex-col gap-3">
          {/* Name */}
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

          {/* SKU + Category */}
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

          {/* Price + Stock */}
          <div className="grid grid-cols-2 gap-3">
            <label className={fieldLabelCls}>
              Price (₱)
              <input type="number" min="0" step="0.01" value={form.price || ""} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} placeholder="0.00" className={inputCls} />
            </label>
            {editTarget ? (
              <div className={fieldLabelCls}>
                Stock
                <div className="flex h-10 items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 tabular-nums text-[var(--text)]">
                  {editTarget.stock}
                  <span className="ml-1.5 text-xs">remaining</span>
                </div>
              </div>
            ) : (
              <label className={fieldLabelCls}>
                Initial stock
                <input type="number" min="0" value={form.stock || ""} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} placeholder="0" className={inputCls} />
              </label>
            )}
          </div>

          {/* Quantity discount toggle */}
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
                    autoFocus
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
          <button onClick={() => setDeleteTarget(null)} className={btnOutlineCls}>
            Cancel
          </button>
          <button onClick={handleDelete} disabled={deleting} className={btnDangerCls}>
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Modal>
    </PageShell>
  )
}
