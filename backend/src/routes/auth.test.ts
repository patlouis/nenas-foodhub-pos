import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../test/db.js";
import { createUser } from "../test/helpers.js";

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

describe("POST /api/auth/login", () => {
  it("returns a token and the user (without passwordHash) for valid credentials", async () => {
    const { user, password } = await createUser({ email: "alice@example.com", password: "secret123" });

    const res = await request(app).post("/api/auth/login").send({ email: user.email, password });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.user.email).toBe("alice@example.com");
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("rejects an unknown email", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "whatever" });
    expect(res.status).toBe(401);
  });

  it("rejects a wrong password", async () => {
    const { user } = await createUser({ email: "bob@example.com", password: "secret123" });
    const res = await request(app).post("/api/auth/login").send({ email: user.email, password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("rejects a missing password via schema validation", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "x@example.com" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });
});
