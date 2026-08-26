import { Router, type Request, type Response, type NextFunction } from "express";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { computeLineTotal, type Portion } from "../lib/pricing.js";
import { createOrderSchema, listOrdersQuerySchema, peakHoursQuerySchema, summaryQuerySchema } from "../schemas/orders.js";
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

// GET /api/orders/peak-hours — order counts per hour of the day, all time.
// Aggregated here so the dashboard can draw the chart without downloading
// every order it has. Hours are bucketed in the caller's timezone, matching
// what the browser used to compute locally.
router.get("/peak-hours", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = peakHoursQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
    }
    const { timezone } = parsed.data;

    const buckets = await Order.aggregate<{ _id: number; count: number }>([
      { $match: { status: { $ne: "voided" }, orderType: { $ne: "staff_meal" } } },
      { $group: { _id: { $hour: { date: "$createdAt", timezone } }, count: { $sum: 1 } } },
    ]);

    const hours = new Array<number>(24).fill(0);
    for (const b of buckets) hours[b._id] = b.count;
    res.json({ hours });
  } catch (err) {
    next(err);
  }
});

// Orders entered after midnight but before this hour still belong to the
// previous business day. Mirrors BUSINESS_DAY_CUTOFF_HOUR in the frontend's
// dateHelpers — the two must agree or the chart won't match the KPI cards.
const BUSINESS_DAY_CUTOFF_HOUR = 4;

// Voided orders collected nothing and staff meals were never sold, so no
// revenue figure counts either of them.
const SOLD_ONLY = { status: { $ne: "voided" }, orderType: { $ne: "staff_meal" } };

function rangeMatch(from?: string, to?: string): Record<string, unknown> {
  if (!from && !to) return { ...SOLD_ONLY };
  const range: { $gte?: Date; $lte?: Date } = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to);
  return { ...SOLD_ONLY, createdAt: range };
}

// Line revenue, falling back to price × quantity for orders written before
// lineTotal existed — the same rule the dashboard applied in the browser.
const LINE_TOTAL = {
  $ifNull: ["$items.lineTotal", { $multiply: ["$items.price", "$items.quantity"] }],
};
// A missing costPrice compares equal to null here, so both legacy items and
// deliberately uncosted ones fall to the uncosted side.
const HAS_COST = { $ne: ["$items.costPrice", null] };

interface ItemRow {
  name: string;
  portion: "full" | "half";
  qty: number;
  revenue: number;
  costedQty: number;
  costedRevenue: number;
  costSum: number;
}

// Per name+portion rather than per product id: order items snapshot the name,
// and the dashboard's category lookup and half-serving split are both keyed on
// that pair. Costed and uncosted quantities are reported separately because
// only the caller knows the current catalog cost to fall back to, and only for
// a full serving — a half must never borrow the full portion's cost.
async function summarize(match: Record<string, unknown>) {
  const [totals] = await Order.aggregate<{ revenue: number; orderCount: number }>([
    { $match: match },
    { $group: { _id: null, revenue: { $sum: "$total" }, orderCount: { $sum: 1 } } },
  ]);
  const rows = await Order.aggregate<{ _id: { name: string; portion: "full" | "half" } } & Omit<ItemRow, "name" | "portion">>([
    { $match: match },
    { $unwind: "$items" },
    {
      $group: {
        _id: { name: "$items.name", portion: { $ifNull: ["$items.portion", "full"] } },
        qty: { $sum: "$items.quantity" },
        revenue: { $sum: LINE_TOTAL },
        costedQty: { $sum: { $cond: [HAS_COST, "$items.quantity", 0] } },
        costedRevenue: { $sum: { $cond: [HAS_COST, LINE_TOTAL, 0] } },
        costSum: { $sum: { $cond: [HAS_COST, { $multiply: ["$items.costPrice", "$items.quantity"] }, 0] } },
      },
    },
  ]);
  const items: ItemRow[] = rows.map((r) => ({
    name: r._id.name,
    portion: r._id.portion,
    qty: r.qty,
    revenue: r.revenue,
    costedQty: r.costedQty,
    costedRevenue: r.costedRevenue,
    costSum: r.costSum,
  }));
  return {
    revenue: totals?.revenue ?? 0,
    orderCount: totals?.orderCount ?? 0,
    itemsSold: items.reduce((s, i) => s + i.qty, 0),
    items,
  };
}

// GET /api/orders/summary — every dashboard figure for a period, aggregated in
// the database. The browser used to fetch a page of orders and add them up,
// which silently dropped everything past the page limit: at 1376 orders the
// all-time total was short by a quarter, and each new order pushed an older one
// out of the window, so new sales replaced old revenue instead of adding to it.
router.get("/summary", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = summaryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
    }
    const { from, to, prevFrom, prevTo, bucket, timezone } = parsed.data;

    const match = rangeMatch(from, to);
    // Shifting the clock back by the cutoff before truncating puts an order
    // rung up at 00:46 into the previous day, exactly as dayRange does.
    const businessDate = {
      $subtract: ["$createdAt", BUSINESS_DAY_CUTOFF_HOUR * 60 * 60 * 1000],
    };
    // Hour buckets stay on the real timestamp: the day view's chart labels a
    // trailing 12am bar itself, folding in the after-midnight tail.
    const bucketKey =
      bucket === "hour"
        ? { $toString: { $hour: { date: "$createdAt", timezone } } }
        : { $dateToString: { date: businessDate, format: bucket === "month" ? "%Y-%m" : "%Y-%m-%d", timezone } };

    const [current, previous, series] = await Promise.all([
      summarize(match),
      prevFrom || prevTo
        ? summarize(rangeMatch(prevFrom, prevTo))
        : Promise.resolve({ revenue: 0, orderCount: 0, itemsSold: 0, items: [] as ItemRow[] }),
      Order.aggregate<{ _id: string; value: number }>([
        { $match: match },
        { $group: { _id: bucketKey, value: { $sum: "$total" } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({
      current,
      previous,
      series: series.map((b) => ({ key: b._id, value: b.value })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/orders — place an order (any authenticated user).
// The client sends only { items: [{ productId, quantity }] }. Names and
// prices are looked up server-side so a tampered request can't set its own
// prices, and the stored snapshot always matches the catalog at sale time.
router.post("/", requireAuth, validateBody(createOrderSchema), async (req: Request, res: Response) => {
  const rawItems = req.body.items as { productId: string; quantity: number; portion: Portion }[];
  const paymentMethod: "cash" | "gcash" = req.body.paymentMethod ?? "cash";
  const orderType: "sale" | "staff_meal" = req.body.orderType ?? "sale";
  const staffMealRecipient: string | undefined = req.body.staffMealRecipient || undefined;
  // Staff meals aren't customer table sales, so they never carry a table number.
  const tableNumber: number | undefined = orderType === "staff_meal" ? undefined : req.body.tableNumber;

  // Merge duplicates, keyed by product *and* portion: a full and a half of the
  // same dish are priced differently and stay separate lines.
  const qtyByKey = new Map<string, { productId: string; portion: Portion; quantity: number }>();
  for (const it of rawItems) {
    const portion: Portion = it.portion ?? "full";
    const key = `${it.productId}:${portion}`;
    const existing = qtyByKey.get(key);
    if (existing) existing.quantity += it.quantity;
    else qtyByKey.set(key, { productId: it.productId, portion, quantity: it.quantity });
  }
  const items = [...qtyByKey.values()];

  const products = await Product.find({ _id: { $in: items.map((i) => i.productId) } });
  const byId = new Map(products.map((p) => [p._id.toString(), p]));
  for (const it of items) {
    const p = byId.get(it.productId);
    if (!p) {
      return res.status(400).json({ error: "One of the products no longer exists" });
    }
    // A half can only be sold for a dish that offers one. Guards against a
    // stale client whose catalog still shows a half price that's been removed.
    if (it.portion === "half" && p.halfPrice == null) {
      return res.status(400).json({ error: `${p.name} is not sold as a half serving` });
    }
  }

  const orderItems = items.map((it) => {
    const p = byId.get(it.productId)!;
    const half = it.portion === "half";
    const lineTotal = orderType === "staff_meal" ? 0 : computeLineTotal(p, it.quantity, it.portion);
    return {
      product: p._id,
      name: p.name,
      // Snapshot the rates for the portion actually sold, so history and
      // margin stay right even if the dish is repriced later.
      price: half ? p.halfPrice! : p.price,
      costPrice: (half ? p.halfCostPrice : p.costPrice) ?? null,
      portion: it.portion,
      quantity: it.quantity,
      lineTotal,
    };
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
          // Untracked products can't run out, and $inc against a null field
          // is a MongoDB error rather than a no-op.
          if (byId.get(it.productId)!.stock === null) continue;
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

      // An untracked product has no tally to give the units back to, and $inc
      // against null is a MongoDB error that would abort the whole void — so
      // the order could never be voided at all. Matching on stock rather than
      // reading it first keeps the skip atomic with the increment. Same rule
      // as voiding a stock adjustment: no tally, no reversal, order still voids.
      await Promise.all(
        order.items.map((item) =>
          Product.updateOne(
            { _id: item.product, stock: { $ne: null } },
            { $inc: { stock: item.quantity } },
            { session }
          )
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
