import mongoose from "mongoose";

interface ICounter {
  _id: string;
  seq: number;
}

const counterSchema = new mongoose.Schema<ICounter>({
  _id: { type: String },
  seq: { type: Number, required: true },
});

export default mongoose.model<ICounter>("Counter", counterSchema);
