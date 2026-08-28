// Parked-cart tabs on the order screen: a general (no-table) order plus six tables.
export type TableKey = "order" | "1" | "2" | "3" | "4" | "5" | "6"
export const TABLE_KEYS: TableKey[] = ["order", "1", "2", "3", "4", "5", "6"]

export type Portion = "full" | "half"

export interface OrderItem {
  product: string
  name: string // snapshot at time of sale
  price: number // snapshot unit price for the portion sold
  costPrice?: number | null // snapshot at time of sale
  portion?: Portion // absent on orders placed before half servings existed
  quantity: number
  lineTotal: number // actual amount charged (may differ from price × qty when discounted)
  // An add-on sold with this line. Kept out of lineTotal so per-product revenue
  // and fee income stay separately answerable; order.total includes both.
  feeLabel?: string | null
  feeAmount?: number | null
  feeTotal?: number
}

// How a sold line reads wherever it's shown — receipt, history, reporting.
// Orders placed before half servings existed have no portion and read plainly.
export function orderItemLabel(item: { name: string; portion?: Portion }): string {
  return item.portion === "half" ? `${item.name} (Half)` : item.name
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
  portion?: Portion
  /** The add-on rate to charge, when the product offers one. */
  fee?: number
}

// Dashboard figures, aggregated by the server. Sold quantities are split into
// costed and uncosted: only this client knows the current catalog cost to fall
// back on for an item that was sold without a cost snapshot, and it may only
// do so for a full serving.
export interface SummaryItemRow {
  name: string
  portion: Portion
  qty: number
  revenue: number
  costedQty: number
  costedRevenue: number
  costSum: number
}

export interface SummaryPeriod {
  revenue: number
  orderCount: number
  itemsSold: number
  items: SummaryItemRow[]
  /** Add-on income, grouped by label. Not product revenue, but part of the
   *  revenue figure above — goods + fees is what reconciles. */
  fees: { label: string; qty: number; revenue: number }[]
}

export interface OrderSummary {
  current: SummaryPeriod
  previous: SummaryPeriod
  /** Revenue per bucket. `key` is an hour ("0"–"23"), a business date
   *  ("2026-08-15") or a month ("2026-08"), matching the requested bucket. */
  series: { key: string; value: number }[]
}
