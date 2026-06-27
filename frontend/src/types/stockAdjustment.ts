export interface StockAdjustment {
  _id: string
  product: string
  productName: string
  costPrice: number | null
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
