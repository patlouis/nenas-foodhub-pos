import mongoose, { type Document, type Model } from "mongoose";

export interface ISupply extends Document {
  name: string;
  unit: string;
  quantity: number;
  unitCost: number | null;
  lowStockAt: number | null;
  status: "active" | "archived";
  createdAt: Date;
  updatedAt: Date;
}

const supplySchema = new mongoose.Schema<ISupply>(
  {
    name: { type: String, required: true, trim: true },
    unit: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 0, min: 0 },
    unitCost: { type: Number, default: null, min: 0 },
    lowStockAt: { type: Number, default: null, min: 0 },
    status: { type: String, enum: ["active", "archived"], default: "active" },
  },
  { timestamps: true }
);

supplySchema.index({ status: 1, name: 1 });
// Case-insensitive uniqueness — "Cooking Oil" and "cooking oil" collide —
// so restocking never accidentally splits one item across two rows.
supplySchema.index({ name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

const Supply: Model<ISupply> = mongoose.model("Supply", supplySchema, "supplies");
export default Supply;
