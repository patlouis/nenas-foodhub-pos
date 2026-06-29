import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../test/db.js";
import { loginAs } from "../test/helpers.js";
import StockAdjustment from "../models/StockAdjustment.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

async function makeProduct() {
  const cat = await Category.create({ name: "Test Cat" });
  return Product.create({
    name: "Test Product",
    price: 100,
    costPrice: 40,
    stock: 20,
    category: cat._id,
    status: "active",
    sku: `SKU-${Date.now()}`,
  });
}

describe("GET /api/stock-adjustments", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/stock-adjustments");
    expect(res.status).toBe(401);
  });

  it("requires admin role", async () => {
    const { token } = await loginAs("cashier");
    const res = await request(app).get("/api/stock-adjustments").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("returns paginated adjustments with totalCost", async () => {
    const { token, user } = await loginAs("admin");
    const product = await makeProduct();
    await StockAdjustment.create([
      { product: product._id, productName: product.name, type: "wastage", quantity: 2, costPrice: 40, adjustedBy: user._id, adjustedByName: user.name, voided: false },
      { product: product._id, productName: product.name, type: "receiving", quantity: 5, costPrice: 40, adjustedBy: user._id, adjustedByName: user.name, voided: false },
    ]);

    const res = await request(app).get("/api/stock-adjustments").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.totalCost).toBe(80); // only wastage: 2 × 40
  });

  it("filters by type", async () => {
    const { token, user } = await loginAs("admin");
    const product = await makeProduct();
    await StockAdjustment.create([
      { product: product._id, productName: product.name, type: "wastage",   quantity: 1, costPrice: 40, adjustedBy: user._id, adjustedByName: user.name, voided: false },
      { product: product._id, productName: product.name, type: "receiving", quantity: 3, costPrice: 40, adjustedBy: user._id, adjustedByName: user.name, voided: false },
    ]);

    const res = await request(app).get("/api/stock-adjustments?type=wastage").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].type).toBe("wastage");
  });

  it("searches by product name", async () => {
    const { token, user } = await loginAs("admin");
    const product = await makeProduct();
    await StockAdjustment.create([
      { product: product._id, productName: "Fried Rice", type: "wastage", quantity: 1, costPrice: 30, adjustedBy: user._id, adjustedByName: user.name, voided: false },
      { product: product._id, productName: "Chicken Adobo", type: "wastage", quantity: 1, costPrice: 50, adjustedBy: user._id, adjustedByName: user.name, voided: false },
    ]);

    const res = await request(app).get("/api/stock-adjustments?q=fried").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].productName).toBe("Fried Rice");
  });
});

describe("PATCH /api/stock-adjustments/:id/void", () => {
  it("requires authentication", async () => {
    const res = await request(app).patch("/api/stock-adjustments/000000000000000000000001/void");
    expect(res.status).toBe(401);
  });

  it("requires admin role", async () => {
    const { token } = await loginAs("cashier");
    const res = await request(app)
      .patch("/api/stock-adjustments/000000000000000000000001/void")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("voids a wastage and restores stock", async () => {
    const { token, user } = await loginAs("admin");
    const product = await makeProduct();
    const adj = await StockAdjustment.create({
      product: product._id, productName: product.name,
      type: "wastage", quantity: 3, costPrice: 40,
      adjustedBy: user._id, adjustedByName: user.name, voided: false,
    });
    await Product.updateOne({ _id: product._id }, { $inc: { stock: -3 } });

    const res = await request(app)
      .patch(`/api/stock-adjustments/${adj._id}/void`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.voided).toBe(true);
    const updated = await Product.findById(product._id);
    expect(updated!.stock).toBe(20); // restored
  });

  it("rejects voiding a receiving", async () => {
    const { token, user } = await loginAs("admin");
    const product = await makeProduct();
    const adj = await StockAdjustment.create({
      product: product._id, productName: product.name,
      type: "receiving", quantity: 5, costPrice: 40,
      adjustedBy: user._id, adjustedByName: user.name, voided: false,
    });

    const res = await request(app)
      .patch(`/api/stock-adjustments/${adj._id}/void`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/cannot be voided/i);
  });

  it("returns 409 when already voided", async () => {
    const { token, user } = await loginAs("admin");
    const product = await makeProduct();
    const adj = await StockAdjustment.create({
      product: product._id, productName: product.name,
      type: "wastage", quantity: 1, costPrice: 40,
      adjustedBy: user._id, adjustedByName: user.name, voided: true,
    });

    const res = await request(app)
      .patch(`/api/stock-adjustments/${adj._id}/void`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(409);
  });

  it("returns 400 for invalid id", async () => {
    const { token } = await loginAs("admin");
    const res = await request(app)
      .patch("/api/stock-adjustments/not-an-id/void")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
