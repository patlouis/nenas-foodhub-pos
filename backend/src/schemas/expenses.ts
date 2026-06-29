import { z } from "zod";
import { paginationQuerySchema } from "./pagination.js";
import { EXPENSE_CATEGORIES } from "../models/Expense.js";

export const createExpenseSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0"),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().min(1, "Description is required").max(200, "Description must be 200 characters or fewer"),
  qty: z.number().min(0.01, "Quantity must be at least 0.01").optional(),
  date: z.string().optional(),
});

const SORT_KEYS = ["date", "amount", "category", "createdAt"] as const;

export const listExpensesQuerySchema = paginationQuerySchema(1000).extend({
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().optional(),
  sortKey: z.enum(SORT_KEYS).optional().default("date"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
});
