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

function center(s: string) {
  if (s.length >= WIDTH) return esc(s)
  const pad = Math.floor((WIDTH - s.length) / 2)
  return esc(" ".repeat(pad) + s)
}

// Wraps an already-escaped line in a larger font size, for the store name and order
// number that should stand out from the rest of the monospace grid. line-height:1 is
// set explicitly — the <pre>'s unitless line-height recomputes per element's own font
// size, so a bigger span would otherwise get extra vertical space around it.
function big(escapedLine: string, px: number) {
  return `<span style="font-size:${px}px;line-height:1">${escapedLine}</span>`
}

// Centers via real CSS instead of manual space-padding — needed for the store name,
// since its enlarged font size scales space-padding characters too, throwing off the
// hand-computed centering math used for the (base-size) lines below it.
// inline-block (not block) — a block box forces its own line break, which combined with
// the literal "\n" already separating lines in the joined text produced a blank line.
function bigCentered(rawText: string, px: number) {
  return `<span style="display:inline-block;width:100%;text-align:center;font-size:${px}px;line-height:1.15">${esc(rawText)}</span>`
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
  lines.push(bigCentered(STORE_NAME, 24))
  lines.push(center(STORE_ADDRESS_1))
  lines.push(center(STORE_ADDRESS_2))
  lines.push(solid)
  lines.push(big(esc(`Order  : ${orderNum}`), 19))
  lines.push(esc(`Date   : ${formatDateTime(order.createdAt)}`))
  if (order.cashierName) lines.push(esc(`Cashier: ${order.cashierName}`))
  if (isStaffMeal) {
    lines.push(esc(`Type   : Staff Meal${order.staffMealRecipient ? ` (${order.staffMealRecipient})` : ""}`))
  } else {
    lines.push(esc(`Payment: ${paymentLabel}`))
  }
  lines.push(dashed)
  lines.push(row("ITEM", "AMOUNT"))
  for (const item of order.items) {
    const lineTotal = (item.lineTotal ?? item.price * item.quantity).toFixed(2)
    lines.push(esc(item.name))
    // No leading indent — this line stays flush with the product name above it.
    lines.push(row(`${item.quantity} x P${item.price.toFixed(2)}`, `P${lineTotal}`))
  }
  lines.push(dashed)
  lines.push(row("TOTAL", isStaffMeal ? "P0.00" : `P${order.total.toFixed(2)}`))
  lines.push(solid)
  lines.push(center("** Thank you for dining! **"))
  lines.push(center("Please come again."))

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

  // Inject a one-time @page rule so the printed PDF has no page margins.
  let pageStyle = document.getElementById("pos-print-page-style")
  if (!pageStyle) {
    pageStyle = document.createElement("style")
    pageStyle.id = "pos-print-page-style"
    pageStyle.textContent = "@page { margin: 0; }"
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
  // innerHTML, not textContent — lines built with big() need their <span> tags parsed.
  // All dynamic content going in was already escaped via esc()/row()/center().
  pre.innerHTML = html
  pre.style.cssText = [
    "margin:0",
    "padding:8px 4px 24px",
    "font-family:Consolas,'Roboto Mono','Courier New',monospace",
    "font-size:16px",
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
