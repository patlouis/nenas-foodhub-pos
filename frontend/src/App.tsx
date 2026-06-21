import { useEffect, useRef, useState } from "react"
import Sidebar, { type Page } from "./components/Sidebar"
import OrderPage from "./pages/OrderPage"
import OrderHistoryPage from "./pages/OrderHistoryPage"
import ProductsPage from "./pages/ProductsPage"
import InventoryPage from "./pages/InventoryPage"
import CategoriesPage from "./pages/CategoriesPage"
import UsersPage from "./pages/UsersPage"
import DashboardPage from "./pages/DashboardPage"
import LoginPage from "./pages/LoginPage"
import { useTheme } from "./useTheme"
import { useAuth } from "./auth"

function App() {
  const { user, logout } = useAuth()
  const [page, setPage] = useState<Page>(() => user?.role === "admin" ? "dashboard" : "order")
  const [navOpen, setNavOpen] = useState(false)
  const { theme, toggle } = useTheme()
  const [pendingBarcodeSku, setPendingBarcodeSku] = useState<string | null>(null)

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
          setPage("order")
          setNavOpen(false)
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

  // Not logged in → the login screen is the only thing reachable.
  if (!user) {
    return <LoginPage />
  }

  function go(next: Page) {
    setPage(next)
    setNavOpen(false) // close the drawer after navigating on mobile
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <Sidebar
        current={page}
        onNavigate={go}
        open={navOpen}
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
          {page === "order"      && <OrderPage pendingBarcodeSku={pendingBarcodeSku} onBarcodeConsumed={() => setPendingBarcodeSku(null)} />}
          {page === "history"    && <OrderHistoryPage />}
          {page === "products"   && <ProductsPage />}
          {page === "categories" && <CategoriesPage />}
          {page === "inventory"  && <InventoryPage />}
          {page === "users"      && user.role === "admin" && <UsersPage />}
        </main>
      </div>
    </div>
  )
}

export default App
