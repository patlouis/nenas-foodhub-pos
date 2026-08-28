import mongoose from "mongoose";

export interface IProduct {
  name: string;
  sku?: string;
  price: number;
  // null = not counted (cooked meals, rice by the cup — portioned out of bulk).
  // Handle null before comparing: `stock <= 0` can't tell it from sold out.
  stock: number | null;
  category?: mongoose.Types.ObjectId;
  status: "active" | "disabled";
  // Set halfPrice to offer this dish as a half serving. One product, one
  // availability state — a separate "(Half)" product would need its status
  // kept in step with this one by hand.
  halfPrice?: number | null;
  halfCostPrice?: number | null;
  costPrice?: number | null;
  discountQty?: number | null;
  discountPrice?: number | null;
  // An optional service sold alongside the item — hot water for instant
  // noodles, and the like. Both fields are set together: an amount with no
  // label could not be shown, and a label with no amount could not be charged.
  feeLabel?: string | null;
  feeAmount?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const productSchema = new mongoose.Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, trim: true, unique: true, sparse: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, default: 0, min: 0 },  // null = untracked
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    halfPrice: { type: Number, default: null, min: 0 },
    halfCostPrice: { type: Number, default: null, min: 0 },
    costPrice: { type: Number, default: null, min: 0 },
    discountQty: { type: Number, default: null, min: 2 },
    discountPrice: { type: Number, default: null, min: 0 },
    feeLabel: { type: String, default: null, trim: true, maxlength: 30 },
    feeAmount: { type: Number, default: null, min: 0 },
  },
  { timestamps: true }
);

productSchema.index({ status: 1, category: 1 });

export default mongoose.model<IProduct>("Product", productSchema);
