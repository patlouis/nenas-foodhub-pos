import type { Theme } from "../useTheme"
import type { Role } from "../types"

export type Page = "dashboard" | "order" | "history" | "products" | "categories" | "inventory" | "users"

type SidebarProps = {
  current: Page
  onNavigate: (page: Page) => void
  open: boolean
  theme: Theme
  onToggleTheme: () => void
  userName: string
  userRole: Role
  onLogout: () => void
}

function DashboardIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function OrderIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  )
}

function HistoryIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function ProductsIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  )
}

function CategoriesIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )
}

function InventoryIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  )
}

function UsersIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

const NAV_ITEMS: { id: Page; label: string; Icon: () => React.JSX.Element; adminOnly?: boolean }[] = [
  { id: "dashboard",  label: "Dashboard",     Icon: DashboardIcon, adminOnly: true },
  { id: "order",      label: "New Order",     Icon: OrderIcon      },
  { id: "history",    label: "Order History", Icon: HistoryIcon    },
  { id: "products",   label: "Products",      Icon: ProductsIcon   },
  { id: "categories", label: "Categories",    Icon: CategoriesIcon },
  { id: "inventory",  label: "Inventory",     Icon: InventoryIcon  },
  { id: "users",      label: "Users",         Icon: UsersIcon,     adminOnly: true },
]

export default function Sidebar({
  current,
  onNavigate,
  open,
  theme,
  onToggleTheme,
  userName,
  userRole,
  onLogout,
}: SidebarProps) {
  return (
    <aside
      className={
        "fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col gap-2 overflow-y-auto border-r border-[var(--border)] bg-[var(--bg)] p-4 transition-transform duration-200 lg:static lg:z-auto lg:h-dvh lg:translate-x-0 " +
        (open ? "translate-x-0" : "-translate-x-full")
      }
    >
      <div className="px-2 pb-4 pt-1">
        <span className="text-[22px] font-semibold tracking-tight text-[var(--text-h)]">
          POS System
        </span>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.filter(({ adminOnly }) => !adminOnly || userRole === "admin").map(({ id, label, Icon }) => {
          const active = current === id
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-base transition-colors " +
                (active
                  ? "bg-[var(--accent-bg)] font-medium text-[var(--accent)]"
                  : "text-[var(--text)] hover:bg-[var(--social-bg)] hover:text-[var(--text-h)]")
              }
            >
              <Icon />
              {label}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2 border-t border-[var(--border)] pt-3">
        <div className="flex items-center gap-2 px-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-[var(--text)]">
              Signed in as{" "}
              <span className="font-medium text-[var(--text-h)]">{userName}</span>
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
            userRole === "admin"
              ? "bg-[var(--accent-bg)] text-[var(--accent)]"
              : "bg-[var(--social-bg)] text-[var(--text)]"
          }`}>
            {userRole}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onLogout}
            className="cursor-pointer flex-1 rounded-lg border border-[var(--border)] px-3 py-2.5 text-base text-[var(--text-h)] transition-colors hover:bg-[var(--social-bg)]"
          >
            Log out
          </button>
          <button
            onClick={onToggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label="Toggle theme"
            className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-h)] transition-colors hover:bg-[var(--social-bg)]"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>
    </aside>
  )
}
