import { Router, type Request, type Response, type NextFunction } from "express";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import StockAdjustment from "../models/StockAdjustment.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { createProductSchema, updateProductSchema, adjustStockSchema, wastageSchema, listProductsQuerySchema, feePairError } from "../schemas/products.js";
import { paginate } from "../schemas/pagination.js";

const router = Router();

// GET /api/products — paginated list (any authenticated user).
// ?q= searches name/SKU, ?category= filters by category ObjectId, ?page=&limit= page through results.
router.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = listProductsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
    }
    const { page, limit, q, category, sortKey, sortDir } = parsed.data;

    const filter: Record<string, unknown> = {};
    if (category) filter.category = new mongoose.Types.ObjectId(category);
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: re }, { sku: re }];
    }

    const dir = sortDir === "asc" ? 1 : -1;

    if (sortKey === "category") {
      // Sort by the category's drag-order field, then category name, then product name.
      // Requires a $lookup; $facet returns page data and total count in one round-trip.
      const pipeline: mongoose.PipelineStage[] = [
        { $match: filter },
        {
          $lookup: {
            from: "categories",
            localField: "category",
            foreignField: "_id",
            as: "_cat",
          },
        },
        {
          $addFields: {
            _catOrder: { $ifNull: [{ $arrayElemAt: ["$_cat.order", 0] }, 9999] },
            _catName:  { $ifNull: [{ $arrayElemAt: ["$_cat.name",  0] }, "zzz"] },
          },
        },
        { $sort: { _catOrder: dir, _catName: dir, name: 1 } },
        {
          $facet: {
            data:  [{ $skip: (page - 1) * limit }, { $limit: limit }],
            total: [{ $count: "count" }],
          },
        },
      ];
      const [result] = await Product.aggregate(pipeline);
      const items = (result?.data ?? []) as unknown[];
      const total = (result?.total?.[0]?.count ?? 0) as number;
      return res.json(paginate(items, page, limit, total));
    }

    const sort: Record<string, 1 | -1> = { [sortKey]: dir };
    const [products, total] = await Promise.all([
      Product.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
      Product.countDocuments(filter),
    ]);
    res.json(paginate(products, page, limit, total));
  } catch (err) {
    next(err);
  }
});

// Counting units and selling halves contradict each other: a half draws down
// half a unit, which stock can't represent, so it would silently decrement a
// whole one. Halves are for bulk-portioned dishes, which don't carry a count.
const HALF_TRACKED_ERROR = "A product that tracks stock can't be sold as a half serving";

function halfConflictsWithStock(stock: number | null | undefined, halfPrice: number | null | undefined) {
  return stock != null && halfPrice != null;
}

// POST /api/products — create (admin only)
router.post("/", requireAuth, requireAdmin, validateBody(createProductSchema), async (req: Request, res: Response) => {
  try {
    const data = { ...req.body };
    if (!data.sku) data.sku = undefined;
    // stock defaults to 0 (tracked) when omitted, so an absent field still counts.
    if (halfConflictsWithStock(data.stock === undefined ? 0 : data.stock, data.halfPrice)) {
      return res.status(400).json({ error: HALF_TRACKED_ERROR });
    }
    const feeError = feePairError(data.feeLabel, data.feeAmount);
    if (feeError) return res.status(400).json({ error: feeError });
    const product = await Product.create(data);
    if (product.stock !== null && product.stock > 0) {
      await StockAdjustment.create({
        product: product._id,
        productName: product.name,
        costPrice: product.costPrice ?? null,
        quantity: product.stock,
        type: "receiving",
        adjustedBy: req.user!.sub,
        adjustedByName: req.user!.name,
      });
    }
    res.status(201).json(product);
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "A product with that SKU already exists" });
    }
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/products/:id — update (admin only)
router.put("/:id", requireAuth, requireAdmin, validateBody(updateProductSchema), async (req: Request, res: Response) => {
  try {
    const data = { ...req.body };
    if (!data.sku) data.sku = undefined;
    // Checked against the merged result, not the patch: turning tracking on
    // without mentioning halfPrice must still be caught, and vice versa.
    const existing = await Product.findById(req.params.id, { stock: 1, halfPrice: 1, feeLabel: 1, feeAmount: 1 });
    if (!existing) return res.status(404).json({ error: "Not found" });
    const nextStock = "stock" in data ? data.stock : existing.stock;
    const nextHalf = "halfPrice" in data ? data.halfPrice : existing.halfPrice;
    if (halfConflictsWithStock(nextStock, nextHalf)) {
      return res.status(400).json({ error: HALF_TRACKED_ERROR });
    }
    const feeError = feePairError(
      "feeLabel" in data ? data.feeLabel : existing.feeLabel,
      "feeAmount" in data ? data.feeAmount : existing.feeAmount,
    );
    if (feeError) return res.status(400).json({ error: feeError });
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      data,
      { returnDocument: "after", runValidators: true }
    );
    if (!product) return res.status(404).json({ error: "Not found" });

    // Backfill the cost onto past adjustments that never captured one (e.g.
    // stock received before a cost was entered). Only fills nulls — a real
    // snapshot is left untouched so repricing never rewrites history.
    if (data.costPrice != null) {
      await StockAdjustment.updateMany(
        { product: product._id, costPrice: null },
        { $set: { costPrice: data.costPrice } }
      );
    }

    res.json(product);
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "A product with that SKU already exists" });
    }
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/products/:id/stock — adjust stock (admin only). Logs to stock_adjustments.
router.patch("/:id/stock", requireAuth, requireAdmin, validateBody(adjustStockSchema), async (req: Request, res: Response) => {
  try {
    const { delta, costPrice } = req.body;
    // A received batch can carry its own unit cost: record it as the product's
    // latest cost so this and future snapshots (and menu profit) reflect it.
    const update: Record<string, unknown> = { $inc: { stock: delta } };
    if (delta > 0 && costPrice != null) update.$set = { costPrice };
    // Removing needs enough on hand; adding only needs a tracked product,
    // since $inc against a null stock would error rather than start counting.
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, stock: delta < 0 ? { $gte: -delta } : { $ne: null } },
      update,
      { returnDocument: "after" }
    );
    if (!product) {
      const existing = await Product.findById(req.params.id, { stock: 1 });
      if (!existing) return res.status(404).json({ error: "Product not found" });
      if (existing.stock === null) {
        return res.status(409).json({ error: "This product doesn't track stock" });
      }
      return res.status(409).json({ error: "Not enough stock to remove that many units" });
    }
    // Log positive deltas as "receiving"; negative deltas (manual removals) are
    // uncommon but still worth recording.
    if (delta !== 0) {
      await StockAdjustment.create({
        product: product._id,
        productName: product.name,
        costPrice: product.costPrice ?? null,
        quantity: Math.abs(delta),
        type: delta > 0 ? "receiving" : "wastage",
        adjustedBy: req.user!.sub,
        adjustedByName: req.user!.name,
      });
    }
    res.json(product);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/products/:id/wastage — write off stock as wastage (admin only).
// Decrements stock atomically and records a StockAdjustment for the audit log.
router.post("/:id/wastage", requireAuth, requireAdmin, validateBody(wastageSchema), async (req: Request, res: Response) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid product id" });
    }
    const { quantity, reason } = req.body as { quantity: number; reason: string };

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, stock: { $gte: quantity } },
      { $inc: { stock: -quantity } },
      { returnDocument: "after" }
    );
    if (!product) {
      const existing = await Product.findById(req.params.id, { stock: 1 });
      if (!existing) return res.status(404).json({ error: "Product not found" });
      if (existing.stock === null) {
        return res.status(409).json({ error: "This product doesn't track stock" });
      }
      return res.status(409).json({ error: "Not enough stock to write off that many units" });
    }

    try {
      await StockAdjustment.create({
        product: product._id,
        productName: product.name,
        costPrice: product.costPrice ?? null,
        quantity,
        type: "wastage",
        reason,
        adjustedBy: req.user!.sub,
        adjustedByName: req.user!.name,
      });
    } catch (err: any) {
      await Product.updateOne({ _id: product._id }, { $inc: { stock: quantity } });
      return res.status(400).json({ error: err.message });
    }

    res.status(201).json(product);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/products/:id (admin only)
// ?force=true bypasses the stock-history check.
router.delete("/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid product id" });
  }

  if (req.query.force !== "true") {
    const hasHistory = await StockAdjustment.exists({ product: req.params.id });
    if (hasHistory) {
      return res.status(409).json({
        code: "HAS_STOCK_HISTORY",
        error: "This product has inventory log history. Disable it instead, or confirm deletion.",
      });
    }
  }

  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

export default router;
