import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../test/db.js";
import { loginAs } from "../test/helpers.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import mongoose from "mongoose";

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

function createProduct(overrides: Partial<{ name: string; price: number; stock: number }> = {}) {
  return Product.create({
    name: overrides.name ?? "Adobo",
    price: overrides.price ?? 100,
    stock: overrides.stock ?? 10,
  });
}

describe("POST /api/orders", () => {
  it("requires authentication", async () => {
    const res = await request(app).post("/api/orders").send({ items: [] });
    expect(res.status).toBe(401);
  });

  it("creates an order and decrements stock", async () => {
    const { token } = await loginAs("cashier");
    const product = await createProduct({ stock: 5 });

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ productId: product._id.toString(), quantity: 2 }] });

    expect(res.status).toBe(201);
    expect(res.body.total).toBe(200);

    const updated = await Product.findById(product._id);
    expect(updated!.stock).toBe(3);
  });

  it("sells a product that doesn't track stock without ever running out", async () => {
    const { token } = await loginAs("cashier");
    // Rice by the cup: portioned out of bulk, so there is no per-item tally.
    const product = await Product.create({ name: "Rice", price: 20, stock: null });

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ productId: product._id.toString(), quantity: 500 }] });

    expect(res.status).toBe(201);
    expect(res.body.total).toBe(10000);

    // Left untracked rather than decremented into a number.
    const after = await Product.findById(product._id);
    expect(after!.stock).toBeNull();
  });

  it("still enforces stock on tracked items in an order that mixes both", async () => {
    const { token } = await loginAs("cashier");
    const rice = await Product.create({ name: "Rice", price: 20, stock: null });
    const yakult = await createProduct({ name: "Yakult", stock: 1 });

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [
          { productId: rice._id.toString(), quantity: 3 },
          { productId: yakult._id.toString(), quantity: 2 },
        ],
      });

    expect(res.status).toBe(409);
    // The untracked line must not mask the tracked one running short.
    const riceAfter = await Product.findById(rice._id);
    expect(riceAfter!.stock).toBeNull();
    const yakultAfter = await Product.findById(yakult._id);
    expect(yakultAfter!.stock).toBe(1);
  });

  it("rejects when stock is insufficient and leaves stock untouched", async () => {
    const { token } = await loginAs("cashier");
    const product = await createProduct({ stock: 1 });

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ productId: product._id.toString(), quantity: 5 }] });

    expect(res.status).toBe(409);
    const updated = await Product.findById(product._id);
    expect(updated!.stock).toBe(1);
  });

  it("only lets one of two simultaneous orders take the last unit", async () => {
    const { token } = await loginAs("cashier");
    const product = await createProduct({ stock: 1 });

    const placeOne = () =>
      request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${token}`)
        .send({ items: [{ productId: product._id.toString(), quantity: 1 }] });

    const [a, b] = await Promise.all([placeOne(), placeOne()]);
    const statuses = [a.status, b.status].sort();

    expect(statuses).toEqual([201, 409]);
    const updated = await Product.findById(product._id);
    expect(updated!.stock).toBe(0);
  });

  it("prices a half serving from halfPrice and snapshots that rate", async () => {
    const { token } = await loginAs("cashier");
    const product = await Product.create({
      name: "Adobong Manok", price: 60, halfPrice: 35, costPrice: 30, halfCostPrice: 18, stock: null,
    });

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ productId: product._id.toString(), quantity: 2, portion: "half" }] });

    expect(res.status).toBe(201);
    expect(res.body.total).toBe(70); // 2 × 35, not 2 × 30
    expect(res.body.items[0].portion).toBe("half");
    expect(res.body.items[0].price).toBe(35);
    expect(res.body.items[0].costPrice).toBe(18);
  });

  it("keeps a full and a half of the same dish as separate lines", async () => {
    const { token } = await loginAs("cashier");
    const product = await Product.create({ name: "Adobong Manok", price: 60, halfPrice: 35, stock: null });

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [
          { productId: product._id.toString(), quantity: 1, portion: "full" },
          { productId: product._id.toString(), quantity: 1, portion: "half" },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(95);
  });

  it("still merges duplicates of the same dish and portion", async () => {
    const { token } = await loginAs("cashier");
    const product = await Product.create({ name: "Adobong Manok", price: 60, halfPrice: 35, stock: null });

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [
          { productId: product._id.toString(), quantity: 1, portion: "half" },
          { productId: product._id.toString(), quantity: 2, portion: "half" },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].quantity).toBe(3);
  });

  it("refuses a half serving for a dish that doesn't offer one", async () => {
    const { token } = await loginAs("cashier");
    const product = await createProduct({ name: "Yakult", stock: 10 });

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ productId: product._id.toString(), quantity: 1, portion: "half" }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not sold as a half serving/);
  });

  it("never applies the bulk deal to half servings", async () => {
    const { token } = await loginAs("cashier");
    const product = await Product.create({
      name: "Adobong Manok", price: 60, halfPrice: 35, discountQty: 3, discountPrice: 150, stock: null,
    });

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ productId: product._id.toString(), quantity: 3, portion: "half" }] });

    expect(res.status).toBe(201);
    expect(res.body.total).toBe(105); // 3 × 35, not the 150 full-serving deal
  });

  it("defaults to a full serving when no portion is sent", async () => {
    const { token } = await loginAs("cashier");
    const product = await Product.create({ name: "Adobong Manok", price: 60, halfPrice: 35, stock: null });

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ productId: product._id.toString(), quantity: 1 }] });

    expect(res.status).toBe(201);
    expect(res.body.total).toBe(60);
    expect(res.body.items[0].portion).toBe("full");
  });

  it("rejects a malformed item via schema validation", async () => {
    const { token } = await loginAs("cashier");
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ productId: "not-an-id", quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  it("records a valid table number on the order", async () => {
    const { token } = await loginAs("cashier");
    const product = await createProduct({ stock: 5 });

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ productId: product._id.toString(), quantity: 1 }], tableNumber: 3 });

    expect(res.status).toBe(201);
    expect(res.body.tableNumber).toBe(3);
  });

  it("rejects an out-of-range table number", async () => {
    const { token } = await loginAs("cashier");
    const product = await createProduct({ stock: 5 });

    for (const tableNumber of [0, 7]) {
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${token}`)
        .send({ items: [{ productId: product._id.toString(), quantity: 1 }], tableNumber });
      expect(res.status).toBe(400);
    }
  });

  it("ignores a table number on a staff meal", async () => {
    const { token } = await loginAs("cashier");
    const product = await createProduct({ stock: 5 });

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ productId: product._id.toString(), quantity: 1 }],
        orderType: "staff_meal",
        tableNumber: 2,
      });

    expect(res.status).toBe(201);
    expect(res.body.tableNumber).toBeUndefined();
  });
});

describe("PATCH /api/orders/:id/void", () => {
  async function placeOrder(token: string, productId: string, quantity: number) {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ productId, quantity }] });
    return res.body;
  }

  it("is admin-only, restores stock, and is not repeatable", async () => {
    const { token: cashierToken } = await loginAs("cashier");
    const { token: adminToken } = await loginAs("admin");
    const product = await createProduct({ stock: 10 });
    const order = await placeOrder(cashierToken, product._id.toString(), 3);

    const forbidden = await request(app)
      .patch(`/api/orders/${order._id}/void`)
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(forbidden.status).toBe(403);

    const res = await request(app)
      .patch(`/api/orders/${order._id}/void`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("voided");

    const restocked = await Product.findById(product._id);
    expect(restocked!.stock).toBe(10); // 10 - 3 + 3 restored

    const secondVoid = await request(app)
      .patch(`/api/orders/${order._id}/void`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(secondVoid.status).toBe(409);
  });

  it("voids an order that mixes tracked and untracked lines", async () => {
    const { token: cashierToken } = await loginAs("cashier");
    const { token: adminToken } = await loginAs("admin");
    const tracked = await createProduct({ name: "Coke", stock: 10 });
    const untracked = await Product.create({ name: "Rice", price: 20, stock: null });

    const order = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({
        items: [
          { productId: tracked._id.toString(), quantity: 3 },
          { productId: untracked._id.toString(), quantity: 2 },
        ],
      });
    expect(order.status).toBe(201);

    // The untracked line took nothing at sale time, so restoring it would be
    // an $inc against null — which aborts the transaction and strands the void.
    const res = await request(app)
      .patch(`/api/orders/${order.body._id}/void`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("voided");

    expect((await Product.findById(tracked._id))!.stock).toBe(10);
    expect((await Product.findById(untracked._id))!.stock).toBeNull();
  });

  it("voids an order whose product has since been switched to untracked", async () => {
    const { token: cashierToken } = await loginAs("cashier");
    const { token: adminToken } = await loginAs("admin");
    const product = await createProduct({ stock: 10 });
    const order = await placeOrder(cashierToken, product._id.toString(), 3);

    // Same rule as voiding a stock adjustment: there is no tally left to
    // reverse into, so the order voids and stock is left alone.
    await Product.updateOne({ _id: product._id }, { $set: { stock: null } });

    const res = await request(app)
      .patch(`/api/orders/${order._id}/void`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect((await Product.findById(product._id))!.stock).toBeNull();
  });
});

describe("GET /api/orders/summary", () => {
  // Written directly rather than placed through the API so createdAt can be
  // set: every figure here is period-scoped, and the 4am business-day
  // boundary only shows up with orders on both sides of it.
  async function orderAtTime(iso: string, total: number, extra: Record<string, unknown> = {}) {
    return Order.create({
      items: [{ product: new mongoose.Types.ObjectId(), name: "Adobo", price: total, portion: "full", quantity: 1, lineTotal: total }],
      total,
      createdAt: new Date(iso),
      ...extra,
    });
  }

  it("sums every matching order, not just the first page", async () => {
    const { token } = await loginAs("admin");
    // Past the 1000-row page cap the dashboard used to sum in the browser.
    const docs = Array.from({ length: 1200 }, (_, i) => ({
      items: [{ product: new mongoose.Types.ObjectId(), name: "Adobo", price: 10, portion: "full", quantity: 1, lineTotal: 10 }],
      total: 10,
      createdAt: new Date(`2026-08-${String((i % 20) + 1).padStart(2, "0")}T06:00:00Z`),
    }));
    await Order.insertMany(docs);

    const res = await request(app)
      .get("/api/orders/summary")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.current.orderCount).toBe(1200);
    expect(res.body.current.revenue).toBe(12000);
  });

  it("excludes voided and staff meal orders from every figure", async () => {
    const { token } = await loginAs("admin");
    await orderAtTime("2026-08-10T06:00:00Z", 100);
    await orderAtTime("2026-08-10T07:00:00Z", 500, { status: "voided" });
    await orderAtTime("2026-08-10T08:00:00Z", 700, { orderType: "staff_meal" });

    const res = await request(app)
      .get("/api/orders/summary")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.current.revenue).toBe(100);
    expect(res.body.current.orderCount).toBe(1);
    expect(res.body.current.itemsSold).toBe(1);
  });

  it("scopes to the requested range and reports the previous one alongside", async () => {
    const { token } = await loginAs("admin");
    await orderAtTime("2026-07-15T06:00:00Z", 300); // previous month
    await orderAtTime("2026-08-15T06:00:00Z", 100); // current month

    const res = await request(app)
      .get("/api/orders/summary")
      .query({
        from: "2026-08-01T00:00:00Z", to: "2026-08-31T23:59:59Z",
        prevFrom: "2026-07-01T00:00:00Z", prevTo: "2026-07-31T23:59:59Z",
      })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.current.revenue).toBe(100);
    expect(res.body.previous.revenue).toBe(300);
  });

  it("buckets an after-midnight order into the previous business day", async () => {
    const { token } = await loginAs("admin");
    // 00:46 Manila on the 16th — rung up after closing, so it belongs to the
    // 15th, matching the 4am cutoff the date helpers use.
    await orderAtTime("2026-08-15T16:46:00Z", 240);
    await orderAtTime("2026-08-15T10:00:00Z", 60); // 18:00 on the 15th

    const res = await request(app)
      .get("/api/orders/summary")
      .query({ bucket: "day", timezone: "Asia/Manila" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const aug15 = res.body.series.find((b: { key: string }) => b.key === "2026-08-15");
    expect(aug15?.value).toBe(300);
    expect(res.body.series.find((b: { key: string }) => b.key === "2026-08-16")).toBeUndefined();
  });

  it("reports item cost so a half serving never borrows the full portion's", async () => {
    const { token } = await loginAs("admin");
    await Order.create({
      items: [
        { product: new mongoose.Types.ObjectId(), name: "Adobo", price: 60, costPrice: 30, portion: "full", quantity: 2, lineTotal: 120 },
        // No snapshot: the client may only fall back to the catalog for a full
        // serving, so the row has to say how much went uncosted.
        { product: new mongoose.Types.ObjectId(), name: "Adobo", price: 35, costPrice: null, portion: "half", quantity: 1, lineTotal: 35 },
      ],
      total: 155,
      createdAt: new Date("2026-08-10T06:00:00Z"),
    });

    const res = await request(app)
      .get("/api/orders/summary")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const full = res.body.current.items.find((i: { portion: string }) => i.portion === "full");
    const half = res.body.current.items.find((i: { portion: string }) => i.portion === "half");
    expect(full).toMatchObject({ name: "Adobo", qty: 2, revenue: 120, costedQty: 2, costedRevenue: 120, costSum: 60 });
    expect(half).toMatchObject({ name: "Adobo", qty: 1, revenue: 35, costedQty: 0, costedRevenue: 0, costSum: 0 });
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/orders/summary");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/orders ?status", () => {
  async function seed() {
    const line = (total: number) => [
      { product: new mongoose.Types.ObjectId(), name: "Adobo", price: total, portion: "full" as const, quantity: 1, lineTotal: total },
    ];
    await Order.create({ items: line(100), total: 100, status: "completed" });
    await Order.create({ items: line(200), total: 200, status: "voided" });
    // Written before the status field existed — still a completed sale.
    await Order.collection.insertOne({
      items: line(300), total: 300, orderType: "sale", createdAt: new Date(), updatedAt: new Date(),
    });
  }

  it("lists both when no status is given", async () => {
    const { token } = await loginAs("cashier");
    await seed();

    const res = await request(app).get("/api/orders").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
  });

  it("lists only voided orders", async () => {
    const { token } = await loginAs("cashier");
    await seed();

    const res = await request(app)
      .get("/api/orders")
      .query({ status: "voided" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].total).toBe(200);
  });

  it("counts a statusless legacy order as completed", async () => {
    const { token } = await loginAs("cashier");
    await seed();

    const res = await request(app)
      .get("/api/orders")
      .query({ status: "completed" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.data.map((o: { total: number }) => o.total).sort()).toEqual([100, 300]);
  });

  it("rejects a status it doesn't recognise", async () => {
    const { token } = await loginAs("cashier");

    const res = await request(app)
      .get("/api/orders")
      .query({ status: "cancelled" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

describe("GET /api/orders", () => {
  it("paginates and reports totals", async () => {
    const { token } = await loginAs("cashier");
    const product = await createProduct({ stock: 100 });
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${token}`)
        .send({ items: [{ productId: product._id.toString(), quantity: 1 }] });
    }

    const res = await request(app)
      .get("/api/orders?page=1&limit=2")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(5);
    expect(res.body.totalPages).toBe(3);
  });

  it("excludes voided orders from the payment-type total but still lists them", async () => {
    const { token: cashierToken } = await loginAs("cashier");
    const { token: adminToken } = await loginAs("admin");
    const product = await createProduct({ price: 100, stock: 10 });

    const place = () =>
      request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({ items: [{ productId: product._id.toString(), quantity: 1 }] });

    await place();
    const toVoid = await place();
    await request(app)
      .patch(`/api/orders/${toVoid.body._id}/void`)
      .set("Authorization", `Bearer ${adminToken}`);

    const res = await request(app)
      .get("/api/orders?paymentType=cash")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.totalAmount).toBe(100); // the voided ₱100 order is not counted
    expect(res.body.data).toHaveLength(2);  // but it remains in the historical list
  });

  it("filters by search query across cashier name and item names", async () => {
    const { token } = await loginAs("cashier");
    const adobo = await createProduct({ name: "Adobo", stock: 10 });
    const sinigang = await createProduct({ name: "Sinigang", stock: 10 });
    await request(app).post("/api/orders").set("Authorization", `Bearer ${token}`).send({ items: [{ productId: adobo._id.toString(), quantity: 1 }] });
    await request(app).post("/api/orders").set("Authorization", `Bearer ${token}`).send({ items: [{ productId: sinigang._id.toString(), quantity: 1 }] });

    const res = await request(app)
      .get("/api/orders?q=sinigang")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].items[0].name).toBe("Sinigang");
  });
});

describe("GET /api/orders/peak-hours", () => {
  // timestamps sets createdAt on insert and marks it immutable, so the
  // backdating has to go through the driver rather than the model.
  async function orderAt(
    iso: string,
    overrides: Partial<{ status: "completed" | "voided"; orderType: "sale" | "staff_meal" }> = {}
  ) {
    const order = await Order.create({
      items: [{ product: new mongoose.Types.ObjectId(), name: "Adobo", price: 100, quantity: 1, lineTotal: 100 }],
      total: 100,
      status: overrides.status ?? "completed",
      orderType: overrides.orderType ?? "sale",
    });
    await Order.collection.updateOne({ _id: order._id }, { $set: { createdAt: new Date(iso) } });
  }

  it("requires authentication", async () => {
    const res = await request(app).get("/api/orders/peak-hours");
    expect(res.status).toBe(401);
  });

  it("buckets orders into 24 hours using the requested timezone", async () => {
    const { token } = await loginAs("cashier");
    // Asia/Manila is UTC+8, so 01:00 UTC lands in the 09:00 bucket.
    await orderAt("2026-08-15T01:00:00Z");
    await orderAt("2026-08-16T01:30:00Z");
    await orderAt("2026-08-15T05:00:00Z");

    const res = await request(app)
      .get("/api/orders/peak-hours?timezone=Asia/Manila")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.hours).toHaveLength(24);
    expect(res.body.hours[9]).toBe(2);
    expect(res.body.hours[13]).toBe(1);
    expect(res.body.hours[0]).toBe(0);
  });

  it("ignores voided and staff meal orders", async () => {
    const { token } = await loginAs("cashier");
    await orderAt("2026-08-15T01:00:00Z");
    await orderAt("2026-08-15T01:00:00Z", { status: "voided" });
    await orderAt("2026-08-15T01:00:00Z", { orderType: "staff_meal" });

    const res = await request(app)
      .get("/api/orders/peak-hours?timezone=Asia/Manila")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.hours[9]).toBe(1);
  });

  it("rejects an invalid timezone", async () => {
    const { token } = await loginAs("cashier");
    const res = await request(app)
      .get("/api/orders/peak-hours?timezone=Not/AZone")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});
