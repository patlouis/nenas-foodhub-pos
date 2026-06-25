import bcrypt from "bcryptjs";
import request from "supertest";
import { app } from "../app.js";
import User from "../models/User.js";
export async function createUser(overrides = {}) {
    const password = overrides.password ?? "password123";
    const passwordHash = await bcrypt.hash(password, 4); // low cost factor — speed, not security, matters in tests
    const user = await User.create({
        name: overrides.name ?? "Test User",
        email: overrides.email ?? `user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash,
        role: overrides.role ?? "cashier",
    });
    return { user, password };
}
// Creates a user and logs in through the real /api/auth/login route, so
// tests exercise the actual token-issuing path rather than minting one by hand.
export async function loginAs(role = "cashier") {
    const { user, password } = await createUser({ role });
    const res = await request(app).post("/api/auth/login").send({ email: user.email, password });
    return { token: res.body.token, user };
}
