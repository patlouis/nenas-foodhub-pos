import mongoose from "mongoose";
const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    color: { type: String, default: "#aa3bff" },
    order: { type: Number, default: 0 },
}, { timestamps: true });
categorySchema.index({ order: 1 });
export default mongoose.model("Category", categorySchema);
