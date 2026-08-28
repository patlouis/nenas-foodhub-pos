import mongoose from "mongoose";

// Line items embed a snapshot of the product's name and price at the moment
// of sale. Orders are historical records: they must keep showing what was
// actually charged even if the product is later renamed, repriced, or deleted.
export interface IOrderItem {
  product: mongoose.Types.ObjectId;
  name: string;
  price: number;
  costPrice?: number | null;
  // A half serving is the same dish at its own price, so the line records
  // which portion was sold and price/costPrice snapshot that portion's rates.
  portion: "full" | "half";
  quantity: number;
  lineTotal: number;
  // An add-on sold with this line — hot water for instant noodles, and the
  // like. Label and rate are snapshotted like every other price here, and the
  // rate is what was actually charged, which the cashier may have edited down
  // from the product's default. feeTotal stays out of lineTotal so per-product
  // revenue and fee income remain separately answerable.
  feeLabel?: string | null;
  feeAmount?: number | null;
  feeTotal?: number;
}

export interface IOrder {
  orderNumber?: number;
  items: IOrderItem[];
  total: number;
  cashier?: mongoose.Types.ObjectId;
  cashierName?: string; // snapshot, same reasoning as item names
  orderType: "sale" | "staff_meal";
  staffMealRecipient?: string; // snapshot name of the staff member who received the meal
  tableNumber?: number; // 1–6; absent = takeout / staff meal
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
    portion: { type: String, enum: ["full", "half"], default: "full" },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
    feeLabel: { type: String, default: null },
    feeAmount: { type: Number, default: null, min: 0 },
    feeTotal: { type: Number, default: 0, min: 0 },
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
    tableNumber: { type: Number, min: 1, max: 6 },
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
