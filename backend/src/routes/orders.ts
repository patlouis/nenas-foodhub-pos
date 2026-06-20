import { Router, type Request, type Response, type NextFunction } from "express";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { computeLineTotal } from "../lib/pricing.js";
import { createOrderSchema, listOrdersQuerySchema } from "../schemas/orders.js";
import { paginate } from "../schemas/pagination.js";

const router = Router();

// GET /api/orders — paginated, newest first by default (any authenticated user).
// ?q= searches cashier name / item names / order number, ?from=&to= filter by
// createdAt (ISO strings), ?sortKey=&sortDir= reorder, ?page=&limit= page through.
router.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = listOrdersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
    }
    const { page, limit, q, from, to, sortKey, sortDir } = parsed.data;

    const filter: Record<string, unknown> = {};
    if (from || to) {
      const range: { $gte?: Date; $lte?: Date } = {};
      if (from) range.$gte = new Date(from);
      if (to) range.$lte = new Date(to);
      filter.createdAt = range;
    }
    if (q) {
      const qClean = q.replace(/^#/, "");
      const re = new RegExp(qClean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const or: Record<string, unknown>[] = [{ cashierName: re }, { "items.name": re }];
      // Order numbers are stored as a Number, so a substring match needs $expr
      // to compare against the stringified value.
      if (/^\d+$/.test(qClean)) {
        or.push({ $expr: { $regexMatch: { input: { $toString: "$orderNumber" }, regex: qClean } } });
      }
      filter.$or = or;
    }

    const sortField = sortKey === "cashier" ? "cashierName" : sortKey === "total" ? "total" : "createdAt";
    const sort: Record<string, 1 | -1> = { [sortField]: sortDir === "asc" ? 1 : -1 };

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit),
      Order.countDocuments(filter),
    ]);
    res.json(paginate(orders, page, limit, total));
  } catch (err) {
    next(err);
  }
});

// POST /api/orders — place an order (any authenticated user).
// The client sends only { items: [{ productId, quantity }] }. Names and
// prices are looked up server-side so a tampered request can't set its own
// prices, and the stored snapshot always matches the catalog at sale time.
router.post("/", requireAuth, validateBody(createOrderSchema), async (req: Request, res: Response) => {
  const rawItems = req.body.items as { productId: string; quantity: number }[];
  const paymentMethod: "cash" | "gcash" = req.body.paymentMethod ?? "cash";

  // Merge duplicate products into one line.
  const qtyById = new Map<string, number>();
  for (const it of rawItems) {
    qtyById.set(it.productId, (qtyById.get(it.productId) ?? 0) + it.quantity);
  }
  const items = [...qtyById.entries()].map(([productId, quantity]) => ({ productId, quantity }));

  const products = await Product.find({ _id: { $in: items.map((i) => i.productId) } });
  const byId = new Map(products.map((p) => [p._id.toString(), p]));
  for (const it of items) {
    if (!byId.has(it.productId)) {
      return res.status(400).json({ error: "One of the products no longer exists" });
    }
  }

  // Decrement stock atomically per item (the $gte guard stops two registers
  // overselling the same unit). If any item falls short, restore what was already taken.
  const decremented: { productId: string; quantity: number }[] = [];
  for (const it of items) {
    const result = await Product.updateOne(
      { _id: it.productId, stock: { $gte: it.quantity } },
      { $inc: { stock: -it.quantity } }
    );
    if (result.modifiedCount === 0) {
      await Promise.all(
        decremented.map((d) =>
          Product.updateOne({ _id: d.productId }, { $inc: { stock: d.quantity } })
        )
      );
      return res
        .status(409)
        .json({ error: `Not enough stock for ${byId.get(it.productId)!.name}` });
    }
    decremented.push({ productId: it.productId, quantity: it.quantity });
  }

  try {
    const orderItems = items.map((it) => {
      const p = byId.get(it.productId)!;
      const lineTotal = computeLineTotal(p, it.quantity);
      return { product: p._id, name: p.name, price: p.price, costPrice: p.costPrice ?? null, quantity: it.quantity, lineTotal };
    });
    const total = orderItems.reduce((sum, i) => sum + i.lineTotal, 0);

    const last = await Order.findOne({}, { orderNumber: 1 }).sort({ orderNumber: -1 });
    const orderNumber = (last?.orderNumber ?? 0) + 1;

    const order = await Order.create({
      orderNumber,
      items: orderItems,
      total,
      cashier: req.user!.sub,
      cashierName: req.user!.name,
      paymentMethod,
    });
    res.status(201).json(order);
  } catch (err: any) {
    // Order insert failed after stock was taken — give the stock back.
    await Promise.all(
      decremented.map((d) =>
        Product.updateOne({ _id: d.productId }, { $inc: { stock: d.quantity } })
      )
    );
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/orders/:id/void — void an order (admin only). Restores the
// stock that was taken at sale time and marks the order voided; the order
// itself is kept (not deleted) so it stays in the historical record.
router.patch("/:id/void", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid order id" });
  }
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status === "voided") {
    return res.status(409).json({ error: "Order is already voided" });
  }

  await Promise.all(
    order.items.map((item) =>
      Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } })
    )
  );

  // findByIdAndUpdate only validates the fields being set, unlike .save()
  // which re-validates the whole document (including legacy orders whose
  // items predate the lineTotal field).
  const updated = await Order.findByIdAndUpdate(
    order._id,
    {
      status: "voided",
      voidedAt: new Date(),
      voidedBy: req.user!.sub,
      voidedByName: req.user!.name,
    },
    { returnDocument: "after" }
  );

  res.json(updated);
});

export default router;
