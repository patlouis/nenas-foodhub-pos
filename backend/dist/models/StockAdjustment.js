import mongoose from "mongoose";
const stockAdjustmentSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    costPrice: { type: Number, required: true, default: 0 },
    quantity: { type: Number, required: true, min: 1 },
    type: { type: String, enum: ["wastage", "receiving"], required: true },
    reason: { type: String },
    adjustedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    adjustedByName: { type: String, required: true },
    voided: { type: Boolean, default: false },
    voidedAt: { type: Date },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    voidedByName: { type: String },
}, { timestamps: true });
const StockAdjustment = mongoose.model("StockAdjustment", stockAdjustmentSchema);
export default StockAdjustment;
