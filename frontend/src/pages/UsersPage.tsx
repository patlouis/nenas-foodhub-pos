import { useEffect, useMemo, useState } from "react"
import type { User, NewUser, Role } from "../types"
import { usersApi } from "../api"
import Modal from "../components/Modal"
import {
  PageShell, PageHeader, ErrorBanner, Toolbar, SearchBox, TableCard, EmptyState,
  SortTh, PlusIcon, PencilIcon, TrashIcon,
  inputCls, selectCls, btnPrimaryCls, btnOutlineCls, btnDangerCls,
  iconBtnCls, iconBtnDangerCls, fieldLabelCls, PAGE_SIZE, Paginator,
} from "../components/ui"

type SortKey = "name" | "email" | "role"
type SortDir = "asc" | "desc"

const EMPTY: NewUser = { name: "", email: "", password: "", role: "cashier" }

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all")
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [page, setPage] = useState(1)

  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [form, setForm] = useState<NewUser>(EMPTY)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setUsers(await usersApi.list())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = users.filter((u) => {
      const matchesRole = roleFilter === "all" || u.role === roleFilter
      const matchesQuery =
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      return matchesRole && matchesQuery
    })
    return [...filtered].sort((a, b) => {
      const av = a[sortKey].toLowerCase()
      const bv = b[sortKey].toLowerCase()
      if (av < bv) return sortDir === "asc" ? -1 : 1
      if (av > bv) return sortDir === "asc" ? 1 : -1
      return 0
    })
  }, [users, query, roleFilter, sortKey, sortDir])

  function openAdd() {
    setEditTarget(null)
    setForm(EMPTY)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(u: User) {
    setEditTarget(u)
    setForm({ name: u.name, email: u.email, password: "", role: u.role })
    setFormError(null)
    setModalOpen(true)
  }

  async function handleSubmit() {
    setFormError(null)

    if (editTarget) {
      if (!form.name || !form.email) {
        setFormError("Name and email are required")
        return
      }
      if (form.password && form.password.length < 6) {
        setFormError("New password must be at least 6 characters")
        return
      }
    } else {
      if (!form.name || !form.email || !form.password) {
        setFormError("Name, email, and password are required")
        return
      }
      if (form.password.length < 6) {
        setFormError("Password must be at least 6 characters")
        return
      }
    }

    setSubmitting(true)
    try {
      if (editTarget) {
        const payload: Partial<NewUser> = { name: form.name, email: form.email, role: form.role }
        if (form.password) payload.password = form.password
        const updated = await usersApi.update(editTarget._id, payload)
        setUsers((prev) => prev.map((u) => (u._id === updated._id ? updated : u)))
      } else {
        await usersApi.create(form)
        await load()
      }
      setModalOpen(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save user")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await usersApi.remove(deleteTarget._id)
      setUsers((prev) => prev.filter((u) => u._id !== deleteTarget._id))
      setDeleteTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user")
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => { setPage(1) }, [query, roleFilter, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const paged = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const isFiltering = query.trim() !== "" || roleFilter !== "all"

  return (
    <PageShell>
      <PageHeader
        title="Users"
        action={
          <button onClick={openAdd} className={btnPrimaryCls}>
            <PlusIcon />
            Create user
          </button>
        }
      />

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <EmptyState>Loading…</EmptyState>
      ) : users.length === 0 ? (
        <EmptyState>No users yet. Create your first one with the button above.</EmptyState>
      ) : (
        <>
          <Toolbar
            count={isFiltering ? `${visible.length} of ${users.length}` : `${users.length} total`}
          >
            <SearchBox value={query} onChange={setQuery} placeholder="Search by name or email…" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as Role | "all")}
              className={selectCls + " text-sm"}
            >
              <option value="all">All roles</option>
              <option value="admin">Admin</option>
              <option value="cashier">Cashier</option>
            </select>
          </Toolbar>

          {visible.length === 0 ? (
            <EmptyState>No users match the current filters.</EmptyState>
          ) : (
            <>
            <TableCard>
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                  <SortTh label="Name"  col="name"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Email" col="email" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Role"  col="role"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <th className="w-24 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {paged.map((u) => (
                  <tr
                    key={u._id}
                    className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--social-bg)]"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--text-h)]">{u.name}</td>
                    <td className="px-4 py-3 text-[var(--text)]">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-[var(--accent-bg)] px-2.5 py-0.5 text-sm capitalize text-[var(--accent)]">
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(u)} title="Edit user" aria-label="Edit user" className={iconBtnCls}>
                          <PencilIcon />
                        </button>
                        <button onClick={() => setDeleteTarget(u)} title="Delete user" aria-label="Delete user" className={iconBtnDangerCls}>
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
            <Paginator page={page} totalPages={totalPages} total={visible.length} onPage={setPage} />
            </>
          )}
        </>
      )}

      {/* Create / Edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? "Edit user" : "Create user"}>
        <form onSubmit={(e) => { e.preventDefault(); void handleSubmit() }} className="flex flex-col gap-4">
          <label className={fieldLabelCls}>
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Cashier" className={inputCls} autoFocus />
          </label>
          <label className={fieldLabelCls}>
            Email
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@example.com" className={inputCls} />
          </label>
          <label className={fieldLabelCls}>
            {editTarget ? "New password" : "Password"}
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editTarget ? "Leave blank to keep current" : "At least 6 characters"} className={inputCls} />
          </label>
          <label className={fieldLabelCls}>
            Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className={`w-full ${selectCls}`}>
              <option value="cashier">Cashier</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          {formError && <p className="text-sm text-red-500">{formError}</p>}

          <div className="mt-1 flex justify-end gap-3">
            <button type="button" onClick={() => setModalOpen(false)} className={btnOutlineCls}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} className={btnPrimaryCls}>
              {submitting ? "Saving…" : editTarget ? "Save changes" : "Create user"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Remove user?">
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
