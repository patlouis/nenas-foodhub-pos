import { Router, type Request, type Response, type NextFunction } from "express";
import mongoose from "mongoose";
import Expense from "../models/Expense.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { createExpenseSchema, listExpensesQuerySchema } from "../schemas/expenses.js";
import { paginate } from "../schemas/pagination.js";
import type { ExpenseCategory } from "../models/Expense.js";

const router = Router();

const SORT_KEYS = ["date", "amount", "category", "createdAt"] as const;
type SortKey = typeof SORT_KEYS[number];

router.get("/", requireAuth, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = listExpensesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
    }
    const { page, limit, category, from, to, q, sortKey, sortDir } = parsed.data;
    const dir = sortDir === "asc" ? 1 : -1;

    const filter: Record<string, unknown> = {};
    if (category) filter.category = category as ExpenseCategory;
    if (q) filter.note = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    if (from || to) {
      const range: { $gte?: Date; $lte?: Date } = {};
      if (from) range.$gte = new Date(from);
      if (to) range.$lte = new Date(to);
      filter.date = range;
    }

    const [data, total, amountAgg] = await Promise.all([
      Expense.find(filter).sort({ [sortKey]: dir } as Record<SortKey, 1 | -1>).skip((page - 1) * limit).limit(limit),
      Expense.countDocuments(filter),
      Expense.aggregate([
        { $match: { ...filter, voided: false } },
        { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
      ]),
    ]);

    const totalAmount: number = amountAgg[0]?.totalAmount ?? 0;
    res.json({ ...paginate(data, page, limit, total), totalAmount });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireAuth, requireAdmin, validateBody(createExpenseSchema), async (req: Request, res: Response) => {
  try {
    const { amount, category, note, date } = req.body;
    const expense = await Expense.create({
      amount,
      category,
      note: note || undefined,
      date: date ? new Date(date) : new Date(),
      loggedBy: req.user!.sub,
      loggedByName: req.user!.name,
    });
    res.status(201).json(expense);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.patch("/:id/void", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  const expense = await Expense.findById(req.params.id);
  if (!expense) return res.status(404).json({ error: "Not found" });
  if (expense.voided) return res.status(409).json({ error: "Already voided" });

  const updated = await Expense.findByIdAndUpdate(
    expense._id,
    { voided: true, voidedAt: new Date(), voidedBy: req.user!.sub, voidedByName: req.user!.name },
    { returnDocument: "after" }
  );
  res.json(updated);
});

export default router;
