// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { Product } from "../types"

// Only the catalogue fetch and the update call matter here; the rest of the
// API surface is stubbed so the page can mount without a server.
const listMock = vi.fn()
const updateMock = vi.fn()

vi.mock("../api", () => ({
  productsApi: {
    list: (...args: unknown[]) => listMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    create: vi.fn(),
    remove: vi.fn(),
    adjustStock: vi.fn(),
    recordWastage: vi.fn(),
  },
  categoriesApi: { list: vi.fn(async () => []) },
  ApiError: class ApiError extends Error {},
}))

vi.mock("../auth", () => ({
  useAuth: () => ({ user: { _id: "u1", name: "Admin", role: "admin" } }),
}))

import InventoryPage from "./InventoryPage"

function product(overrides: Partial<Product> = {}): Product {
  return {
    _id: "p1",
    name: "Rice",
    price: 20,
    stock: 12,
    status: "active",
    costPrice: null,
    discountQty: null,
    discountPrice: null,
    ...overrides,
  }
}

async function openEditDialogFor(p: Product) {
  listMock.mockResolvedValue({ data: [p], total: 1, page: 1, totalPages: 1 })
  updateMock.mockResolvedValue({ ...p, stock: null })
  render(<InventoryPage />)

  const user = userEvent.setup()
  // The page renders a mobile card list and a desktop table at once, so every
  // product appears twice in the DOM — take the first edit control either way.
  const editButtons = await screen.findAllByRole("button", { name: /edit product/i })
  await user.click(editButtons[0])
  return user
}

const trackSwitch = () => screen.getByRole("switch", { name: /track stock/i })
const confirmDialog = async () =>
  (await screen.findByText(/Turn off stock tracking\?/)).closest("div[role='dialog']") as HTMLElement

beforeEach(() => {
  listMock.mockReset()
  updateMock.mockReset()
})
afterEach(cleanup)

describe("turning off stock tracking", () => {
  it("flips the switch without confirming — nothing is committed yet", async () => {
    const user = await openEditDialogFor(product({ stock: 12 }))

    await user.click(trackSwitch())

    expect(trackSwitch().getAttribute("aria-checked")).toBe("false")
    expect(screen.queryByText(/Turn off stock tracking\?/)).toBeNull()
  })

  it("confirms on save, naming the count about to be discarded", async () => {
    const user = await openEditDialogFor(product({ stock: 12 }))

    await user.click(trackSwitch())
    await user.click(screen.getByRole("button", { name: /^Save$/ }))

    const dialog = await confirmDialog()
    expect(within(dialog).getByText("12")).not.toBeNull()
    // Nothing persisted until the confirm is accepted.
    expect(updateMock).not.toHaveBeenCalled()
  })

  it("cancelling the confirm saves nothing and keeps the form open", async () => {
    const user = await openEditDialogFor(product({ stock: 12 }))

    await user.click(trackSwitch())
    await user.click(screen.getByRole("button", { name: /^Save$/ }))
    const dialog = await confirmDialog()
    await user.click(within(dialog).getByRole("button", { name: /^Cancel$/ }))

    expect(screen.queryByText(/Turn off stock tracking\?/)).toBeNull()
    expect(updateMock).not.toHaveBeenCalled()
    expect(trackSwitch()).not.toBeNull() // form still open
  })

  it("accepting the confirm saves the product as untracked", async () => {
    const user = await openEditDialogFor(product({ stock: 12 }))

    await user.click(trackSwitch())
    await user.click(screen.getByRole("button", { name: /^Save$/ }))
    const dialog = await confirmDialog()
    await user.click(within(dialog).getByRole("button", { name: /Turn off tracking and save/i }))

    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(updateMock.mock.calls[0][1]).toMatchObject({ stock: null })
  })

  it("saves straight through when tracking is left alone", async () => {
    const user = await openEditDialogFor(product({ stock: 12 }))

    await user.click(screen.getByRole("button", { name: /^Save$/ }))

    expect(screen.queryByText(/Turn off stock tracking\?/)).toBeNull()
    expect(updateMock).toHaveBeenCalledTimes(1)
  })

  it("does not confirm for a product that was already untracked", async () => {
    const user = await openEditDialogFor(product({ stock: null }))

    await user.click(screen.getByRole("button", { name: /^Save$/ }))

    // Nothing is being turned off, so there is nothing to warn about.
    expect(screen.queryByText(/Turn off stock tracking\?/)).toBeNull()
    expect(updateMock).toHaveBeenCalledTimes(1)
  })

  it("untracks a zero-count product without prompting", async () => {
    const user = await openEditDialogFor(product({ stock: 0 }))

    await user.click(trackSwitch())
    await user.click(screen.getByRole("button", { name: /^Save$/ }))

    // There is no count to discard, so the prompt would be pure friction.
    expect(screen.queryByText(/Turn off stock tracking\?/)).toBeNull()
    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(updateMock.mock.calls[0][1]).toMatchObject({ stock: null })
  })
})
