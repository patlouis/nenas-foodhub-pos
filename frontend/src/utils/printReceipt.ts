import type { Order } from "../types"

const STORE_NAME = "NENAS FOODHUB"
const STORE_ADDRESS_1 = "Purok 1 Barangay Maburak"
const STORE_ADDRESS_2 = "Gapan City"

// Receipt is laid out as a fixed monospace character grid so it prints
// identically on 58mm and 80mm rolls (32-char width fits the narrower 58mm;
// on 80mm it simply centers with a little margin).
const WIDTH = 32

function formatDateTime(iso?: string) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

function esc(s: string) {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"))
}

// Pad a left label and right value onto one WIDTH-char line.
function row(left: string, right: string) {
  const space = Math.max(1, WIDTH - left.length - right.length)
  return esc(left + " ".repeat(space) + right)
}

function center(s: string) {
  if (s.length >= WIDTH) return esc(s)
  const pad = Math.floor((WIDTH - s.length) / 2)
  return esc(" ".repeat(pad) + s)
}

export function printReceipt(order: Order) {
  const orderNum = order.orderNumber != null
    ? `#${String(order.orderNumber).padStart(4, "0")}`
    : `#${order._id.slice(-6).toUpperCase()}`

  const isStaffMeal = order.orderType === "staff_meal"
  const paymentLabel = order.paymentMethod === "gcash" ? "GCash" : "Cash"

  const solid = "=".repeat(WIDTH)
  const dashed = "-".repeat(WIDTH)

  const lines: string[] = []
  lines.push(center(STORE_NAME))
  lines.push(center(STORE_ADDRESS_1))
  lines.push(center(STORE_ADDRESS_2))
  lines.push(solid)
  lines.push(esc(`Order  : ${orderNum}`))
  lines.push(esc(`Date   : ${formatDateTime(order.createdAt)}`))
  if (order.cashierName) lines.push(esc(`Cashier: ${order.cashierName}`))
  if (order.tableNumber != null) lines.push(esc(`Table  : ${order.tableNumber}`))
  if (isStaffMeal) {
    lines.push(esc(`Type   : Staff Meal${order.staffMealRecipient ? ` (${order.staffMealRecipient})` : ""}`))
  } else {
    lines.push(esc(`Payment: ${paymentLabel}`))
  }
  lines.push(dashed)
  lines.push(row("ITEM", "AMOUNT"))
  for (const item of order.items) {
    const lineTotal = (item.lineTotal ?? item.price * item.quantity).toFixed(2)
    // Item name on its own line so long names never break the column alignment.
    lines.push(esc(item.name))
    lines.push(row(`  ${item.quantity} x P${item.price.toFixed(2)}`, `P${lineTotal}`))
  }
  lines.push(dashed)
  lines.push(row("TOTAL", isStaffMeal ? "P0.00" : `P${order.total.toFixed(2)}`))
  lines.push(solid)
  lines.push(center("** Thank you for dining! **"))
  lines.push(center("Please come again."))

  const body = lines.join("\n")

  const doc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  pre {
    margin: 0;
    padding: 6px 4px 24px;
    color: #000;
    font-family: 'Courier New', Courier, monospace;
    font-size: 13px;
    line-height: 1.35;
    font-weight: 700;
    white-space: pre;
    text-align: center;
  }
</style>
</head>
<body><pre>${body}</pre></body>
</html>`

  // Render into an isolated iframe that contains ONLY the receipt, so the print
  // service captures the receipt alone — never the surrounding app. Printing the
  // iframe's own window (not the main window) is what keeps the app out of the output.
  const old = document.getElementById("pos-receipt-frame")
  if (old) old.remove()

  const frame = document.createElement("iframe")
  frame.id = "pos-receipt-frame"
  frame.setAttribute("aria-hidden", "true")
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;"
  frame.srcdoc = doc

  frame.onload = () => {
    const win = frame.contentWindow
    if (!win) { frame.remove(); return }
    // Give the layout a beat to settle before invoking print.
    setTimeout(() => {
      win.focus()
      win.print()
      // Remove the frame once the dialog has been dismissed.
      setTimeout(() => frame.remove(), 1000)
    }, 150)
  }

  document.body.appendChild(frame)
}
