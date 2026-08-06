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
    const { page, limit, q, from, to, paymentType, sortKey, sortDir } = parsed.data;

    const filter: Record<string, unknown> = {};
    if (paymentType === "staff_meal") {
      filter.orderType = "staff_meal";
    } else if (paymentType) {
      filter.orderType = { $ne: "staff_meal" };
      filter.paymentMethod = paymentType;
    }
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

    const dir: 1 | -1 = sortDir === "asc" ? 1 : -1;
    const sort: Record<string, 1 | -1> =
      sortKey === "payment"
        ? { orderType: dir, paymentMethod: dir } // groups staff_meal, then cash/gcash
        : { [sortKey === "cashier" ? "cashierName" : sortKey === "total" ? "total" : "createdAt"]: dir };

    // The payment-type revenue total is admin-only; never compute or return it
    // for cashiers so it can't be read from the API response.
    // Voided orders are excluded from the money total (their stock was put back
    // and nothing was collected) but stay in the list itself as historical
    // record — same split the expenses route makes.
    const isAdmin = req.user?.role === "admin";
    const [orders, total, amountAgg] = await Promise.all([
      Order.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
      Order.countDocuments(filter),
      isAdmin && paymentType
        ? Order.aggregate([
            { $match: { ...filter, status: { $ne: "voided" } } },
            { $group: { _id: null, sum: { $sum: "$total" } } },
          ])
        : Promise.resolve(null),
    ]);
    const totalAmount = amountAgg ? (amountAgg[0]?.sum ?? 0) : undefined;
    res.json(paginate(orders, page, limit, total, totalAmount));
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
  const orderType: "sale" | "staff_meal" = req.body.orderType ?? "sale";
  const staffMealRecipient: string | undefined = req.body.staffMealRecipient || undefined;
  // Staff meals aren't customer table sales, so they never carry a table number.
  const tableNumber: number | undefined = orderType === "staff_meal" ? undefined : req.body.tableNumber;

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

  const orderItems = items.map((it) => {
    const p = byId.get(it.productId)!;
    const lineTotal = orderType === "staff_meal" ? 0 : computeLineTotal(p, it.quantity);
    return { product: p._id, name: p.name, price: p.price, costPrice: p.costPrice ?? null, quantity: it.quantity, lineTotal };
  });
  const total = orderType === "staff_meal" ? 0 : orderItems.reduce((sum, i) => sum + i.lineTotal, 0);

  // Stock decrements + order-number assignment + the order insert all happen
  // in one transaction per attempt, so a crash mid-request can't leave stock
  // taken with no order to show for it (the previous manual-compensation
  // approach couldn't survive that). A duplicate order-number (two cashiers
  // submitting at the same instant) aborts that attempt and retries fresh
  // with a re-read max — up to 5 times — rather than being silently swallowed.
  let order: InstanceType<typeof Order> | undefined;
  let failure: { status: number; message: string } | undefined;

  for (let attempt = 0; attempt < 5 && !order; attempt++) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        for (const it of items) {
          const result = await Product.updateOne(
            { _id: it.productId, stock: { $gte: it.quantity } },
            { $inc: { stock: -it.quantity } },
            { session }
          );
          if (result.modifiedCount === 0) {
            const err: any = new Error(`Not enough stock for ${byId.get(it.productId)!.name}`);
            err.status = 409;
            throw err;
          }
        }

        const last = await Order.findOne({}, { orderNumber: 1 }).sort({ orderNumber: -1 }).session(session);
        const orderNumber = (last?.orderNumber ?? 0) + 1;

        const [created] = await Order.create(
          [{ orderNumber, items: orderItems, total, cashier: req.user!.sub, cashierName: req.user!.name, orderType, staffMealRecipient, paymentMethod, tableNumber }],
          { session }
        );
        order = created;
      });
    } catch (err: any) {
      if (err.code === 11000) continue; // order-number collision — retry with a fresh transaction
      failure = { status: err.status ?? 400, message: err.message };
      break;
    } finally {
      await session.endSession();
    }
  }

  if (order) return res.status(201).json(order);
  if (failure) return res.status(failure.status).json({ error: failure.message });
  res.status(409).json({ error: "Failed to place order — please try again" });
});

// PATCH /api/orders/:id/void — void an order (admin only). Restores the
// stock that was taken at sale time and marks the order voided; the order
// itself is kept (not deleted) so it stays in the historical record.
router.patch("/:id/void", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid order id" });
  }

  const session = await mongoose.startSession();
  try {
    let updated: InstanceType<typeof Order> | null = null;
    await session.withTransaction(async () => {
      const order = await Order.findById(req.params.id).session(session);
      if (!order) {
        const err: any = new Error("Order not found");
        err.status = 404;
        throw err;
      }
      if (order.status === "voided") {
        const err: any = new Error("Order is already voided");
        err.status = 409;
        throw err;
      }

      await Promise.all(
        order.items.map((item) =>
          Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } }, { session })
        )
      );

      // findByIdAndUpdate only validates the fields being set, unlike .save()
      // which re-validates the whole document (including legacy orders whose
      // items predate the lineTotal field).
      updated = await Order.findByIdAndUpdate(
        order._id,
        {
          status: "voided",
          voidedAt: new Date(),
          voidedBy: req.user!.sub,
          voidedByName: req.user!.name,
        },
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
