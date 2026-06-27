// Parked-cart tabs on the order screen: a general (no-table) order plus six tables.
export type TableKey = "order" | "1" | "2" | "3" | "4" | "5" | "6"
export const TABLE_KEYS: TableKey[] = ["order", "1", "2", "3", "4", "5", "6"]

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
  tableNumber?: number
  createdAt?: string
  status?: "completed" | "voided"
  voidedAt?: string
  voidedByName?: string
}

// What the client sends — the server looks up live names/prices itself
export interface NewOrderItem {
  productId: string
  quantity: number
}
