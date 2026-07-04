import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../test/db.js";
import { loginAs } from "../test/helpers.js";
import Supply from "../models/Supply.js";
import SupplyAdjustment from "../models/SupplyAdjustment.js";
import Expense from "../models/Expense.js";

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

describe("POST /api/supplies", () => {
  it("requires authentication", async () => {
    const res = await request(app).post("/api/supplies").send({ name: "Cooking oil", unit: "liter" });
    expect(res.status).toBe(401);
  });

  it("requires admin role", async () => {
    const { token } = await loginAs("cashier");
    const res = await request(app)
      .post("/api/supplies")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Cooking oil", unit: "liter" });
    expect(res.status).toBe(403);
  });

  it("creates a supply with no initial quantity", async () => {
    const { token } = await loginAs("admin");
    const res = await request(app)
      .post("/api/supplies")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Cooking oil", unit: "liter" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Cooking oil");
    expect(res.body.quantity).toBe(0);
    expect(res.body.status).toBe("active");

    const adjCount = await SupplyAdjustment.countDocuments();
    expect(adjCount).toBe(0);
  });

  it("creates a supply with initial quantity and logs a restock + linked expense", async () => {
    const { token } = await loginAs("admin");
    const res = await request(app)
      .post("/api/supplies")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "LPG gas", unit: "tank", quantity: 2, unitCost: 900 });

    expect(res.status).toBe(201);
    expect(res.body.quantity).toBe(2);
    expect(res.body.unitCost).toBe(900);

    const adjustments = await SupplyAdjustment.find();
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0].type).toBe("restock");
    expect(adjustments[0].quantity).toBe(2);

    const expenses = await Expense.find();
    expect(expenses).toHaveLength(1);
    expect(expenses[0].category).toBe("supplies");
    expect(expenses[0].amount).toBe(1800);
    expect(adjustments[0].expense?.toString()).toBe(expenses[0]._id.toString());
  });

  it("rejects an initial quantity without a unit cost", async () => {
    const { token } = await loginAs("admin");
    const res = await request(app)
      .post("/api/supplies")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Cooking oil", unit: "liter", quantity: 5 });
    expect(res.status).toBe(400);
  });

  it("rejects a missing unit", async () => {
    const { token } = await loginAs("admin");
    const res = await request(app)
      .post("/api/supplies")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Cooking oil" });
    expect(res.status).toBe(400);
  });

  it("rejects a duplicate name, case-insensitively", async () => {
    const { token } = await loginAs("admin");
    await Supply.create({ name: "Cooking oil", unit: "liter" });

    const res = await request(app)
      .post("/api/supplies")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "COOKING OIL", unit: "liter" });

    expect(res.status).toBe(409);
  });
});

describe("GET /api/supplies", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/supplies");
    expect(res.status).toBe(401);
  });

  it("requires admin role", async () => {
    const { token } = await loginAs("cashier");
    const res = await request(app).get("/api/supplies").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("returns paginated supplies and searches by name", async () => {
    const { token } = await loginAs("admin");
    await Supply.create([
      { name: "Cooking oil", unit: "liter", quantity: 10 },
      { name: "LPG gas", unit: "tank", quantity: 3 },
    ]);

    const res = await request(app).get("/api/supplies?q=oil").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("Cooking oil");
  });
});

describe("PUT /api/supplies/:id", () => {
  it("edits name/unit/lowStockAt/status but not quantity", async () => {
    const { token } = await loginAs("admin");
    const supply = await Supply.create({ name: "Cooking oil", unit: "liter", quantity: 10, unitCost: 80 });

    const res = await request(app)
      .put(`/api/supplies/${supply._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Cooking oil (Palm)", lowStockAt: 2, status: "archived" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Cooking oil (Palm)");
    expect(res.body.lowStockAt).toBe(2);
    expect(res.body.status).toBe("archived");
    expect(res.body.quantity).toBe(10);
  });
});

describe("PATCH /api/supplies/:id/restock", () => {
  it("requires admin role", async () => {
    const { token } = await loginAs("cashier");
    const supply = await Supply.create({ name: "Cooking oil", unit: "liter", quantity: 5 });
    const res = await request(app)
      .patch(`/api/supplies/${supply._id}/restock`)
      .set("Authorization", `Bearer ${token}`)
      .send({ quantity: 5, unitCost: 80 });
    expect(res.status).toBe(403);
  });

  it("increments quantity, updates unit cost, and creates a linked expense", async () => {
    const { token, user } = await loginAs("admin");
    const supply = await Supply.create({ name: "Cooking oil", unit: "liter", quantity: 5, unitCost: 75 });

    const res = await request(app)
      .patch(`/api/supplies/${supply._id}/restock`)
      .set("Authorization", `Bearer ${token}`)
      .send({ quantity: 10, unitCost: 80 });

    expect(res.status).toBe(201);
    expect(res.body.supply.quantity).toBe(15);
    expect(res.body.supply.unitCost).toBe(80);
    expect(res.body.adjustment.type).toBe("restock");

    const expense = await Expense.findById(res.body.adjustment.expense);
    expect(expense).not.toBeNull();
    expect(expense!.amount).toBe(800);
    expect(expense!.category).toBe("supplies");
    expect(expense!.loggedBy.toString()).toBe(user._id.toString());
  });

  it("returns 404 for a non-existent supply", async () => {
    const { token } = await loginAs("admin");
    const res = await request(app)
      .patch("/api/supplies/000000000000000000000001/restock")
      .set("Authorization", `Bearer ${token}`)
      .send({ quantity: 1, unitCost: 1 });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/supplies/:id/consume", () => {
  it("decrements quantity and records the adjustment", async () => {
    const { token } = await loginAs("admin");
    const supply = await Supply.create({ name: "Cooking oil", unit: "liter", quantity: 10 });

    const res = await request(app)
      .post(`/api/supplies/${supply._id}/consume`)
      .set("Authorization", `Bearer ${token}`)
      .send({ quantity: 3, reason: "Used for frying" });

    expect(res.status).toBe(201);
    expect(res.body.supply.quantity).toBe(7);
    expect(res.body.adjustment.type).toBe("consume");
    expect(res.body.adjustment.reason).toBe("Used for frying");

    // Consuming never creates an expense.
    const expenseCount = await Expense.countDocuments();
    expect(expenseCount).toBe(0);
  });

  it("rejects consuming more than is on hand", async () => {
    const { token } = await loginAs("admin");
    const supply = await Supply.create({ name: "Cooking oil", unit: "liter", quantity: 2 });

    const res = await request(app)
      .post(`/api/supplies/${supply._id}/consume`)
      .set("Authorization", `Bearer ${token}`)
      .send({ quantity: 5 });

    expect(res.status).toBe(409);
  });

  it("allows fractional quantities", async () => {
    const { token } = await loginAs("admin");
    const supply = await Supply.create({ name: "Cooking oil", unit: "liter", quantity: 10 });

    const res = await request(app)
      .post(`/api/supplies/${supply._id}/consume`)
      .set("Authorization", `Bearer ${token}`)
      .send({ quantity: 1.5 });

    expect(res.status).toBe(201);
    expect(res.body.supply.quantity).toBe(8.5);
  });
});
