// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { Order } from "../types"

const listMock = vi.fn()

vi.mock("../api", () => ({
  ordersApi: {
    list: (...args: unknown[]) => listMock(...args),
    void: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}))

vi.mock("../auth", () => ({
  useAuth: () => ({ user: { _id: "u1", name: "Admin", role: "admin" } }),
}))

import OrderHistoryPage from "./OrderHistoryPage"

// Mirrors order #18 as actually stored: noodles at ₱30 plus ₱5 of hot water,
// which is why the order totals ₱35.
function orderWithFee(): Order {
  return {
    _id: "o1",
    orderNumber: 18,
    total: 35,
    status: "completed",
    orderType: "sale",
    paymentMethod: "cash",
    createdAt: "2026-08-26T02:00:00.000Z",
    items: [
      {
        product: "p1",
        name: "Nissin cup noodles",
        price: 30,
        portion: "full",
        quantity: 1,
        lineTotal: 30,
        feeLabel: "Hot water",
        feeAmount: 5,
        feeTotal: 5,
      },
    ],
  }
}

beforeEach(() => {
  listMock.mockReset()
  listMock.mockResolvedValue({ data: [orderWithFee()], page: 1, limit: 20, total: 1, totalPages: 1 })
})
afterEach(cleanup)

describe("order history with an add-on fee", () => {
  it("names the add-on in the list row", async () => {
    render(<OrderHistoryPage />)

    expect((await screen.findAllByText(/Hot water/)).length).toBeGreaterThan(0)
  })

  it("itemises the fee so the breakdown adds up to the total", async () => {
    const user = userEvent.setup()
    render(<OrderHistoryPage />)

    // The row renders for both the card and table layouts, so take the first.
    await user.click((await screen.findAllByRole("button", { name: /View receipt/i }))[0])

    // ₱30 of noodles under a ₱35 order looks like an arithmetic fault unless
    // the ₱5 is shown as its own line.
    const dialog = await screen.findByRole("dialog")
    expect(dialog.textContent).toMatch(/Hot water/)
    expect(dialog.textContent).toMatch(/₱5\.00/)
    expect(dialog.textContent).toMatch(/₱35\.00/)
  })
})
