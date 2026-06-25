import mongoose from "mongoose";
const productSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    sku: { type: String, trim: true, unique: true, sparse: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    costPrice: { type: Number, default: null, min: 0 },
    discountQty: { type: Number, default: null, min: 2 },
    discountPrice: { type: Number, default: null, min: 0 },
}, { timestamps: true });
export default mongoose.model("Product", productSchema);
