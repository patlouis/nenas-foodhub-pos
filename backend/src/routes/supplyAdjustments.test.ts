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

async function makeSupply(overrides: Partial<{ name: string; unit: string; quantity: number; unitCost: number }> = {}) {
  return Supply.create({
    name: overrides.name ?? "Cooking oil",
    unit: overrides.unit ?? "liter",
    quantity: overrides.quantity ?? 10,
    unitCost: overrides.unitCost ?? 80,
  });
}

describe("GET /api/supply-adjustments", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/supply-adjustments");
    expect(res.status).toBe(401);
  });

  it("requires admin role", async () => {
    const { token } = await loginAs("cashier");
    const res = await request(app).get("/api/supply-adjustments").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("returns paginated adjustments with totalCost from restocks only", async () => {
    const { token, user } = await loginAs("admin");
    const supply = await makeSupply();
    await SupplyAdjustment.create([
      { supply: supply._id, supplyName: supply.name, type: "restock", quantity: 5, unitCost: 80, adjustedBy: user._id, adjustedByName: user.name, voided: false },
      { supply: supply._id, supplyName: supply.name, type: "consume", quantity: 2, adjustedBy: user._id, adjustedByName: user.name, voided: false },
    ]);

    const res = await request(app).get("/api/supply-adjustments").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.totalCost).toBe(400); // only restock: 5 × 80
  });

  it("filters by type", async () => {
    const { token, user } = await loginAs("admin");
    const supply = await makeSupply();
    await SupplyAdjustment.create([
      { supply: supply._id, supplyName: supply.name, type: "restock", quantity: 5, unitCost: 80, adjustedBy: user._id, adjustedByName: user.name, voided: false },
      { supply: supply._id, supplyName: supply.name, type: "consume", quantity: 2, adjustedBy: user._id, adjustedByName: user.name, voided: false },
    ]);

    const res = await request(app).get("/api/supply-adjustments?type=consume").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].type).toBe("consume");
  });

  it("searches by supply name", async () => {
    const { token, user } = await loginAs("admin");
    const oil = await makeSupply({ name: "Cooking oil" });
    const gas = await makeSupply({ name: "LPG gas" });
    await SupplyAdjustment.create([
      { supply: oil._id, supplyName: oil.name, type: "consume", quantity: 1, adjustedBy: user._id, adjustedByName: user.name, voided: false },
      { supply: gas._id, supplyName: gas.name, type: "consume", quantity: 1, adjustedBy: user._id, adjustedByName: user.name, voided: false },
    ]);

    const res = await request(app).get("/api/supply-adjustments?q=gas").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].supplyName).toBe("LPG gas");
  });
});

describe("PATCH /api/supply-adjustments/:id/void", () => {
  it("requires authentication", async () => {
    const res = await request(app).patch("/api/supply-adjustments/000000000000000000000001/void");
    expect(res.status).toBe(401);
  });

  it("requires admin role", async () => {
    const { token } = await loginAs("cashier");
    const res = await request(app)
      .patch("/api/supply-adjustments/000000000000000000000001/void")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("voids a consume and restores quantity", async () => {
    const { token, user } = await loginAs("admin");
    const supply = await makeSupply({ quantity: 7 });
    const adj = await SupplyAdjustment.create({
      supply: supply._id, supplyName: supply.name,
      type: "consume", quantity: 3,
      adjustedBy: user._id, adjustedByName: user.name, voided: false,
    });

    const res = await request(app)
      .patch(`/api/supply-adjustments/${adj._id}/void`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.voided).toBe(true);
    const updated = await Supply.findById(supply._id);
    expect(updated!.quantity).toBe(10); // restored
  });

  it("voids a restock, decrements quantity, and voids the linked expense", async () => {
    const { token, user } = await loginAs("admin");
    const supply = await makeSupply({ quantity: 15 });
    const expense = await Expense.create({
      amount: 800, category: "supplies", description: "Cooking oil restock",
      qty: 10, date: new Date(), loggedBy: user._id, loggedByName: user.name,
    });
    const adj = await SupplyAdjustment.create({
      supply: supply._id, supplyName: supply.name,
      type: "restock", quantity: 10, unitCost: 80, expense: expense._id,
      adjustedBy: user._id, adjustedByName: user.name, voided: false,
    });

    const res = await request(app)
      .patch(`/api/supply-adjustments/${adj._id}/void`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.voided).toBe(true);
    const updatedSupply = await Supply.findById(supply._id);
    expect(updatedSupply!.quantity).toBe(5); // restored to pre-restock level

    const updatedExpense = await Expense.findById(expense._id);
    expect(updatedExpense!.voided).toBe(true);
  });

  it("returns 409 when voiding a restock would leave negative quantity", async () => {
    const { token, user } = await loginAs("admin");
    const supply = await makeSupply({ quantity: 2 });
    const adj = await SupplyAdjustment.create({
      supply: supply._id, supplyName: supply.name,
      type: "restock", quantity: 10, unitCost: 80,
      adjustedBy: user._id, adjustedByName: user.name, voided: false,
    });

    const res = await request(app)
      .patch(`/api/supply-adjustments/${adj._id}/void`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(409);
  });

  it("returns 409 when already voided", async () => {
    const { token, user } = await loginAs("admin");
    const supply = await makeSupply();
    const adj = await SupplyAdjustment.create({
      supply: supply._id, supplyName: supply.name,
      type: "consume", quantity: 1,
      adjustedBy: user._id, adjustedByName: user.name, voided: true,
    });

    const res = await request(app)
      .patch(`/api/supply-adjustments/${adj._id}/void`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(409);
  });

  it("returns 400 for invalid id", async () => {
    const { token } = await loginAs("admin");
    const res = await request(app)
      .patch("/api/supply-adjustments/not-an-id/void")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
