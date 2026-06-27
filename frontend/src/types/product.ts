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
