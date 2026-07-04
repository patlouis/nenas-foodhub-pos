export interface SupplyAdjustment {
  _id: string
  supply: string
  supplyName: string
  unitCost: number | null
  quantity: number
  type: "restock" | "consume"
  reason?: string
  expense?: string
  adjustedByName: string
  voided: boolean
  voidedAt?: string
  voidedByName?: string
  createdAt: string
}
