import type {
  Product, NewProduct, User, NewUser, Category, NewCategory, Order, NewOrderItem, Paginated,
} from "./types"

const BASE = import.meta.env.VITE_API_BASE_URL ?? ""

const PRODUCTS = `${BASE}/api/products`
const CATEGORIES = `${BASE}/api/categories`
const USERS = `${BASE}/api/users`
const ORDERS = `${BASE}/api/orders`

// Fired whenever the backend rejects our token; AuthProvider listens and
// drops the app back to the login screen.
export const AUTH_EXPIRED_EVENT = "auth:expired"

export function clearStoredAuth() {
  localStorage.removeItem("token")
  localStorage.removeItem("user")
}

// Attach the stored login token (if any) so protected routes accept the request.
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("token")
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...authHeaders() }
}

// Builds a "?key=value&..." string from a params object, skipping
// undefined/empty values so callers can pass a sparse object freely.
function buildQuery(params?: Record<string, string | number | undefined>): string {
  if (!params) return ""
  const usp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") usp.set(key, String(value))
  }
  const qs = usp.toString()
  return qs ? `?${qs}` : ""
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // 401 while holding a token means the session expired or was revoked —
    // wipe it and send the app back to login. (A failed login attempt also
    // returns 401, but no token is stored at that point, so it won't fire.)
    if (res.status === 401 && localStorage.getItem("token")) {
      clearStoredAuth()
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
    }
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export const authApi = {
  login: (email: string, password: string) =>
    fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then(handle<{ token: string; user: User }>),
}

export const categoriesApi = {
  list: () => fetch(CATEGORIES, { headers: authHeaders() }).then(handle<Category[]>),

  create: (data: NewCategory) =>
    fetch(CATEGORIES, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then(handle<Category>),

  update: (id: string, data: NewCategory) =>
    fetch(`${CATEGORIES}/${id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then(handle<Category>),

  reorder: (items: { id: string; order: number }[]) =>
    fetch(`${CATEGORIES}/reorder`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ items }),
    }).then(handle<{ ok: boolean }>),

  remove: (id: string) =>
    fetch(`${CATEGORIES}/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then(handle<{ ok: boolean }>),
}

export interface ProductListParams {
  page?: number
  limit?: number
  q?: string
  category?: string
  sortKey?: string
  sortDir?: string
  [key: string]: string | number | undefined
}

export const productsApi = {
  list: (params?: ProductListParams) =>
    fetch(`${PRODUCTS}${buildQuery(params)}`, { headers: authHeaders() }).then(handle<Paginated<Product>>),

  create: (data: NewProduct) =>
    fetch(PRODUCTS, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then(handle<Product>),

  update: (id: string, data: Partial<NewProduct>) =>
    fetch(`${PRODUCTS}/${id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then(handle<Product>),

  adjustStock: (id: string, delta: number) =>
    fetch(`${PRODUCTS}/${id}/stock`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({ delta }),
    }).then(handle<Product>),

  remove: (id: string) =>
    fetch(`${PRODUCTS}/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then(handle<{ ok: boolean }>),
}

export const usersApi = {
  list: () => fetch(USERS, { headers: authHeaders() }).then(handle<User[]>),

  create: (data: NewUser) =>
    fetch(USERS, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then(handle<User>),

  update: (id: string, data: Partial<NewUser>) =>
    fetch(`${USERS}/${id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then(handle<User>),

  remove: (id: string) =>
    fetch(`${USERS}/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then(handle<{ ok: boolean }>),
}

export interface OrderListParams {
  page?: number
  limit?: number
  q?: string
  from?: string
  to?: string
  sortKey?: string
  sortDir?: string
  [key: string]: string | number | undefined
}

export const ordersApi = {
  list: (params?: OrderListParams) =>
    fetch(`${ORDERS}${buildQuery(params)}`, { headers: authHeaders() }).then(handle<Paginated<Order>>),

  create: (items: NewOrderItem[]) =>
    fetch(ORDERS, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ items }),
    }).then(handle<Order>),

  void: (id: string) =>
    fetch(`${ORDERS}/${id}/void`, {
      method: "PATCH",
      headers: authHeaders(),
    }).then(handle<Order>),
}
