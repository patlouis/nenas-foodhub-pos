export const EXPENSE_CATEGORIES = ["utilities", "salaries", "supplies", "groceries", "repairs", "other"] as const;
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  utilities: "Utilities",
  salaries:  "Salaries",
  supplies:  "Supplies",
  groceries: "Groceries",
  repairs:   "Repairs",
  other:     "Other",
};

export interface Expense {
  _id: string;
  amount: number;
  category: ExpenseCategory;
  description?: string;
  qty?: number;
  date: string;
  loggedByName: string;
  voided: boolean;
  voidedAt?: string;
  voidedByName?: string;
  createdAt: string;
}
