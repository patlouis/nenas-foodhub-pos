import mongoose from "mongoose";

// Line items embed a snapshot of the product's name and price at the moment
// of sale. Orders are historical records: they must keep showing what was
// actually charged even if the product is later renamed, repriced, or deleted.
export interface IOrderItem {
  product: mongoose.Types.ObjectId;
  name: string;
  price: number;
  costPrice?: number | null;
  quantity: number;
  lineTotal: number;
}

export interface IOrder {
  orderNumber?: number;
  items: IOrderItem[];
  total: number;
  cashier?: mongoose.Types.ObjectId;
  cashierName?: string; // snapshot, same reasoning as item names
  orderType: "sale" | "staff_meal";
  staffMealRecipient?: string; // snapshot name of the staff member who received the meal
  paymentMethod: "cash" | "gcash";
  status: "completed" | "voided";
  voidedAt?: Date;
  voidedBy?: mongoose.Types.ObjectId;
  voidedByName?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const orderItemSchema = new mongoose.Schema<IOrderItem>(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, default: null },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema<IOrder>(
  {
    orderNumber: { type: Number, unique: true, sparse: true },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: [(v: IOrderItem[]) => v.length > 0, "Order must contain at least one item"],
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
  },
  { timestamps: true }
);

// Every report is "orders between two dates" — index accordingly.
orderSchema.index({ createdAt: -1 });

export default mongoose.model<IOrder>("Order", orderSchema);
