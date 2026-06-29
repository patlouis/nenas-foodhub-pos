import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../test/db.js";
import { loginAs, createUser } from "../test/helpers.js";

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

describe("GET /api/users", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(401);
  });

  it("returns user list for any authenticated user", async () => {
    const { token } = await loginAs("cashier");
    await createUser({ role: "admin" });

    const res = await request(app).get("/api/users").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it("does not expose passwordHash", async () => {
    const { token } = await loginAs("cashier");
    const res = await request(app).get("/api/users").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    for (const u of res.body) {
      expect(u.passwordHash).toBeUndefined();
    }
  });
});

describe("POST /api/users", () => {
  it("requires admin role", async () => {
    const { token } = await loginAs("cashier");
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New User", email: "new@example.com", password: "pass1234", role: "cashier" });
    expect(res.status).toBe(403);
  });

  it("creates a user", async () => {
    const { token } = await loginAs("admin");
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Jane", email: "jane@example.com", password: "secret123", role: "cashier" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Jane");
    expect(res.body.email).toBe("jane@example.com");
    expect(res.body.role).toBe("cashier");
    expect(res.body.passwordHash).toBeUndefined();
  });

  it("rejects duplicate email", async () => {
    const { token } = await loginAs("admin");
    await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "First", email: "dup@example.com", password: "pass1234", role: "cashier" });

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Second", email: "dup@example.com", password: "pass1234", role: "cashier" });

    expect(res.status).toBe(409);
  });
});

describe("PUT /api/users/:id", () => {
  it("requires admin role", async () => {
    const { token } = await loginAs("cashier");
    const { user } = await createUser();
    const res = await request(app)
      .put(`/api/users/${user._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Renamed" });
    expect(res.status).toBe(403);
  });

  it("updates user name", async () => {
    const { token } = await loginAs("admin");
    const { user } = await createUser({ name: "Old Name" });

    const res = await request(app)
      .put(`/api/users/${user._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Name" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New Name");
  });

  it("returns 404 for unknown user", async () => {
    const { token } = await loginAs("admin");
    const res = await request(app)
      .put("/api/users/000000000000000000000001")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Ghost" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/users/:id", () => {
  it("requires admin role", async () => {
    const { token } = await loginAs("cashier");
    const { user } = await createUser();
    const res = await request(app)
      .delete(`/api/users/${user._id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("deletes a user", async () => {
    const { token } = await loginAs("admin");
    const { user } = await createUser();

    const res = await request(app)
      .delete(`/api/users/${user._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 404 for unknown user", async () => {
    const { token } = await loginAs("admin");
    const res = await request(app)
      .delete("/api/users/000000000000000000000001")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
