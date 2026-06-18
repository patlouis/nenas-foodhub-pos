import { Router, type Request, type Response, type NextFunction } from "express";
import Product from "../models/Product.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { createProductSchema, updateProductSchema, adjustStockSchema, listProductsQuerySchema } from "../schemas/products.js";
import { paginate } from "../schemas/pagination.js";

const router = Router();

// GET /api/products — paginated list (any authenticated user).
// ?q= searches name/SKU, ?category= filters exactly, ?page=&limit= page through results.
router.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = listProductsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
    }
    const { page, limit, q, category, sortKey, sortDir } = parsed.data;

    const filter: Record<string, unknown> = {};
    if (category) filter.category = category;
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: re }, { sku: re }];
    }

    const dir = sortDir === "asc" ? 1 : -1;
    // "category" sorts by category name (+ name as a tiebreaker) rather than
    // the custom drag-order from CategoriesPage — that order only exists in
    // the Category collection, and joining it here for a sort isn't worth
    // the complexity for this list.
    const sort: Record<string, 1 | -1> = sortKey === "category" ? { category: dir, name: 1 } : { [sortKey]: dir };

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit),
      Product.countDocuments(filter),
    ]);
    res.json(paginate(products, page, limit, total));
  } catch (err) {
    next(err);
  }
});

// POST /api/products — create (admin only)
router.post("/", requireAuth, requireAdmin, validateBody(createProductSchema), async (req: Request, res: Response) => {
  try {
    const data = { ...req.body };
    // Sparse unique index skips null/undefined but not "". Normalize so two
    // products with no SKU don't collide.
    if (!data.sku) data.sku = undefined;
    const product = await Product.create(data);
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
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      data,
      { returnDocument: "after", runValidators: true }
    );
    if (!product) return res.status(404).json({ error: "Not found" });
    res.json(product);
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "A product with that SKU already exists" });
    }
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/products/:id/stock — adjust stock (admin only)
router.patch("/:id/stock", requireAuth, requireAdmin, validateBody(adjustStockSchema), async (req: Request, res: Response) => {
  try {
    const { delta } = req.body;
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, ...(delta < 0 ? { stock: { $gte: -delta } } : {}) },
      { $inc: { stock: delta } },
      { returnDocument: "after" }
    );
    if (!product) {
      return res.status(delta < 0 ? 409 : 404).json({
        error: delta < 0 ? "Not enough stock to remove that many units" : "Product not found",
      });
    }
    res.json(product);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/products/:id (admin only)
router.delete("/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

export default router;
