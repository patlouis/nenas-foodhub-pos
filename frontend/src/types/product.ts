export interface Product {
  _id: string
  name: string
  sku?: string
  price: number
  // null = not counted. Use the helpers in src/stock.ts rather than comparing
  // directly: `stock <= 0` can't tell untracked from sold out.
  stock: number | null
  category?: string
  status?: "active" | "disabled"
  costPrice?: number | null
  // Set = this dish can be sold as a half serving, at its own price.
  halfPrice?: number | null
  halfCostPrice?: number | null
  discountQty?: number | null
  discountPrice?: number | null
  createdAt?: string
  updatedAt?: string
}

// Shape used when creating a product (no server-generated fields)
export type NewProduct = Omit<Product, "_id" | "createdAt" | "updatedAt">
