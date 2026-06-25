import { Router, type Request, type Response, type NextFunction } from "express";
import mongoose from "mongoose";
import StockAdjustment from "../models/StockAdjustment.js";
import Product from "../models/Product.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { z } from "zod";
import { paginationQuerySchema, paginate } from "../schemas/pagination.js";

const router = Router();

const listQuerySchema = paginationQuerySchema(1000).extend({
  type: z.enum(["wastage", "receiving"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

// GET /api/stock-adjustments — admin only, paginated newest-first.
router.get("/", requireAuth, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
    }
    const { page, limit, type, from, to } = parsed.data;

    const filter: Record<string, unknown> = { voided: false };
    if (type) filter.type = type;
    if (from || to) {
      const range: { $gte?: Date; $lte?: Date } = {};
      if (from) range.$gte = new Date(from);
      if (to) range.$lte = new Date(to);
      filter.createdAt = range;
    }

    const [data, total, costAgg] = await Promise.all([
      StockAdjustment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      StockAdjustment.countDocuments(filter),
      StockAdjustment.aggregate([
        { $match: filter },
        { $group: { _id: null, totalCost: { $sum: { $multiply: ["$costPrice", "$quantity"] } } } },
      ]),
    ]);

    const totalCost: number = costAgg[0]?.totalCost ?? 0;
    res.json({ ...paginate(data, page, limit, total), totalCost });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/stock-adjustments/:id/void — admin only. Reverses the stock change.
router.patch("/:id/void", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  const adj = await StockAdjustment.findById(req.params.id);
  if (!adj) return res.status(404).json({ error: "Not found" });
  if (adj.voided) return res.status(409).json({ error: "Already voided" });

  if (adj.type === "receiving") {
    // Voiding a receiving means removing stock — ensure there's enough.
    const product = await Product.findOne({ _id: adj.product, stock: { $gte: adj.quantity } });
    if (!product) {
      return res.status(409).json({ error: "Not enough stock to void this receiving" });
    }
    await Product.updateOne({ _id: adj.product }, { $inc: { stock: -adj.quantity } });
  } else {
    // Voiding wastage restores stock.
    await Product.updateOne({ _id: adj.product }, { $inc: { stock: adj.quantity } });
  }

  const updated = await StockAdjustment.findByIdAndUpdate(
    adj._id,
    { voided: true, voidedAt: new Date(), voidedBy: req.user!.sub, voidedByName: req.user!.name },
    { returnDocument: "after" }
  );
  res.json(updated);
});

export default router;
