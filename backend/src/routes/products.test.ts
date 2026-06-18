import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../test/db.js";
import { loginAs } from "../test/helpers.js";
import Product from "../models/Product.js";

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

describe("GET /api/products", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(401);
  });

  it("paginates results and reports totals", async () => {
    const { token } = await loginAs("cashier");
    for (let i = 0; i < 3; i++) {
      await Product.create({ name: `Product ${i}`, price: 10, stock: 5 });
    }

    const res = await request(app)
      .get("/api/products?page=1&limit=2")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(3);
    expect(res.body.totalPages).toBe(2);
  });

  it("filters by category", async () => {
    const { token } = await loginAs("cashier");
    await Product.create({ name: "Coke", price: 30, stock: 5, category: "Drinks" });
    await Product.create({ name: "Adobo", price: 90, stock: 5, category: "Main" });

    const res = await request(app)
      .get("/api/products?category=Drinks")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("Coke");
  });
});

describe("POST /api/products", () => {
  it("rejects non-admins", async () => {
    const { token } = await loginAs("cashier");
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Item", price: 50 });
    expect(res.status).toBe(403);
  });

  it("allows admins to create a product", async () => {
    const { token } = await loginAs("admin");
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Item", price: 50 });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("New Item");
  });

  it("rejects invalid input via schema validation", async () => {
    const { token } = await loginAs("admin");
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "", price: -5 });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/products/:id/stock", () => {
  it("rejects removing more stock than is available", async () => {
    const { token } = await loginAs("admin");
    const product = await Product.create({ name: "Rice", price: 40, stock: 2 });

    const res = await request(app)
      .patch(`/api/products/${product._id}/stock`)
      .set("Authorization", `Bearer ${token}`)
      .send({ delta: -5 });

    expect(res.status).toBe(409);
    const updated = await Product.findById(product._id);
    expect(updated!.stock).toBe(2);
  });
});
