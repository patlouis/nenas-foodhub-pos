import type {
  Product, NewProduct, User, NewUser, Category, NewCategory, Order, NewOrderItem, Paginated, StockAdjustment, Expense,
  OrderSummary,
} from "./types"
import { couldBeColdStart, COLD_START_HINT_MS } from "./coldStart"

const BASE = import.meta.env.VITE_API_BASE_URL ?? ""

const PRODUCTS = `${BASE}/api/products`
const CATEGORIES = `${BASE}/api/categories`
const USERS = `${BASE}/api/users`
const ORDERS = `${BASE}/api/orders`
const STOCK_ADJUSTMENTS = `${BASE}/api/stock-adjustments`
const EXPENSES = `${BASE}/api/expenses`

// Fired whenever the backend rejects our token; AuthProvider listens and
// drops the app back to the login screen.
export const AUTH_EXPIRED_EVENT = "auth:expired"

// Fired when a long request is one the server could actually be asleep for.
// Ordinary slowness never raises these — the calling page's own loading state
// covers that. WAKE_COMPLETE fires once the last such request finishes.
export const WAKING_UP_EVENT = "server:waking-up"
export const WAKE_COMPLETE_EVENT = "server:wake-complete"

// Any response proves the server is running, whatever its status code, so a
// failed request still counts as evidence that it is awake.
let lastResponseAt: number | null = null
let wakingCount = 0

function watchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let counted = false
  // Plausibility is judged when the timer fires, not when the request starts:
  // by then a sibling request may have come back and settled the question.
  const timer = setTimeout(() => {
    if (!couldBeColdStart(lastResponseAt, Date.now())) return
    counted = true
    if (++wakingCount === 1) window.dispatchEvent(new Event(WAKING_UP_EVENT))
  }, COLD_START_HINT_MS)

  return fetch(input, init)
    .then((res) => {
      lastResponseAt = Date.now()
      return res
    })
    .finally(() => {
      clearTimeout(timer)
      if (counted && --wakingCount === 0) window.dispatchEvent(new Event(WAKE_COMPLETE_EVENT))
    })
}

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

export class ApiError extends Error {
  status: number
  code: string | undefined
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }
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
    throw new ApiError(body.error || `Request failed (${res.status})`, res.status, body.code)
  }
  return res.json() as Promise<T>
}

export const authApi = {
  login: (email: string, password: string) =>
    watchedFetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then(handle<{ token: string; user: User }>),
}

export const categoriesApi = {
  list: () => watchedFetch(CATEGORIES, { headers: authHeaders() }).then(handle<Category[]>),

  create: (data: NewCategory) =>
    watchedFetch(CATEGORIES, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then(handle<Category>),

  update: (id: string, data: NewCategory) =>
    watchedFetch(`${CATEGORIES}/${id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then(handle<Category>),

  reorder: (items: { id: string; order: number }[]) =>
    watchedFetch(`${CATEGORIES}/reorder`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ items }),
    }).then(handle<{ ok: boolean }>),

  remove: (id: string) =>
    watchedFetch(`${CATEGORIES}/${id}`, {
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
    watchedFetch(`${PRODUCTS}${buildQuery(params)}`, { headers: authHeaders() }).then(handle<Paginated<Product>>),

  create: (data: NewProduct) =>
    watchedFetch(PRODUCTS, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then(handle<Product>),

  update: (id: string, data: Partial<NewProduct>) =>
    watchedFetch(`${PRODUCTS}/${id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then(handle<Product>),

  adjustStock: (id: string, delta: number, costPrice?: number | null) =>
    watchedFetch(`${PRODUCTS}/${id}/stock`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({ delta, ...(costPrice != null ? { costPrice } : {}) }),
    }).then(handle<Product>),

  recordWastage: (id: string, quantity: number, reason: string) =>
    watchedFetch(`${PRODUCTS}/${id}/wastage`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ quantity, reason }),
    }).then(handle<Product>),

  remove: (id: string, force = false) =>
    watchedFetch(`${PRODUCTS}/${id}${force ? "?force=true" : ""}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then(handle<{ ok: boolean }>),
}

export const usersApi = {
  list: () => watchedFetch(USERS, { headers: authHeaders() }).then(handle<User[]>),

  create: (data: NewUser) =>
    watchedFetch(USERS, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then(handle<User>),

  update: (id: string, data: Partial<NewUser>) =>
    watchedFetch(`${USERS}/${id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then(handle<User>),

  remove: (id: string) =>
    watchedFetch(`${USERS}/${id}`, {
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
  paymentType?: string
  sortKey?: string
  sortDir?: string
  [key: string]: string | number | undefined
}

export interface StockAdjustmentListParams {
  page?: number
  limit?: number
  type?: "wastage" | "receiving"
  from?: string
  to?: string
  q?: string
  sortKey?: string
  sortDir?: "asc" | "desc"
  [key: string]: string | number | undefined
}

export interface ExpenseListParams {
  page?: number
  limit?: number
  category?: string
  from?: string
  to?: string
  q?: string
  sortKey?: string
  sortDir?: "asc" | "desc"
  [key: string]: string | number | undefined
}

export const stockAdjustmentsApi = {
  list: (params?: StockAdjustmentListParams) =>
    watchedFetch(`${STOCK_ADJUSTMENTS}${buildQuery(params)}`, { headers: authHeaders() }).then(
      handle<Paginated<StockAdjustment> & { totalCost: number }>
    ),

  void: (id: string) =>
    watchedFetch(`${STOCK_ADJUSTMENTS}/${id}/void`, {
      method: "PATCH",
      headers: authHeaders(),
    }).then(handle<StockAdjustment>),
}

export const expensesApi = {
  list: (params?: ExpenseListParams) =>
    watchedFetch(`${EXPENSES}${buildQuery(params)}`, { headers: authHeaders() }).then(
      handle<Paginated<Expense> & { totalAmount: number }>
    ),

  create: (data: { amount: number; category: string; description?: string; qty?: number; date?: string }) =>
    watchedFetch(EXPENSES, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then(handle<Expense>),

  void: (id: string) =>
    watchedFetch(`${EXPENSES}/${id}/void`, {
      method: "PATCH",
      headers: authHeaders(),
    }).then(handle<Expense>),
}

export const ordersApi = {
  list: (params?: OrderListParams) =>
    watchedFetch(`${ORDERS}${buildQuery(params)}`, { headers: authHeaders() }).then(handle<Paginated<Order>>),

  // Every dashboard figure for a period, aggregated server-side. Summing a
  // page of orders in the browser silently dropped everything past the page
  // limit, so totals stopped growing once the shop passed it.
  summary: (params: {
    from?: string
    to?: string
    prevFrom?: string
    prevTo?: string
    bucket: "hour" | "day" | "month"
    timezone: string
  }) =>
    watchedFetch(`${ORDERS}/summary${buildQuery(params)}`, { headers: authHeaders() }).then(
      handle<OrderSummary>
    ),

  // All-time order counts per hour, aggregated server-side so the dashboard
  // doesn't have to download every order to draw the peak-hours chart.
  peakHours: (timezone: string) =>
    watchedFetch(`${ORDERS}/peak-hours${buildQuery({ timezone })}`, { headers: authHeaders() }).then(
      handle<{ hours: number[] }>
    ),

  create: (items: NewOrderItem[], paymentMethod: "cash" | "gcash" = "cash", orderType: "sale" | "staff_meal" = "sale", staffMealRecipient?: string, tableNumber?: number) =>
    watchedFetch(ORDERS, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ items, paymentMethod, orderType, staffMealRecipient, tableNumber }),
    }).then(handle<Order>),

  void: (id: string) =>
    watchedFetch(`${ORDERS}/${id}/void`, {
      method: "PATCH",
      headers: authHeaders(),
    }).then(handle<Order>),
}
