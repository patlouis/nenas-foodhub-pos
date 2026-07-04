import { Router, type Request, type Response, type NextFunction } from "express";
import mongoose from "mongoose";
import Supply from "../models/Supply.js";
import SupplyAdjustment from "../models/SupplyAdjustment.js";
import Expense from "../models/Expense.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { createSupplySchema, updateSupplySchema, restockSchema, consumeSchema, listSuppliesQuerySchema } from "../schemas/supplies.js";
import { paginate } from "../schemas/pagination.js";

const router = Router();

// GET /api/supplies — admin only, paginated.
router.get("/", requireAuth, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = listSuppliesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
    }
    const { page, limit, q, status, sortKey, sortDir } = parsed.data;
    const dir = sortDir === "asc" ? 1 : -1;

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (q) filter.name = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };

    const [data, total] = await Promise.all([
      Supply.find(filter).sort({ [sortKey]: dir } as Record<string, 1 | -1>).skip((page - 1) * limit).limit(limit),
      Supply.countDocuments(filter),
    ]);
    res.json(paginate(data, page, limit, total));
  } catch (err) {
    next(err);
  }
});

// POST /api/supplies — create (admin only). A positive initial quantity
// requires a unit cost and immediately logs a "restock" adjustment plus a
// linked supplies Expense, mirroring how a Product created with stock > 0
// logs a "receiving" StockAdjustment. The supply, expense, and adjustment are
// created inside one transaction so a mid-request failure can't leave
// quantity bumped with no expense/adjustment to show for it.
router.post("/", requireAuth, requireAdmin, validateBody(createSupplySchema), async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  try {
    let created: InstanceType<typeof Supply> | undefined;
    await session.withTransaction(async () => {
      const { name, unit, quantity, unitCost, lowStockAt } = req.body;
      const [supply] = await Supply.create(
        [{
          name,
          unit,
          quantity: quantity ?? 0,
          unitCost: unitCost ?? null,
          lowStockAt: lowStockAt ?? undefined,
        }],
        { session }
      );

      if (supply.quantity > 0) {
        const [expense] = await Expense.create(
          [{
            amount: unitCost * supply.quantity,
            category: "supplies",
            description: `${supply.name} restock`,
            qty: supply.quantity,
            date: new Date(),
            loggedBy: req.user!.sub,
            loggedByName: req.user!.name,
          }],
          { session }
        );
        await SupplyAdjustment.create(
          [{
            supply: supply._id,
            supplyName: supply.name,
            unitCost,
            quantity: supply.quantity,
            type: "restock",
            expense: expense._id,
            adjustedBy: req.user!.sub,
            adjustedByName: req.user!.name,
          }],
          { session }
        );
      }

      created = supply;
    });
    res.status(201).json(created);
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "A supply with that name already exists" });
    }
    res.status(400).json({ error: err.message });
  } finally {
    await session.endSession();
  }
});

// PUT /api/supplies/:id — edit name/unit/threshold/status (admin only).
// Quantity and unitCost only change via /restock or /consume.
router.put("/:id", requireAuth, requireAdmin, validateBody(updateSupplySchema), async (req: Request, res: Response) => {
  try {
    const supply = await Supply.findByIdAndUpdate(req.params.id, req.body, { returnDocument: "after", runValidators: true });
    if (!supply) return res.status(404).json({ error: "Not found" });
    res.json(supply);
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "A supply with that name already exists" });
    }
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/supplies/:id/restock — admin only. Increments quantity, updates
// the supply's latest unit cost, and creates a linked Expense (category
// "supplies") so restocking never needs a separate manual expense entry.
// All three writes share one transaction.
router.patch("/:id/restock", requireAuth, requireAdmin, validateBody(restockSchema), async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid supply id" });
  }
  const session = await mongoose.startSession();
  try {
    let result: { supply: InstanceType<typeof Supply>; adjustment: InstanceType<typeof SupplyAdjustment> } | undefined;
    await session.withTransaction(async () => {
      const { quantity, unitCost } = req.body;

      const supply = await Supply.findOneAndUpdate(
        { _id: req.params.id },
        { $inc: { quantity }, $set: { unitCost } },
        { session, returnDocument: "after" }
      );
      if (!supply) {
        const err: any = new Error("Supply not found");
        err.status = 404;
        throw err;
      }

      const [expense] = await Expense.create(
        [{
          amount: unitCost * quantity,
          category: "supplies",
          description: `${supply.name} restock`,
          qty: quantity,
          date: new Date(),
          loggedBy: req.user!.sub,
          loggedByName: req.user!.name,
        }],
        { session }
      );

      const [adjustment] = await SupplyAdjustment.create(
        [{
          supply: supply._id,
          supplyName: supply.name,
          unitCost,
          quantity,
          type: "restock",
          expense: expense._id,
          adjustedBy: req.user!.sub,
          adjustedByName: req.user!.name,
        }],
        { session }
      );

      result = { supply, adjustment };
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(err.status ?? 400).json({ error: err.message });
  } finally {
    await session.endSession();
  }
});

// POST /api/supplies/:id/consume — admin only. Decrements quantity for
// day-to-day usage (e.g. "used 2 liters of cooking oil"); no expense involved.
router.post("/:id/consume", requireAuth, requireAdmin, validateBody(consumeSchema), async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid supply id" });
  }
  const session = await mongoose.startSession();
  try {
    let result: { supply: InstanceType<typeof Supply>; adjustment: InstanceType<typeof SupplyAdjustment> } | undefined;
    await session.withTransaction(async () => {
      const { quantity, reason } = req.body;

      const supply = await Supply.findOneAndUpdate(
        { _id: req.params.id, quantity: { $gte: quantity } },
        { $inc: { quantity: -quantity } },
        { session, returnDocument: "after" }
      );
      if (!supply) {
        const exists = await Supply.exists({ _id: req.params.id }).session(session);
        const err: any = new Error(exists ? "Not enough quantity on hand to consume that much" : "Supply not found");
        err.status = exists ? 409 : 404;
        throw err;
      }

      const [adjustment] = await SupplyAdjustment.create(
        [{
          supply: supply._id,
          supplyName: supply.name,
          quantity,
          type: "consume",
          reason: reason || undefined,
          adjustedBy: req.user!.sub,
          adjustedByName: req.user!.name,
        }],
        { session }
      );

      result = { supply, adjustment };
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(err.status ?? 400).json({ error: err.message });
  } finally {
    await session.endSession();
  }
});

export default router;
