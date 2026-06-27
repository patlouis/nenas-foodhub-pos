// Envelope returned by every paginated list endpoint (orders, products).
export interface Paginated<T> {
  data: T[]
  page: number
  limit: number
  total: number
  totalPages: number
  totalAmount?: number
}
