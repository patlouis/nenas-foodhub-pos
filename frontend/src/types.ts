export interface Category {
  _id: string
  name: string
  color: string
  order: number
  productCount?: number
  createdAt?: string
  updatedAt?: string
}

export type NewCategory = { name: string; color: string }

export interface Product {
  _id: string
  name: string
  sku?: string
  price: number
  stock: number
  category?: string
  status?: "active" | "disabled"
  costPrice?: number | null
  discountQty?: number | null
  discountPrice?: number | null
  createdAt?: string
  updatedAt?: string
}

// Shape used when creating a product (no server-generated fields)
export type NewProduct = Omit<Product, "_id" | "createdAt" | "updatedAt">

export interface OrderItem {
  product: string
  name: string // snapshot at time of sale
  price: number // snapshot unit price
  costPrice?: number | null // snapshot at time of sale
  quantity: number
  lineTotal: number // actual amount charged (may differ from price × qty when discounted)
}

export interface Order {
  _id: string
  orderNumber?: number
  items: OrderItem[]
  total: number
  cashierName?: string
  orderType?: "sale" | "staff_meal"
  staffMealRecipient?: string
  paymentMethod?: "cash" | "gcash"
  createdAt?: string
  status?: "completed" | "voided"
  voidedAt?: string
  voidedByName?: string
}

export interface StockAdjustment {
  _id: string
  product: string
  productName: string
  costPrice: number
  quantity: number
  type: "wastage" | "receiving"
  reason?: string
  adjustedByName: string
  voided: boolean
  voidedAt?: string
  voidedByName?: string
  createdAt: string
}

// Fixed wastage reasons (value → label). Keep values in sync with the backend
// (backend/src/schemas/products.ts WASTAGE_REASONS).
export const WASTAGE_REASONS: { value: string; label: string }[] = [
  { value: "spoiled", label: "Spoiled" },
  { value: "expired", label: "Expired" },
  { value: "damaged", label: "Damaged" },
  { value: "overcooked", label: "Overcooked" },
  { value: "other", label: "Other" },
]

export const wastageReasonLabel = (value?: string): string =>
  WASTAGE_REASONS.find((r) => r.value === value)?.label ?? value ?? "—"

// What the client sends — the server looks up live names/prices itself
export interface NewOrderItem {
  productId: string
  quantity: number
}

// Envelope returned by every paginated list endpoint (orders, products).
export interface Paginated<T> {
  data: T[]
  page: number
  limit: number
  total: number
  totalPages: number
  totalAmount?: number
}

export type Role = "admin" | "cashier"

export interface User {
  _id: string
  name: string
  email: string
  role: Role
  createdAt?: string
  updatedAt?: string
}

// Shape used when registering a user (password is sent, never stored client-side)
export interface NewUser {
  name: string
  email: string
  password: string
  role: Role
}
