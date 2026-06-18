import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import type { User } from "./types"
import { authApi, AUTH_EXPIRED_EVENT, clearStoredAuth } from "./api"

type AuthContextValue = {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Decode the JWT payload (no signature check — the server does that) just to
// read its expiry, so a stale token doesn't render the dashboard on load.
function isTokenLive(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]))
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

function readStoredUser(): User | null {
  try {
    const token = localStorage.getItem("token")
    const raw = localStorage.getItem("user")
    if (token && raw && isTokenLive(token)) return JSON.parse(raw) as User
  } catch {
    // corrupt storage — fall through to logged-out
  }
  clearStoredAuth()
  return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(readStoredUser)

  async function login(email: string, password: string) {
    const { token, user } = await authApi.login(email, password)
    localStorage.setItem("token", token)
    localStorage.setItem("user", JSON.stringify(user))
    setUser(user)
  }

  function logout() {
    clearStoredAuth()
    setUser(null)
  }

  // Any API call that comes back 401 (expired/invalid token) bounces the app
  // to the login screen instead of leaving a dead dashboard up.
  useEffect(() => {
    const onExpired = () => setUser(null)
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired)
  }, [])

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider")
  return ctx
}
