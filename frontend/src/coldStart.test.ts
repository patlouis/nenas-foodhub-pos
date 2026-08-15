import { describe, it, expect } from "vitest"
import { couldBeColdStart, RENDER_IDLE_MS } from "./coldStart"

describe("couldBeColdStart", () => {
  const now = 1_700_000_000_000

  it("is true before anything has come back, since the server is unproven", () => {
    expect(couldBeColdStart(null, now)).toBe(true)
  })

  it("is false right after a response — a server that just answered is awake", () => {
    expect(couldBeColdStart(now - 2000, now)).toBe(false)
  })

  it("is false for a gap shorter than the idle window", () => {
    expect(couldBeColdStart(now - (RENDER_IDLE_MS - 1000), now)).toBe(false)
  })

  it("is false exactly at the idle window, before the host can have spun down", () => {
    expect(couldBeColdStart(now - RENDER_IDLE_MS, now)).toBe(false)
  })

  it("is true once the gap passes the idle window", () => {
    expect(couldBeColdStart(now - (RENDER_IDLE_MS + 1), now)).toBe(true)
  })
})
