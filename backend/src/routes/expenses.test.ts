import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../test/db.js";
import { loginAs } from "../test/helpers.js";
import Expense from "../models/Expense.js";

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

describe("POST /api/expenses", () => {
  it("requires authentication", async () => {
    const res = await request(app).post("/api/expenses").send({ amount: 100, category: "utilities" });
    expect(res.status).toBe(401);
  });

  it("requires admin role", async () => {
    const { token } = await loginAs("cashier");
    const res = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 100, category: "utilities" });
    expect(res.status).toBe(403);
  });

  it("creates an expense with required fields", async () => {
    const { token } = await loginAs("admin");
    const res = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 500, category: "utilities", description: "Monthly bill" });

    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(500);
    expect(res.body.category).toBe("utilities");
    expect(res.body.voided).toBe(false);
    expect(res.body.loggedByName).toBeTruthy();
    expect(res.body.date).toBeTruthy();
  });

  it("rejects missing description", async () => {
    const { token } = await loginAs("admin");
    const res = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 500, category: "utilities" });
    expect(res.status).toBe(400);
  });

  it("creates an expense with description and backdated date", async () => {
    const { token } = await loginAs("admin");
    const res = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 1200, category: "utilities", description: "Electricity bill", date: "2026-01-15" });

    expect(res.status).toBe(201);
    expect(res.body.description).toBe("Electricity bill");
    expect(new Date(res.body.date).toISOString().startsWith("2026-01-15")).toBe(true);
  });

  it("rejects amount <= 0", async () => {
    const { token } = await loginAs("admin");
    const res = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 0, category: "utilities" });
    expect(res.status).toBe(400);
  });

  it("rejects invalid category", async () => {
    const { token } = await loginAs("admin");
    const res = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 100, category: "mortgage" });
    expect(res.status).toBe(400);
  });

  it("creates an expense with qty", async () => {
    const { token } = await loginAs("admin");
    const res = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 500, category: "supplies", description: "Rice sacks", qty: 3 });

    expect(res.status).toBe(201);
    expect(res.body.qty).toBe(3);
  });

  it("creates an expense with fractional qty", async () => {
    const { token } = await loginAs("admin");
    const res = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 200, category: "supplies", description: "Cooking oil", qty: 1.5 });

    expect(res.status).toBe(201);
    expect(res.body.qty).toBe(1.5);
  });

  it("rejects qty less than 0.01", async () => {
    const { token } = await loginAs("admin");
    const res = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 500, category: "supplies", qty: 0 });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/expenses", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/expenses");
    expect(res.status).toBe(401);
  });

  it("requires admin role", async () => {
    const { token } = await loginAs("cashier");
    const res = await request(app).get("/api/expenses").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("returns paginated expenses with totalAmount", async () => {
    const { token, user } = await loginAs("admin");
    await Expense.create([
      { amount: 100, category: "utilities", date: new Date(), loggedBy: user._id, loggedByName: user.name, voided: false },
      { amount: 200, category: "supplies",  date: new Date(), loggedBy: user._id, loggedByName: user.name, voided: false },
    ]);

    const res = await request(app).get("/api/expenses").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.totalAmount).toBe(300);
    expect(res.body.total).toBe(2);
  });

  it("excludes voided expenses from totalAmount", async () => {
    const { token, user } = await loginAs("admin");
    await Expense.create([
      { amount: 100, category: "utilities",     date: new Date(), loggedBy: user._id, loggedByName: user.name, voided: false },
      { amount: 50,  category: "supplies", date: new Date(), loggedBy: user._id, loggedByName: user.name, voided: true  },
    ]);

    const res = await request(app).get("/api/expenses").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.totalAmount).toBe(100);
  });

  it("filters by category", async () => {
    const { token, user } = await loginAs("admin");
    await Expense.create([
      { amount: 100, category: "utilities", date: new Date(), loggedBy: user._id, loggedByName: user.name, voided: false },
      { amount: 200, category: "supplies",  date: new Date(), loggedBy: user._id, loggedByName: user.name, voided: false },
    ]);

    const res = await request(app).get("/api/expenses?category=utilities").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].category).toBe("utilities");
  });

  it("filters by date range using the date field", async () => {
    const { token, user } = await loginAs("admin");
    await Expense.create([
      { amount: 100, category: "utilities", date: new Date("2026-01-10T12:00:00Z"), loggedBy: user._id, loggedByName: user.name, voided: false },
      { amount: 200, category: "utilities", date: new Date("2026-03-10T12:00:00Z"), loggedBy: user._id, loggedByName: user.name, voided: false },
    ]);

    const res = await request(app)
      .get("/api/expenses?from=2026-01-01&to=2026-01-31")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].amount).toBe(100);
  });

  it("searches by description", async () => {
    const { token, user } = await loginAs("admin");
    await Expense.create([
      { amount: 100, category: "utilities",      description: "June rent",    date: new Date(), loggedBy: user._id, loggedByName: user.name, voided: false },
      { amount: 200, category: "utilities", description: "Meralco bill", date: new Date(), loggedBy: user._id, loggedByName: user.name, voided: false },
    ]);

    const res = await request(app).get("/api/expenses?q=meralco").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].description).toBe("Meralco bill");
  });
});

describe("PATCH /api/expenses/:id/void", () => {
  it("requires authentication", async () => {
    const res = await request(app).patch("/api/expenses/000000000000000000000001/void");
    expect(res.status).toBe(401);
  });

  it("requires admin role", async () => {
    const { token } = await loginAs("cashier");
    const res = await request(app)
      .patch("/api/expenses/000000000000000000000001/void")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("voids an expense and records who voided it", async () => {
    const { token, user } = await loginAs("admin");
    const expense = await Expense.create({
      amount: 100, category: "utilities", date: new Date(),
      loggedBy: user._id, loggedByName: user.name, voided: false,
    });

    const res = await request(app)
      .patch(`/api/expenses/${expense._id}/void`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.voided).toBe(true);
    expect(res.body.voidedByName).toBeTruthy();
    expect(res.body.voidedAt).toBeTruthy();
  });

  it("returns 409 when already voided", async () => {
    const { token, user } = await loginAs("admin");
    const expense = await Expense.create({
      amount: 100, category: "utilities", date: new Date(),
      loggedBy: user._id, loggedByName: user.name, voided: true,
    });

    const res = await request(app)
      .patch(`/api/expenses/${expense._id}/void`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(409);
  });

  it("returns 404 for a non-existent id", async () => {
    const { token } = await loginAs("admin");
    const res = await request(app)
      .patch("/api/expenses/000000000000000000000001/void")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("returns 400 for an invalid id format", async () => {
    const { token } = await loginAs("admin");
    const res = await request(app)
      .patch("/api/expenses/not-an-id/void")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
