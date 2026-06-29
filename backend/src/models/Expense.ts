import mongoose, { type Document, type Model } from "mongoose";

export const EXPENSE_CATEGORIES = ["rent", "utilities", "salaries", "supplies", "repairs", "other"] as const;
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export interface IExpense extends Document {
  amount: number;
  category: ExpenseCategory;
  note?: string;
  qty?: number;
  date: Date;
  loggedBy: mongoose.Types.ObjectId;
  loggedByName: string;
  voided: boolean;
  voidedAt?: Date;
  voidedBy?: mongoose.Types.ObjectId;
  voidedByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new mongoose.Schema<IExpense>(
  {
    amount: { type: Number, required: true, min: 0.01 },
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
    note: { type: String, maxlength: 200 },
    qty: { type: Number, min: 0.01 },
    date: { type: Date, required: true },
    loggedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    loggedByName: { type: String, required: true },
    voided: { type: Boolean, default: false },
    voidedAt: { type: Date },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    voidedByName: { type: String },
  },
  { timestamps: true }
);

expenseSchema.index({ date: -1 });
expenseSchema.index({ category: 1, voided: 1, date: -1 });

const Expense: Model<IExpense> = mongoose.model("Expense", expenseSchema, "expenses");
export default Expense;
