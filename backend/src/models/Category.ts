import mongoose from "mongoose";

export interface ICategory {
  name: string;
  color: string;
  order: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const categorySchema = new mongoose.Schema<ICategory>(
  {
    name:  { type: String, required: true, unique: true, trim: true },
    color: { type: String, default: "#aa3bff" },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

categorySchema.index({ order: 1 });

export default mongoose.model<ICategory>("Category", categorySchema);
