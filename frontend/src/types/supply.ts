export interface Supply {
  _id: string
  name: string
  unit: string
  quantity: number
  unitCost: number | null
  lowStockAt: number | null
  status: "active" | "archived"
  createdAt?: string
  updatedAt?: string
}

// Shape used when creating a supply (no server-generated fields)
export type NewSupply = {
  name: string
  unit: string
  quantity?: number
  unitCost?: number
  lowStockAt?: number | null
}
