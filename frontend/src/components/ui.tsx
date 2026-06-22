// Shared UI primitives for the Products / Categories / Users pages.
// Every toolbar control is exactly h-10 so headers and toolbars line up.

import type { ReactNode } from "react"

/* ---------- control classes ---------- */

const controlBase =
  "h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-[15px] text-[var(--text-h)] outline-none transition focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-[var(--accent)]"

export const inputCls = `w-full ${controlBase} placeholder:text-[var(--text)]`
export const selectCls = `${controlBase} cursor-pointer`

export const btnPrimaryCls =
  "inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 text-[15px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
export const btnOutlineCls =
  "inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] px-4 text-[15px] text-[var(--text-h)] transition hover:bg-[var(--social-bg)]"
export const btnDangerCls =
  "inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-red-500 px-4 text-[15px] font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"

export const iconBtnCls =
  "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[var(--text)] transition hover:bg-[var(--social-bg)] hover:text-[var(--text-h)]"
export const iconBtnDangerCls =
  "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[var(--text)] transition hover:bg-red-500/10 hover:text-red-500"

export const fieldLabelCls =
  "flex flex-col gap-1.5 text-[15px] text-[var(--text-h)]"

/* ---------- icons ---------- */

type IconProps = { size?: number }

export function PlusIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

export function SearchIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

export function XSmallIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function PencilIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

export function TrashIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

export function BanIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M4.93 4.93l14.14 14.14" />
    </svg>
  )
}

export function EyeIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function GripIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9"  cy="5"  r="1.5" />
      <circle cx="15" cy="5"  r="1.5" />
      <circle cx="9"  cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9"  cy="19" r="1.5" />
      <circle cx="15" cy="19" r="1.5" />
    </svg>
  )
}

export function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={active ? "text-[var(--accent)]" : "opacity-25"}>
      {active ? (
        dir === "asc"
          ? <path d="M12 19V5M5 12l7-7 7 7" />
          : <path d="M12 5v14M19 12l-7 7-7-7" />
      ) : (
        <>
          <path d="M8 9l4-4 4 4" />
          <path d="M16 15l-4 4-4-4" />
        </>
      )}
    </svg>
  )
}

/* ---------- table sort header ---------- */

export function SortTh<K extends string>({
  label, col, align = "left", className = "", sortKey, sortDir, onSort,
}: {
  label: string
  col: K
  align?: "left" | "right"
  className?: string
  sortKey: K
  sortDir: "asc" | "desc"
  onSort: (col: K) => void
}) {
  const active = sortKey === col
  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : ""} ${className}`}>
      <button
        onClick={() => onSort(col)}
        className={
          "inline-flex cursor-pointer items-center gap-1 text-xs font-medium uppercase tracking-wide transition-colors " +
          (active ? "text-[var(--accent)]" : "text-[var(--text)] hover:text-[var(--text-h)]")
        }
      >
        {label}
        <SortIcon active={active} dir={sortDir} />
      </button>
    </th>
  )
}

/* ---------- layout pieces ---------- */

// Page container: consistent gutters and a max width so tables don't
// stretch edge-to-edge on very wide screens.
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {children}
    </div>
  )
}

// Title row: h1 on the left, primary action pinned to the right —
// identical position on every page.
export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="m-0">{title}</h1>
      {action}
    </div>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">
      {message}
    </p>
  )
}

// Search input with the magnifier and a clear (×) button, fixed h-10.
export function SearchBox({
  value, onChange, placeholder,
}: {
  value: string
  onChange: (next: string) => void
  placeholder: string
}) {
  return (
    <div className="relative w-full max-w-xs">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--text)]">
        <SearchIcon />
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} pl-9 pr-8 text-sm`}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute inset-y-0 right-2 flex cursor-pointer items-center text-[var(--text)] transition hover:text-[var(--text-h)]"
        >
          <XSmallIcon />
        </button>
      )}
    </div>
  )
}

// Toolbar row above the table: keeps controls h-10 and the count right-aligned.
export function Toolbar({ children, count }: { children: ReactNode; count?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {children}
      {count && (
        <span className="ml-auto shrink-0 text-sm tabular-nums text-[var(--text)]">
          {count}
        </span>
      )}
    </div>
  )
}

export function TableCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  )
}

// Centered message in a bordered card, so loading/empty states hold the
// same footprint as the table they replace.
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-14 text-center text-[var(--text)]">
      {children}
    </div>
  )
}

export const PAGE_SIZE = 5

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50]

export function Paginator({
  page,
  totalPages,
  total,
  pageSize = PAGE_SIZE,
  onPage,
  onPageSize,
}: {
  page: number
  totalPages: number
  total: number
  pageSize?: number
  onPage: (p: number) => void
  onPageSize?: (n: number) => void
}) {
  if (total === 0) return null

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  // Build page number list with ellipsis for long ranges
  const pages: (number | "…")[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 3) pages.push("…")
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
    if (page < totalPages - 2) pages.push("…")
    pages.push(totalPages)
  }

  const btn = "flex h-9 min-w-[2.25rem] cursor-pointer items-center justify-center rounded-lg px-2 text-sm font-medium transition"
  const chevronCls = (disabled: boolean) =>
    `${btn} ${disabled ? "cursor-not-allowed opacity-35 text-[var(--text)]" : "text-[var(--text)] hover:bg-[var(--social-bg)] hover:text-[var(--text-h)]"}`

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="text-sm tabular-nums text-[var(--text)]">
          {from}–{to} of {total}
        </span>
        {onPageSize && (
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className={selectCls + " text-sm"}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(page - 1)} disabled={page === 1} aria-label="Previous page" className={chevronCls(page === 1)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        {pages.map((p, i) =>
          typeof p === "string" ? (
            <span key={`el-${i}`} className="flex h-9 w-7 items-center justify-center text-sm text-[var(--text)]">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`${btn} ${page === p ? "bg-[var(--accent)] text-white" : "text-[var(--text)] hover:bg-[var(--social-bg)] hover:text-[var(--text-h)]"}`}
            >
              {p}
            </button>
          )
        )}

        <button onClick={() => onPage(page + 1)} disabled={page === totalPages} aria-label="Next page" className={chevronCls(page === totalPages)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
