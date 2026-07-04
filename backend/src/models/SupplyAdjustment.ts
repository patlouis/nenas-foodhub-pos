import mongoose, { type Document, type Model } from "mongoose";

export interface ISupplyAdjustment extends Document {
  supply: mongoose.Types.ObjectId;
  supplyName: string;
  unitCost: number | null;
  quantity: number;
  type: "restock" | "consume";
  reason?: string;
  expense?: mongoose.Types.ObjectId;
  adjustedBy: mongoose.Types.ObjectId;
  adjustedByName: string;
  voided: boolean;
  voidedAt?: Date;
  voidedBy?: mongoose.Types.ObjectId;
  voidedByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const supplyAdjustmentSchema = new mongoose.Schema<ISupplyAdjustment>(
  {
    supply: { type: mongoose.Schema.Types.ObjectId, ref: "Supply", required: true },
    supplyName: { type: String, required: true },
    unitCost: { type: Number, default: null },
    quantity: { type: Number, required: true, min: 0.01 },
    type: { type: String, enum: ["restock", "consume"], required: true },
    reason: { type: String },
    // Set only for "restock" adjustments — points at the Expense auto-created
    // alongside it, so voiding the restock can void the expense too.
    expense: { type: mongoose.Schema.Types.ObjectId, ref: "Expense" },
    adjustedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    adjustedByName: { type: String, required: true },
    voided: { type: Boolean, default: false },
    voidedAt: { type: Date },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    voidedByName: { type: String },
  },
  { timestamps: true }
);

supplyAdjustmentSchema.index({ createdAt: -1 });
supplyAdjustmentSchema.index({ type: 1, voided: 1, createdAt: -1 });

const SupplyAdjustment: Model<ISupplyAdjustment> = mongoose.model("SupplyAdjustment", supplyAdjustmentSchema, "supply_adjustments");
export default SupplyAdjustment;
