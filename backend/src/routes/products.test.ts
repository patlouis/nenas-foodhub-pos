import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import Category from "../models/Category.js";
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

  it("filters by category ObjectId", async () => {
    const { token } = await loginAs("cashier");
    const drinks = await Category.create({ name: "Drinks", color: "#00f" });
    const mains  = await Category.create({ name: "Main",   color: "#f00" });
    await Product.create({ name: "Coke",  price: 30, stock: 5, category: drinks._id });
    await Product.create({ name: "Adobo", price: 90, stock: 5, category: mains._id });

    const res = await request(app)
      .get(`/api/products?category=${drinks._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("Coke");
  });

  it("rejects a category filter that is not a valid ObjectId", async () => {
    const { token } = await loginAs("cashier");

    const res = await request(app)
      .get("/api/products?category=not-an-id")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
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

describe("GET /api/products — category sort uses category order", () => {
  it("sorts products by their category drag-order then by name", async () => {
    const { token } = await loginAs("cashier");
    const bev = await Category.create({ name: "Beverages", color: "#00f", order: 1 });
    const snk = await Category.create({ name: "Snacks",    color: "#f00", order: 0 });
    await Product.create({ name: "Cola",  price: 50, category: bev._id });
    await Product.create({ name: "Chips", price: 30, category: snk._id });

    const res = await request(app)
      .get("/api/products?sortKey=category&sortDir=asc")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].name).toBe("Chips");
    expect(res.body.data[1].name).toBe("Cola");
  });
});

describe("POST /api/products — category field", () => {
  it("accepts a valid ObjectId as category", async () => {
    const { token } = await loginAs("admin");
    const cat = await Category.create({ name: "Beverages", color: "#0000ff" });

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Cola", price: 50, category: cat._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.category).toBe(cat._id.toString());
  });

  it("rejects a category value that is not a valid ObjectId", async () => {
    const { token } = await loginAs("admin");

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Cola", price: 50, category: "Beverages" });

    expect(res.status).toBe(400);
  });
});
