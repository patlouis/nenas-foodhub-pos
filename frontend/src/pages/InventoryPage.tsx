import { useEffect, useMemo, useState } from "react"
import type { Product, Category } from "../types"
import { productsApi, categoriesApi } from "../api"
import { useAuth } from "../auth"
import Modal from "../components/Modal"
import {
  PageShell, PageHeader, ErrorBanner, Toolbar, SearchBox, TableCard, EmptyState,
  SortTh, PlusIcon, inputCls, selectCls, btnPrimaryCls, btnOutlineCls, fieldLabelCls, PAGE_SIZE, Paginator,
} from "../components/ui"

type SortKey = "name" | "category" | "stock"

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
  const [sortKey, setSortKey] = useState<SortKey>("stock")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [page, setPage] = useState(1)

  const [restockTarget, setRestockTarget] = useState<Product | null>(null)
  const [delta, setDelta] = useState("")
  const [restockError, setRestockError] = useState<string | null>(null)
  const [restocking, setRestocking] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [prodsResult, catsResult] = await Promise.allSettled([
        // Stock-alert counts and the search/sort table need the whole
        // catalog in memory, not one server-paginated page of it.
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

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir("asc") }
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

  const outCount = products.filter((p) => p.stock === 0).length
  const lowCount = products.filter((p) => p.stock > 0 && p.stock <= 5).length

  return (
    <PageShell>
      <PageHeader title="Inventory" />

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
      ) : products.length === 0 ? (
        <EmptyState>No products yet — add some on the Products page.</EmptyState>
      ) : (
        <>
          <Toolbar count={`${visible.length} of ${products.length}`}>
            <SearchBox value={query} onChange={setQuery} placeholder="Search by product or category…" />
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
                  <SortTh label="Product"  col="name"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Category" col="category" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Stock"    col="stock"    align="right" className="w-40" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  {isAdmin && <th className="w-36 px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {paged.map((p) => {
                  const cat = catMap.get(p.category ?? "")
                  return (
                    <tr
                      key={p._id}
                      className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--social-bg)]"
                    >
                      <td className="px-4 py-3 font-medium text-[var(--text-h)]">{p.name}</td>
                      <td className="px-4 py-3">
                        {cat ? (
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: cat.color }}
                            />
                            <span className="text-[var(--text)]">{cat.name}</span>
                          </div>
                        ) : (
                          <span className="text-[var(--text)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <StockBadge stock={p.stock} />
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            <button
                              onClick={() => openRestock(p)}
                              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--text-h)] transition hover:bg-[var(--social-bg)]"
                            >
                              <PlusIcon size={13} />
                              Add stock
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
              <span className="font-semibold tabular-nums text-[var(--text-h)]">
                {restockTarget.stock}
              </span>
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
              <button type="button" onClick={() => setRestockTarget(null)} className={btnOutlineCls}>
                Cancel
              </button>
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
