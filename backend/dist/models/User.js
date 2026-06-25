import mongoose from "mongoose";
const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "cashier"], default: "cashier" },
}, { timestamps: true });
// Never expose the password hash in API responses.
userSchema.set("toJSON", {
    transform: (_doc, ret) => {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
    },
});
export default mongoose.model("User", userSchema);
