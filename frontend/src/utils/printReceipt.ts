import type { Order } from "../types"

const STORE_NAME = "NENAS FOODHUB"
const STORE_ADDRESS_1 = "Purok 1 Barangay Maburak"
const STORE_ADDRESS_2 = "Gapan City"

// Printer is a 58mm roll — actual printable width is ~48mm (roll minus margins), not
// 80mm. At 15px font-size a monospace character is roughly 9px wide, so 18 columns ×
// 9px ≈ 162px (~43mm), comfortably inside the real printable area with safety margin.
const WIDTH = 18

function formatDateTime(iso?: string) {
  if (!iso) return "—"
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const yyyy = d.getFullYear()
  const time = d.toLocaleString("en-PH", { hour: "2-digit", minute: "2-digit" })
  return `${mm}/${dd}/${yyyy}, ${time}`
}

function esc(s: string) {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"))
}

function row(left: string, right: string) {
  const space = Math.max(1, WIDTH - left.length - right.length)
  return esc(left + " ".repeat(space) + right)
}

// Wraps an already-escaped line in a larger font size, for the order number that should
// stand out from the rest of the monospace grid. line-height:1 is set explicitly — the
// <pre>'s unitless line-height recomputes per element's own font size, so a bigger span
// would otherwise get extra vertical space around it.
function big(escapedLine: string, px: number) {
  return `<span style="font-size:${px}px;line-height:1">${escapedLine}</span>`
}

// A block that wraps onto a second line instead of overflowing the physical paper width
// if its text doesn't fit — used for anything not part of the strict ITEM/AMOUNT grid
// (store name, address, product names, footer), since those don't need to share a fixed
// character column with other lines and their length isn't fully under our control.
// inline-block (not block) — a block box forces its own line break, which combined with
// the literal "\n" already separating lines in the joined text would add a blank line.
function wrap(rawText: string, opts: { center?: boolean; px?: number } = {}) {
  const align = opts.center ? "center" : "left"
  const size = opts.px ? `font-size:${opts.px}px;` : ""
  return `<span style="display:inline-block;width:100%;text-align:${align};${size}line-height:1.25;white-space:normal;word-break:break-word">${esc(rawText)}</span>`
}

function buildReceiptHtml(order: Order): string {
  const orderNum = order.orderNumber != null
    ? `#${String(order.orderNumber).padStart(4, "0")}`
    : `#${order._id.slice(-6).toUpperCase()}`

  const isStaffMeal = order.orderType === "staff_meal"
  const paymentLabel = order.paymentMethod === "gcash" ? "GCash" : "Cash"
  const solid = "=".repeat(WIDTH)
  const dashed = "-".repeat(WIDTH)

  const lines: string[] = []
  lines.push(wrap(STORE_NAME, { center: true, px: 18 }))
  lines.push(wrap(STORE_ADDRESS_1, { center: true }))
  lines.push(wrap(STORE_ADDRESS_2, { center: true }))
  lines.push(solid)
  lines.push(big(esc(`Order  : ${orderNum}`), 17))
  // wrap(), not esc() — the date/time line alone runs ~30 chars, well past the 18-column
  // budget, so it must be able to wrap onto a second line instead of getting clipped.
  lines.push(wrap(`Date   : ${formatDateTime(order.createdAt)}`))
  if (order.cashierName) lines.push(wrap(`Cashier: ${order.cashierName}`))
  if (isStaffMeal) {
    lines.push(wrap(`Type   : Staff Meal${order.staffMealRecipient ? ` (${order.staffMealRecipient})` : ""}`))
  } else {
    lines.push(wrap(`Payment: ${paymentLabel}`))
  }
  lines.push(dashed)
  lines.push(row("ITEM", "AMOUNT"))
  for (const item of order.items) {
    const lineTotal = (item.lineTotal ?? item.price * item.quantity).toFixed(2)
    // Wraps instead of overflowing — product names aren't a fixed, controlled length.
    lines.push(wrap(item.name))
    // No leading indent — this line stays flush with the product name above it.
    lines.push(row(`${item.quantity} x P${item.price.toFixed(2)}`, `P${lineTotal}`))
  }
  lines.push(dashed)
  lines.push(row("TOTAL", isStaffMeal ? "P0.00" : `P${order.total.toFixed(2)}`))
  lines.push(solid)
  lines.push(wrap("** Thank you! **", { center: true }))
  lines.push(wrap("Please come again.", { center: true }))

  return lines.join("\n")
}

export function printReceipt(order: Order) {
  const html = buildReceiptHtml(order)

  // Cheap Bluetooth thermal drivers print a screenshot of the LIVE screen, not the
  // browser's print PDF. So we must make the real page show only the receipt at print
  // time. We hide the app, render the receipt as a full-screen visible overlay, then
  // print the main window. Restoring on `afterprint` fires too early (the driver
  // captures afterwards), so we restore only when focus returns from the print dialog.

  const appRoot = document.getElementById("root")

  // Inject a one-time @page rule declaring the actual roll width. Without an explicit
  // size, the browser assumes a default page width for layout purposes — content that
  // fits fine in the on-screen preview can still get cropped on the physical paper,
  // since the printer only has ~48mm to work with (58mm roll) regardless of what CSS
  // would otherwise assume.
  let pageStyle = document.getElementById("pos-print-page-style")
  if (!pageStyle) {
    pageStyle = document.createElement("style")
    pageStyle.id = "pos-print-page-style"
    pageStyle.textContent = "@page { size: 58mm auto; margin: 0; }"
    document.head.appendChild(pageStyle)
  }

  const old = document.getElementById("pos-receipt")
  if (old) old.remove()

  const overlay = document.createElement("div")
  overlay.id = "pos-receipt"
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "background:#ffffff",
    "color:#000000",
    "margin:0",
    "display:flex",
    "justify-content:center",
    "align-items:flex-start",
    "overflow:auto",
  ].join(";")

  const pre = document.createElement("pre")
  // innerHTML, not textContent — lines built with big()/wrap() need their <span> tags parsed.
  // All dynamic content going in was already escaped via esc()/row()/wrap().
  pre.innerHTML = html
  pre.style.cssText = [
    "margin:0",
    "max-width:44mm",
    "box-sizing:border-box",
    "padding:8px 4px 24px",
    "font-family:Consolas,'Roboto Mono','Courier New',monospace",
    "font-size:15px",
    "line-height:1.4",
    "font-weight:700",
    "white-space:pre",
    // text-align must stay left — centering here re-centers each line individually and
    // breaks the column alignment already built into the text via space-padding.
    "text-align:left",
    "color:#000000",
  ].join(";")
  overlay.appendChild(pre)
  document.body.appendChild(overlay)

  if (appRoot) appRoot.style.setProperty("display", "none", "important")

  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    window.removeEventListener("focus", onFocus)
    if (appRoot) appRoot.style.removeProperty("display")
    overlay.remove()
  }
  // `focus` fires when the user returns to the app after the print dialog closes —
  // by then the driver has already captured/printed, so it's safe to restore.
  const onFocus = () => setTimeout(restore, 150)
  window.addEventListener("focus", onFocus)
  // Fallback in case `focus` never fires on this device.
  setTimeout(restore, 15000)

  // Let the overlay paint before opening the print dialog.
  setTimeout(() => window.print(), 250)
}
