import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import Category from "../models/Category.js";
import Product from "../models/Product.js";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../test/db.js";
import { loginAs } from "../test/helpers.js";

beforeAll(connectTestDB);
afterAll(disconnectTestDB);
afterEach(clearTestDB);

describe("GET /api/categories — productCount via ObjectId", () => {
  it("counts products whose category ObjectId matches the category _id", async () => {
    const { token } = await loginAs("cashier");
    const cat = await Category.create({ name: "Snacks", color: "#ff0000" });
    await Product.create({ name: "Chips", price: 30, category: cat._id });
    await Product.create({ name: "Nuts",  price: 45, category: cat._id });

    const res = await request(app)
      .get("/api/categories")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const found = res.body.find((c: { name: string }) => c.name === "Snacks");
    expect(found?.productCount).toBe(2);
  });

  it("shows 0 productCount for a category with no products", async () => {
    const { token } = await loginAs("cashier");
    await Category.create({ name: "Empty", color: "#aaaaaa" });

    const res = await request(app)
      .get("/api/categories")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const found = res.body.find((c: { name: string }) => c.name === "Empty");
    expect(found?.productCount).toBe(0);
  });
});

describe("PUT /api/categories/:id — rename does not need cascade", () => {
  it("renaming a category leaves products correctly linked by ObjectId", async () => {
    const { token } = await loginAs("admin");
    const cat = await Category.create({ name: "Drinks", color: "#00f" });
    await Product.create({ name: "Cola", price: 50, category: cat._id });

    await request(app)
      .put(`/api/categories/${cat._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Beverages" });

    // Product still links to the same category ObjectId — no update needed
    const product = await Product.findOne({ name: "Cola" });
    expect(product?.category?.toString()).toBe(cat._id.toString());
  });
});
