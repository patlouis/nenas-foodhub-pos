import type { Order } from "../types"

function formatDateTime(iso?: string) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

export function printReceipt(order: Order, storeName = "YOUR STORE") {
  const orderNum = order.orderNumber != null
    ? `#${String(order.orderNumber).padStart(4, "0")}`
    : `#${order._id.slice(-6).toUpperCase()}`

  const itemRows = order.items.map((item) => {
    const lineTotal = (item.lineTotal ?? item.price * item.quantity).toFixed(2)
    return `
      <tr><td colspan="2" style="padding-top:3px">${item.name}</td></tr>
      <tr>
        <td style="padding-left:8px;font-size:10px;color:#555">${item.quantity} × ₱${item.price.toFixed(2)}</td>
        <td style="text-align:right">₱${lineTotal}</td>
      </tr>`
  }).join("")

  const paymentLabel = order.paymentMethod === "gcash" ? "GCash" : "Cash"
  const isStaffMeal = order.orderType === "staff_meal"

  const existing = document.getElementById("pos-receipt")
  if (existing) existing.remove()

  const el = document.createElement("div")
  el.id = "pos-receipt"
  // All styles are inline so they work regardless of whether PrintHand processes
  // external/media-query CSS. visibility:visible on this element overrides the
  // visibility:hidden we set on documentElement, making only the receipt render.
  el.style.cssText = [
    "visibility:visible",
    "position:fixed",
    "top:0", "left:0",
    "width:58mm",
    "background:#fff",
    "color:#000",
    "padding:4mm 3mm 8mm",
    "font-family:'Courier New',Courier,monospace",
    "font-size:11px",
    "line-height:1.4",
    "z-index:99999",
    "box-sizing:border-box",
  ].join(";")

  el.innerHTML = `
    <p style="text-align:center;font-size:15px;font-weight:bold;margin:0 0 2px">${storeName}</p>
    <p style="text-align:center;font-size:10px;margin:0">Order ${orderNum}</p>
    <hr style="border:none;border-top:1px dashed #000;margin:4px 0">
    <div style="font-size:10px;line-height:1.6">
      <div>${formatDateTime(order.createdAt)}</div>
      ${order.cashierName ? `<div>Cashier: ${order.cashierName}</div>` : ""}
      ${order.tableNumber != null ? `<div>Table: ${order.tableNumber}</div>` : ""}
      ${isStaffMeal
        ? `<div>Staff meal${order.staffMealRecipient ? ` — ${order.staffMealRecipient}` : ""}</div>`
        : `<div>Payment: ${paymentLabel}</div>`}
    </div>
    <hr style="border:none;border-top:1px dashed #000;margin:4px 0">
    <table style="width:100%;border-collapse:collapse">${itemRows}</table>
    <hr style="border:none;border-top:1px dashed #000;margin:4px 0">
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td style="font-weight:bold;font-size:13px;padding-top:4px">TOTAL</td>
        <td style="font-weight:bold;font-size:13px;padding-top:4px;text-align:right">
          ${isStaffMeal ? "₱0.00 (staff)" : `₱${order.total.toFixed(2)}`}
        </td>
      </tr>
    </table>
    <p style="text-align:center;font-size:10px;margin-top:8px;color:#444">— Thank you! —</p>`

  document.body.appendChild(el)

  // Hide the entire page; visibility:visible on el (a descendant) overrides this,
  // so only the receipt is visible to the print renderer — no @media print needed.
  document.documentElement.style.visibility = "hidden"

  window.addEventListener("afterprint", () => {
    document.documentElement.style.visibility = ""
    el.remove()
  }, { once: true })

  window.print()
}
