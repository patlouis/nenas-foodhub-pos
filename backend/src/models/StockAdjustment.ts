import mongoose, { type Document, type Model } from "mongoose";

export interface IStockAdjustment extends Document {
  product: mongoose.Types.ObjectId;
  productName: string;
  costPrice: number | null;
  quantity: number;
  type: "wastage" | "receiving";
  reason?: string;
  adjustedBy: mongoose.Types.ObjectId;
  adjustedByName: string;
  voided: boolean;
  voidedAt?: Date;
  voidedBy?: mongoose.Types.ObjectId;
  voidedByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const stockAdjustmentSchema = new mongoose.Schema<IStockAdjustment>(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    costPrice: { type: Number, default: null },
    quantity: { type: Number, required: true, min: 1 },
    type: { type: String, enum: ["wastage", "receiving"], required: true },
    reason: { type: String },
    adjustedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    adjustedByName: { type: String, required: true },
    voided: { type: Boolean, default: false },
    voidedAt: { type: Date },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    voidedByName: { type: String },
  },
  { timestamps: true }
);

stockAdjustmentSchema.index({ createdAt: -1 });
stockAdjustmentSchema.index({ type: 1, voided: 1, createdAt: -1 });

const StockAdjustment: Model<IStockAdjustment> = mongoose.model("StockAdjustment", stockAdjustmentSchema, "stock_adjustments");
export default StockAdjustment;
