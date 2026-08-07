import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import { app } from "./app.js";

// Malformed JSON makes express.json() throw, which lands in the global error
// handler without needing a database connection.
function badJsonRequest() {
  return request(app)
    .post("/api/auth/login")
    .set("Content-Type", "application/json")
    .send('{"bad json');
}

describe("global error handler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the stack trace, not just the message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await badJsonRequest();

    expect(res.status).toBe(400);
    const logged = spy.mock.calls.flat().join("\n");
    expect(logged).toMatch(/\n\s+at /);
  });

  it("keeps the stack trace out of the JSON response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await badJsonRequest();

    expect(res.body.error).toBeTypeOf("string");
    expect(res.body.error).not.toMatch(/\n\s+at /);
  });
});
