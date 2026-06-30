import type { Order } from "../types"

const STORE_NAME = "NENAS FOODHUB"
const STORE_ADDRESS_1 = "Purok 1 Barangay Maburak"
const STORE_ADDRESS_2 = "Gapan City"

function formatDateTime(iso?: string) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

function line(char = "-", len = 32) {
  return `<div style="letter-spacing:1px">${char.repeat(len)}</div>`
}

export function printReceipt(order: Order) {
  const orderNum = order.orderNumber != null
    ? `#${String(order.orderNumber).padStart(4, "0")}`
    : `#${order._id.slice(-6).toUpperCase()}`

  const isStaffMeal = order.orderType === "staff_meal"
  const paymentLabel = order.paymentMethod === "gcash" ? "GCash" : "Cash"

  const itemRows = order.items.map((item) => {
    const lineTotal = (item.lineTotal ?? item.price * item.quantity).toFixed(2)
    const name = item.name.length > 18 ? item.name.slice(0, 17) + "…" : item.name
    return `
      <div style="display:flex;justify-content:space-between;gap:4px;padding:2px 0 0">
        <span style="flex:1">${name}</span>
        <span style="white-space:nowrap;font-weight:600">₱${lineTotal}</span>
      </div>
      <div style="font-size:10px;color:#444;padding-bottom:3px">
        &nbsp;&nbsp;${item.quantity} × ₱${item.price.toFixed(2)}
      </div>`
  }).join("")

  const existing = document.getElementById("pos-receipt")
  if (existing) existing.remove()

  const el = document.createElement("div")
  el.id = "pos-receipt"
  el.style.cssText = [
    "display:block",
    "position:fixed",
    "inset:0",
    "background:#fff",
    "color:#000",
    "padding:10px 12px",
    "font-family:'Courier New',Courier,monospace",
    "font-size:12px",
    "line-height:1.5",
    "z-index:999999",
    "box-sizing:border-box",
    "overflow:auto",
  ].join(";")

  el.innerHTML = `
    <div style="max-width:280px;margin:0 auto">

      <div style="text-align:center;margin-bottom:6px">
        <div style="font-size:18px;font-weight:bold;letter-spacing:2px">${STORE_NAME}</div>
        <div style="font-size:10px;margin-top:2px">${STORE_ADDRESS_1}</div>
        <div style="font-size:10px">${STORE_ADDRESS_2}</div>
      </div>

      ${line("=")}

      <div style="font-size:11px;margin:4px 0">
        <div>Order : ${orderNum}</div>
        <div>Date  : ${formatDateTime(order.createdAt)}</div>
        ${order.cashierName ? `<div>Cashier: ${order.cashierName}</div>` : ""}
        ${order.tableNumber != null ? `<div>Table  : ${order.tableNumber}</div>` : ""}
        <div>${isStaffMeal
          ? `Type  : Staff Meal${order.staffMealRecipient ? ` (${order.staffMealRecipient})` : ""}`
          : `Payment: ${paymentLabel}`}
        </div>
      </div>

      ${line()}

      <div style="font-size:11px;margin:4px 0">
        <div style="display:flex;justify-content:space-between;font-weight:bold;margin-bottom:2px">
          <span>ITEM</span><span>AMOUNT</span>
        </div>
        ${itemRows}
      </div>

      ${line()}

      <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:bold;margin:4px 0">
        <span>TOTAL</span>
        <span>${isStaffMeal ? "₱0.00" : `₱${order.total.toFixed(2)}`}</span>
      </div>

      ${line("=")}

      <div style="text-align:center;font-size:10px;margin-top:6px">
        <div>** Thank you for dining! **</div>
        <div>Please come again.</div>
      </div>

    </div>`

  document.body.appendChild(el)

  // Hide the React app so only the receipt shows in the print capture
  const appRoot = document.getElementById("root")
  if (appRoot) appRoot.style.display = "none"

  window.addEventListener("afterprint", () => {
    if (appRoot) appRoot.style.display = ""
    el.remove()
  }, { once: true })

  // Two rAF calls ensure the DOM has painted before the print dialog opens
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
}
