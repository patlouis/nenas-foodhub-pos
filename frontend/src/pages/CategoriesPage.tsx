import { useEffect, useMemo, useState } from "react"
import type { Category, NewCategory } from "../types"
import { categoriesApi } from "../api"
import { useAuth } from "../auth"
import Modal from "../components/Modal"
import {
  PageShell, PageHeader, ErrorBanner, Toolbar, SearchBox, TableCard, EmptyState,
  GripIcon, PlusIcon, PencilIcon, TrashIcon,
  inputCls, btnPrimaryCls, btnOutlineCls, btnDangerCls,
  iconBtnCls, iconBtnDangerCls, fieldLabelCls, PAGE_SIZE, Paginator,
} from "../components/ui"

const DEFAULT_COLOR = "#aa3bff"
const EMPTY: NewCategory = { name: "", color: DEFAULT_COLOR }

export default function CategoriesPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"

  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)

  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Category | null>(null)
  const [form, setForm] = useState<NewCategory>(EMPTY)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Drag state — null when not dragging
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setCategories(await categoriesApi.list())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load categories")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Always sort by the stored order field; search just filters the view.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories
    return [...filtered].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }, [categories, query])

  useEffect(() => { setPage(1) }, [query])

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const paged = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const isDragMode = !query.trim()

  // ---- drag handlers ----
  function onDragStart(e: React.DragEvent<HTMLTableCellElement>, idx: number) {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = "move"
  }

  function onDragOver(e: React.DragEvent<HTMLTableRowElement>, idx: number) {
    e.preventDefault()
    setDragOverIdx(idx)
  }

  function onDrop(e: React.DragEvent<HTMLTableRowElement>, targetIdx: number) {
    e.preventDefault()
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null)
      setDragOverIdx(null)
      return
    }

    const reordered = [...visible]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(targetIdx, 0, moved)

    const withNewOrder = reordered.map((c, i) => ({ ...c, order: i }))

    // Optimistic update
    setCategories((prev) => {
      const map = new Map(withNewOrder.map((c) => [c._id, c]))
      return prev.map((c) => map.get(c._id) ?? c)
    })

    // Persist — reload on failure
    categoriesApi
      .reorder(withNewOrder.map((c) => ({ id: c._id, order: c.order })))
      .catch(() => load())

    setDragIdx(null)
    setDragOverIdx(null)
  }

  function onDragEnd() {
    setDragIdx(null)
    setDragOverIdx(null)
  }

  // ---- modal ----
  function openAdd() {
    setEditTarget(null)
    setForm(EMPTY)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(c: Category) {
    setEditTarget(c)
    setForm({ name: c.name, color: c.color || DEFAULT_COLOR })
    setFormError(null)
    setModalOpen(true)
  }

  async function handleSubmit() {
    setFormError(null)
    if (!form.name.trim()) {
      setFormError("Category name is required")
      return
    }
    setSubmitting(true)
    try {
      if (editTarget) {
        await categoriesApi.update(editTarget._id, form)
      } else {
        await categoriesApi.create(form)
      }
      await load()
      setModalOpen(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save category")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await categoriesApi.remove(deleteTarget._id)
      setCategories((prev) => prev.filter((c) => c._id !== deleteTarget._id))
      setDeleteTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete category")
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  const isFiltering = query.trim() !== ""

  return (
    <PageShell>
      <PageHeader
        title="Categories"
        action={isAdmin ? (
          <button onClick={openAdd} className={btnPrimaryCls}>
            <PlusIcon />
            Add category
          </button>
        ) : undefined}
      />

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <EmptyState>Loading…</EmptyState>
      ) : categories.length === 0 ? (
        <EmptyState>No categories yet. Add your first one with the button above.</EmptyState>
      ) : (
        <>
          <Toolbar
            count={isFiltering ? `${visible.length} of ${categories.length}` : `${categories.length} total`}
          >
            <SearchBox value={query} onChange={setQuery} placeholder="Search categories…" />
            {isAdmin && isDragMode && (
              <span className="text-xs text-[var(--text)] ml-1">
                Drag rows to reorder
              </span>
            )}
          </Toolbar>

          {visible.length === 0 ? (
            <EmptyState>No categories match &ldquo;{query}&rdquo;.</EmptyState>
          ) : (
            <>
            <TableCard>
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                  {isAdmin && isDragMode && <th className="w-10 px-3 py-3" />}
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--text)] w-2/5">Name</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-[var(--text)] w-28">Products</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody onDragEnd={onDragEnd}>
                {paged.map((c, idx) => {
                  const isBeingDragged = dragIdx === idx
                  const isDropTarget = dragOverIdx === idx && dragIdx !== null && dragIdx !== idx
                  return (
                    <tr
                      key={c._id}
                      onDragOver={isAdmin && isDragMode ? (e) => onDragOver(e, idx) : undefined}
                      onDrop={isAdmin && isDragMode ? (e) => onDrop(e, idx) : undefined}
                      onDragLeave={isAdmin && isDragMode ? () => setDragOverIdx(null) : undefined}
                      className={
                        "border-b border-[var(--border)] transition-colors last:border-0 " +
                        (isBeingDragged ? "opacity-40 " : "") +
                        (isDropTarget ? "bg-[var(--accent-bg)] " : "hover:bg-[var(--social-bg)]")
                      }
                    >
                      {isAdmin && isDragMode && (
                        <td
                          draggable
                          onDragStart={(e) => onDragStart(e, idx)}
                          className="w-10 cursor-grab px-3 py-3 text-[var(--text)] active:cursor-grabbing"
                        >
                          <GripIcon size={15} />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: c.color || DEFAULT_COLOR }}
                          />
                          <span className="font-medium text-[var(--text-h)]">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {c.productCount ? (
                          <span className="text-[var(--text-h)]">{c.productCount}</span>
                        ) : (
                          <span className="text-[var(--text)]">0</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(c)} title="Edit category" aria-label="Edit category" className={iconBtnCls}>
                              <PencilIcon />
                            </button>
                            <button onClick={() => setDeleteTarget(c)} title="Delete category" aria-label="Delete category" className={iconBtnDangerCls}>
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
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? "Edit category" : "Add category"}>
        <form onSubmit={(e) => { e.preventDefault(); void handleSubmit() }} className="flex flex-col gap-4">
          <label className={fieldLabelCls}>
            Name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Beverages"
              className={inputCls}
              autoFocus
            />
          </label>

          <div className={fieldLabelCls}>
            Color
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1"
              />
              <div className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-[var(--border)] px-3">
                <span
                  className="h-4 w-4 shrink-0 rounded-full"
                  style={{ backgroundColor: form.color }}
                />
                <span className="text-sm tabular-nums text-[var(--text)]">{form.color}</span>
              </div>
            </div>
          </div>

          {formError && <p className="text-sm text-red-500">{formError}</p>}

          <div className="mt-1 flex justify-end gap-3">
            <button type="button" onClick={() => setModalOpen(false)} className={btnOutlineCls}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} className={btnPrimaryCls}>
              {submitting ? "Saving…" : editTarget ? "Save changes" : "Add category"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Remove category?">
        <p className="text-[var(--text)]">
          This will permanently delete{" "}
          <span className="font-medium text-[var(--text-h)]">{deleteTarget?.name}</span>.{" "}
          {deleteTarget?.productCount
            ? `${deleteTarget.productCount} product${deleteTarget.productCount === 1 ? "" : "s"} currently use${deleteTarget.productCount === 1 ? "s" : ""} it — they keep the category name, but it will no longer appear in filters.`
            : "No products are using it."}
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
