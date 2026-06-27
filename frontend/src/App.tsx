import { useEffect, useRef, useState } from "react"
import Sidebar, { type Page } from "./components/Sidebar"
import OrderPage from "./pages/OrderPage"
import OrderHistoryPage from "./pages/OrderHistoryPage"
import InventoryPage from "./pages/InventoryPage"
import InventoryLogPage from "./pages/InventoryLogPage"
import CategoriesPage from "./pages/CategoriesPage"
import UsersPage from "./pages/UsersPage"
import DashboardPage from "./pages/DashboardPage"
import LoginPage from "./pages/LoginPage"
import { useTheme } from "./hooks/useTheme"
import { useAuth } from "./auth"
import { WAKING_UP_EVENT, WAKE_COMPLETE_EVENT } from "./api"

function WakingUpBanner() {
  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-amber-500 py-2 px-4 text-center text-sm font-medium text-white shadow-md">
      Server is waking up — please wait up to 30 seconds…
    </div>
  )
}

function App() {
  const { user, logout } = useAuth()

  const ADMIN_ONLY: Page[] = ["dashboard", "inventory-log", "users"]

  function defaultPage(role: string | undefined): Page {
    return role === "admin" ? "dashboard" : "order"
  }

  const [page, setPage] = useState<Page>(() => {
    if (!user) return "order"
    const stored = localStorage.getItem("currentPage") as Page | null
    if (stored && !(ADMIN_ONLY.includes(stored) && user.role !== "admin")) return stored
    return defaultPage(user.role)
  })

  // Persist active page across refreshes
  useEffect(() => {
    localStorage.setItem("currentPage", page)
  }, [page])

  // Reset to role default when a different user logs in after a logout
  const justLoggedOutRef = useRef(false)
  useEffect(() => {
    if (!user) {
      justLoggedOutRef.current = true
      return
    }
    if (justLoggedOutRef.current) {
      justLoggedOutRef.current = false
      setPage(defaultPage(user.role))
    }
  }, [user])

  const [navOpen, setNavOpen] = useState(false)
  const [navCollapsed, setNavCollapsed] = useState(() => localStorage.getItem("navCollapsed") === "1")
  const { theme, toggle } = useTheme()
  const [pendingBarcodeSku, setPendingBarcodeSku] = useState<string | null>(null)
  const [wakingUp, setWakingUp] = useState(false)

  useEffect(() => {
    const show = () => setWakingUp(true)
    const hide = () => setWakingUp(false)
    window.addEventListener(WAKING_UP_EVENT, show)
    window.addEventListener(WAKE_COMPLETE_EVENT, hide)
    return () => {
      window.removeEventListener(WAKING_UP_EVENT, show)
      window.removeEventListener(WAKE_COMPLETE_EVENT, hide)
    }
  }, [])

  const barcodeBuffer = useRef("")
  const barcodeLastKey = useRef(0)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return

      const now = Date.now()

      if (e.key === "Enter") {
        const sku = barcodeBuffer.current.trim()
        barcodeBuffer.current = ""
        if (sku.length > 0) {
          setPendingBarcodeSku(sku)
        }
        return
      }

      if (e.key.length === 1) {
        if (now - barcodeLastKey.current > 100) barcodeBuffer.current = ""
        barcodeBuffer.current += e.key
        barcodeLastKey.current = now
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    if (pendingBarcodeSku !== null) {
      setPage("order")
      setNavOpen(false)
    }
  }, [pendingBarcodeSku])

  // Not logged in → the login screen is the only thing reachable.
  if (!user) {
    return <>{wakingUp && <WakingUpBanner />}<LoginPage /></>
  }

  function go(next: Page) {
    setPage(next)
    setNavOpen(false) // close the drawer after navigating on mobile
  }

  function toggleCollapse() {
    setNavCollapsed((c) => {
      const next = !c
      localStorage.setItem("navCollapsed", next ? "1" : "0")
      return next
    })
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      {wakingUp && <WakingUpBanner />}
      <Sidebar
        current={page}
        onNavigate={go}
        open={navOpen}
        collapsed={navCollapsed}
        onToggleCollapse={toggleCollapse}
        theme={theme}
        onToggleTheme={toggle}
        userName={user.name}
        userRole={user.role}
        onLogout={logout}
      />

      {/* Mobile backdrop */}
      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3 lg:hidden">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-h)] transition-colors hover:bg-[var(--social-bg)]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-lg font-semibold text-[var(--text-h)]">POS</span>
          <button
            onClick={toggle}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label="Toggle theme"
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-h)] transition-colors hover:bg-[var(--social-bg)]"
          >
            {theme === "dark" ? (
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
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">
          {page === "dashboard"  && user.role === "admin" && <DashboardPage />}
          <div className={page !== "order" ? "hidden" : ""}>
            <OrderPage active={page === "order"} pendingBarcodeSku={pendingBarcodeSku} onBarcodeConsumed={() => setPendingBarcodeSku(null)} />
          </div>
          {page === "history"    && <OrderHistoryPage />}
{page === "categories" && <CategoriesPage />}
          {page === "inventory"     && <InventoryPage />}
          {page === "inventory-log" && user.role === "admin" && <InventoryLogPage />}
          {page === "users"         && user.role === "admin" && <UsersPage />}
        </main>
      </div>
    </div>
  )
}

export default App
