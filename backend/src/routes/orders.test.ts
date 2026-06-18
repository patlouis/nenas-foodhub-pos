import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../test/db.js";
import { loginAs } from "../test/helpers.js";
import Product from "../models/Product.js";

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

  it("rejects a malformed item via schema validation", async () => {
    const { token } = await loginAs("cashier");
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ productId: "not-an-id", quantity: 1 }] });
    expect(res.status).toBe(400);
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
