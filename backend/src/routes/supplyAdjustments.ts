import { Router, type Request, type Response, type NextFunction } from "express";
import mongoose from "mongoose";
import SupplyAdjustment from "../models/SupplyAdjustment.js";
import Supply from "../models/Supply.js";
import Expense from "../models/Expense.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { listSupplyAdjustmentsQuerySchema } from "../schemas/supplyAdjustments.js";
import { paginate } from "../schemas/pagination.js";

const router = Router();

// GET /api/supply-adjustments — admin only, paginated newest-first.
router.get("/", requireAuth, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = listSupplyAdjustmentsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
    }
    const { page, limit, type, supply, from, to, q, sortKey, sortDir } = parsed.data;
    const dir = sortDir === "asc" ? 1 : -1;

    const filter: Record<string, unknown> = {};
    if (type) filter.type = type;
    if (supply) filter.supply = supply;
    if (q) filter.supplyName = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    if (from || to) {
      const range: { $gte?: Date; $lte?: Date } = {};
      if (from) range.$gte = new Date(from);
      if (to) range.$lte = new Date(to);
      filter.createdAt = range;
    }

    const [data, total, costAgg] = await Promise.all([
      SupplyAdjustment.find(filter).sort({ [sortKey]: dir } as Record<string, 1 | -1>).skip((page - 1) * limit).limit(limit),
      SupplyAdjustment.countDocuments(filter),
      SupplyAdjustment.aggregate([
        { $match: { ...filter, voided: false, type: "restock" } },
        { $group: { _id: null, totalCost: { $sum: { $multiply: ["$unitCost", "$quantity"] } } } },
      ]),
    ]);

    const totalCost: number = costAgg[0]?.totalCost ?? 0;
    res.json({ ...paginate(data, page, limit, total), totalCost });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/supply-adjustments/:id/void — admin only. Reverses the quantity
// change; voiding a "restock" also voids its linked Expense. The lookup,
// quantity reversal, expense void, and adjustment void all share one
// transaction so a failure partway through can't leave them out of sync.
router.patch("/:id/void", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  const session = await mongoose.startSession();
  try {
    let updated: InstanceType<typeof SupplyAdjustment> | null = null;
    await session.withTransaction(async () => {
      const adj = await SupplyAdjustment.findById(req.params.id).session(session);
      if (!adj) {
        const err: any = new Error("Not found");
        err.status = 404;
        throw err;
      }
      if (adj.voided) {
        const err: any = new Error("Already voided");
        err.status = 409;
        throw err;
      }

      const supplyExists = await Supply.exists({ _id: adj.supply }).session(session);

      if (supplyExists) {
        if (adj.type === "restock") {
          // Voiding a restock means removing quantity — ensure there's enough.
          const supply = await Supply.findOne({ _id: adj.supply, quantity: { $gte: adj.quantity } }).session(session);
          if (!supply) {
            const err: any = new Error("Not enough quantity on hand to void this restock");
            err.status = 409;
            throw err;
          }
          await Supply.updateOne({ _id: adj.supply }, { $inc: { quantity: -adj.quantity } }, { session });
        } else {
          // Voiding a consume restores quantity.
          await Supply.updateOne({ _id: adj.supply }, { $inc: { quantity: adj.quantity } }, { session });
        }
      }
      // If the supply was deleted, skip the quantity update but still mark voided.

      if (adj.type === "restock" && adj.expense) {
        await Expense.updateOne(
          { _id: adj.expense, voided: false },
          { voided: true, voidedAt: new Date(), voidedBy: req.user!.sub, voidedByName: req.user!.name },
          { session }
        );
      }

      updated = await SupplyAdjustment.findByIdAndUpdate(
        adj._id,
        { voided: true, voidedAt: new Date(), voidedBy: req.user!.sub, voidedByName: req.user!.name },
        { session, returnDocument: "after" }
      );
    });
    res.json(updated);
  } catch (err: any) {
    res.status(err.status ?? 400).json({ error: err.message });
  } finally {
    await session.endSession();
  }
});

export default router;
