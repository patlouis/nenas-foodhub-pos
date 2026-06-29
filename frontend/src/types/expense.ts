export const EXPENSE_CATEGORIES = ["rent", "utilities", "salaries", "supplies", "repairs", "other"] as const;
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent:      "Rent",
  utilities: "Utilities",
  salaries:  "Salaries",
  supplies:  "Supplies",
  repairs:   "Repairs",
  other:     "Other",
};

export interface Expense {
  _id: string;
  amount: number;
  category: ExpenseCategory;
  note?: string;
  qty?: number;
  date: string;
  loggedByName: string;
  voided: boolean;
  voidedAt?: string;
  voidedByName?: string;
  createdAt: string;
}
