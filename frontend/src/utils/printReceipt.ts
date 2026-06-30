import type { Order } from "../types"

function formatDateTime(iso?: string) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

// Opens a thermal-formatted print window sized for 58mm paper.
// On Android Chrome, the user picks the paired Bluetooth printer from the print dialog.
export function printReceipt(order: Order, storeName = "YOUR STORE") {
  const orderNum = order.orderNumber != null
    ? `#${String(order.orderNumber).padStart(4, "0")}`
    : `#${order._id.slice(-6).toUpperCase()}`

  const itemRows = order.items.map((item) => {
    const lineTotal = (item.lineTotal ?? item.price * item.quantity).toFixed(2)
    return `
      <tr><td colspan="2" class="item-name">${item.name}</td></tr>
      <tr>
        <td class="item-sub">${item.quantity} × ₱${item.price.toFixed(2)}</td>
        <td class="right">₱${lineTotal}</td>
      </tr>`
  }).join("")

  const paymentLabel = order.paymentMethod === "gcash" ? "GCash" : "Cash"
  const isStaffMeal = order.orderType === "staff_meal"

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt ${orderNum}</title>
<style>
  @page { margin: 0; size: 58mm auto; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 11px;
    width: 58mm;
    padding: 4mm 3mm 8mm;
    color: #000;
  }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: bold; }
  .store  { font-size: 15px; font-weight: bold; margin-bottom: 2px; }
  .divider { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; line-height: 1.4; }
  .item-name { padding-top: 3px; }
  .item-sub  { padding-left: 8px; color: #555; font-size: 10px; }
  .meta { font-size: 10px; line-height: 1.6; }
  .total-label { font-weight: bold; font-size: 13px; padding-top: 4px; }
  .total-value { font-weight: bold; font-size: 13px; padding-top: 4px; text-align: right; }
  .footer { text-align: center; font-size: 10px; margin-top: 8px; color: #444; }
</style>
</head>
<body>
  <p class="center store">${storeName}</p>
  <p class="center meta">Order ${orderNum}</p>
  <hr class="divider">
  <div class="meta">
    <div>${formatDateTime(order.createdAt)}</div>
    ${order.cashierName ? `<div>Cashier: ${order.cashierName}</div>` : ""}
    ${order.tableNumber != null ? `<div>Table: ${order.tableNumber}</div>` : ""}
    ${isStaffMeal ? `<div>Staff meal${order.staffMealRecipient ? ` — ${order.staffMealRecipient}` : ""}</div>` : `<div>Payment: ${paymentLabel}</div>`}
  </div>
  <hr class="divider">
  <table>${itemRows}</table>
  <hr class="divider">
  <table>
    <tr>
      <td class="total-label">TOTAL</td>
      <td class="total-value">${isStaffMeal ? "₱0.00 (staff)" : `₱${order.total.toFixed(2)}`}</td>
    </tr>
  </table>
  <p class="footer">— Thank you! —</p>
</body>
</html>`

  const win = window.open("", "_blank", "width=320,height=600")
  if (!win) {
    // Popup was blocked — fall back to a dedicated print page
    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    window.open(url, "_blank")
    return
  }
  win.document.write(html)
  win.document.close()
  win.focus()
  // Small delay lets the browser finish rendering before print dialog opens
  setTimeout(() => { win.print(); win.close() }, 300)
}
