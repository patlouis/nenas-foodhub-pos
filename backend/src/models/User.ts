import mongoose from "mongoose";

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  role: "admin" | "cashier";
  createdAt?: Date;
  updatedAt?: Date;
}

const userSchema = new mongoose.Schema<IUser>(
  {
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
  },
  { timestamps: true }
);

// Never expose the password hash in API responses.
userSchema.set("toJSON", {
  transform: (_doc, ret: any) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model<IUser>("User", userSchema);
