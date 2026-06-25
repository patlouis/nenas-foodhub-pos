import mongoose from "mongoose";
const orderItemSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, default: null },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
}, { _id: false });
const orderSchema = new mongoose.Schema({
    orderNumber: { type: Number, unique: true, sparse: true },
    items: {
        type: [orderItemSchema],
        required: true,
        validate: [(v) => v.length > 0, "Order must contain at least one item"],
    },
    total: { type: Number, required: true, min: 0 },
    cashier: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    cashierName: { type: String }, // snapshot, same reasoning as item names
    orderType: { type: String, enum: ["sale", "staff_meal"], default: "sale" },
    staffMealRecipient: { type: String },
    paymentMethod: { type: String, enum: ["cash", "gcash"], default: "cash" },
    status: { type: String, enum: ["completed", "voided"], default: "completed" },
    voidedAt: { type: Date },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    voidedByName: { type: String },
}, { timestamps: true });
// Every report is "orders between two dates" — index accordingly.
orderSchema.index({ createdAt: -1 });
export default mongoose.model("Order", orderSchema);
