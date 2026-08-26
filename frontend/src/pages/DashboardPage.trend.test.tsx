// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

// Only the trend chart matters here, so every other fetch returns an empty
// shape just well-formed enough for the page to mount.
const summaryMock = vi.fn()

vi.mock("../api", () => ({
  ordersApi: {
    summary: (...args: unknown[]) => summaryMock(...args),
    list: vi.fn(async () => ({ data: [], page: 1, limit: 5, total: 0, totalPages: 1 })),
    peakHours: vi.fn(async () => ({ hours: new Array(24).fill(0) })),
  },
  productsApi: { list: vi.fn(async () => ({ data: [], page: 1, limit: 500, total: 0, totalPages: 1 })) },
  categoriesApi: { list: vi.fn(async () => []) },
  stockAdjustmentsApi: { list: vi.fn(async () => ({ data: [], page: 1, limit: 1000, total: 0, totalPages: 1 })) },
  expensesApi: { list: vi.fn(async () => ({ data: [], page: 1, limit: 1000, total: 0, totalPages: 1 })) },
  ApiError: class ApiError extends Error {},
}))

import DashboardPage from "./DashboardPage"

function summary(series: { key: string; value: number }[]) {
  const empty = { revenue: 0, orderCount: 0, itemsSold: 0, items: [] }
  return {
    current: { ...empty, revenue: series.reduce((s, b) => s + b.value, 0) },
    previous: empty,
    series,
  }
}

describe("DashboardPage revenue trend", () => {
  beforeEach(() => {
    // Hours of the business day: 6am through midnight, then the closing tail.
    summaryMock.mockResolvedValue(summary([{ key: "9", value: 1500 }, { key: "14", value: 320 }]))
  })
  afterEach(cleanup)

  it("reads out a bar's value when it is tapped", async () => {
    const user = userEvent.setup()
    render(<DashboardPage />)

    // Only the tallest bars print a value, and a tooltip needs a pointer that
    // a phone doesn't have — tapping has to be enough on its own.
    const bar = await screen.findByRole("button", { name: "2pm: ₱320.00" })
    expect(screen.queryByText(/2pm · ₱320\.00/)).toBeNull()

    await user.click(bar)
    expect(screen.getByText(/2pm · ₱320\.00/)).not.toBeNull()
  })

  it("clears the readout when the same bar is tapped again", async () => {
    const user = userEvent.setup()
    render(<DashboardPage />)

    const bar = await screen.findByRole("button", { name: "9am: ₱1,500.00" })
    await user.click(bar)
    expect(screen.getByText(/9am · ₱1,500\.00/)).not.toBeNull()

    await user.click(bar)
    expect(screen.queryByText(/9am · ₱1,500\.00/)).toBeNull()
  })

  it("marks the tapped bar as pressed so only one reads as chosen", async () => {
    const user = userEvent.setup()
    render(<DashboardPage />)

    const first = await screen.findByRole("button", { name: "9am: ₱1,500.00" })
    const second = screen.getByRole("button", { name: "2pm: ₱320.00" })

    await user.click(first)
    expect(first.getAttribute("aria-pressed")).toBe("true")
    expect(second.getAttribute("aria-pressed")).toBe("false")

    await user.click(second)
    expect(first.getAttribute("aria-pressed")).toBe("false")
    expect(second.getAttribute("aria-pressed")).toBe("true")
  })
})
