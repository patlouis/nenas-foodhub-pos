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
