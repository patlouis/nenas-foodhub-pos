import { Router } from "express";
import Category from "../models/Category.js";
import Product from "../models/Product.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { createCategorySchema, updateCategorySchema, reorderSchema } from "../schemas/categories.js";
const router = Router();
// GET /api/categories — list all (any authenticated user)
router.get("/", requireAuth, async (_req, res, next) => {
    try {
        const [categories, counts] = await Promise.all([
            Category.find().sort({ order: 1, name: 1 }).lean(),
            Product.aggregate([
                { $match: { category: { $exists: true, $ne: null } } },
                { $group: { _id: "$category", count: { $sum: 1 } } },
            ]),
        ]);
        const countById = new Map(counts.map((c) => [c._id.toString(), c.count]));
        res.json(categories.map((c) => ({
            ...c,
            productCount: countById.get(c._id.toString()) ?? 0,
        })));
    }
    catch (err) {
        next(err);
    }
});
// PUT /api/categories/reorder — persist display order (admin only)
// Must be defined before PUT /:id so "reorder" isn't treated as a Mongo ObjectId.
router.put("/reorder", requireAuth, requireAdmin, validateBody(reorderSchema), async (req, res) => {
    const { items } = req.body;
    await Promise.all(items.map(({ id, order }) => Category.findByIdAndUpdate(id, { order })));
    res.json({ ok: true });
});
// POST /api/categories — create (admin only)
router.post("/", requireAuth, requireAdmin, validateBody(createCategorySchema), async (req, res) => {
    try {
        const count = await Category.countDocuments();
        const category = await Category.create({
            name: req.body.name,
            color: req.body.color || "#aa3bff",
            order: count,
        });
        res.status(201).json(category);
    }
    catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ error: "A category with that name already exists" });
        }
        res.status(400).json({ error: err.message });
    }
});
// PUT /api/categories/:id — rename / recolor (admin only)
router.put("/:id", requireAuth, requireAdmin, validateBody(updateCategorySchema), async (req, res) => {
    try {
        const updates = {};
        if (req.body.name !== undefined)
            updates.name = req.body.name;
        if (req.body.color !== undefined)
            updates.color = req.body.color;
        const category = await Category.findByIdAndUpdate(req.params.id, updates, { returnDocument: "after", runValidators: true });
        if (!category)
            return res.status(404).json({ error: "Not found" });
        res.json(category);
    }
    catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ error: "A category with that name already exists" });
        }
        res.status(400).json({ error: err.message });
    }
});
// DELETE /api/categories/:id (admin only)
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category)
        return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
});
export default router;
