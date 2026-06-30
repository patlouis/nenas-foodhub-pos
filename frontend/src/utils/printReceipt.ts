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
      <tr><td colspan="2" class="r-item-name">${item.name}</td></tr>
      <tr>
        <td class="r-item-sub">${item.quantity} × ₱${item.price.toFixed(2)}</td>
        <td style="text-align:right">₱${lineTotal}</td>
      </tr>`
  }).join("")

  const paymentLabel = order.paymentMethod === "gcash" ? "GCash" : "Cash"
  const isStaffMeal = order.orderType === "staff_meal"

  const receiptContent = `
    <p class="r-center r-store">${storeName}</p>
    <p class="r-center r-meta">Order ${orderNum}</p>
    <hr class="r-divider">
    <div class="r-meta">
      <div>${formatDateTime(order.createdAt)}</div>
      ${order.cashierName ? `<div>Cashier: ${order.cashierName}</div>` : ""}
      ${order.tableNumber != null ? `<div>Table: ${order.tableNumber}</div>` : ""}
      ${isStaffMeal
        ? `<div>Staff meal${order.staffMealRecipient ? ` — ${order.staffMealRecipient}` : ""}</div>`
        : `<div>Payment: ${paymentLabel}</div>`}
    </div>
    <hr class="r-divider">
    <table class="r-table">${itemRows}</table>
    <hr class="r-divider">
    <table class="r-table">
      <tr>
        <td class="r-total-label">TOTAL</td>
        <td class="r-total-value">${isStaffMeal ? "₱0.00 (staff)" : `₱${order.total.toFixed(2)}`}</td>
      </tr>
    </table>
    <p class="r-center r-meta" style="margin-top:8px">— Thank you! —</p>`

  // Inject receipt directly into the current page and call window.print() — the only
  // approach that works reliably on Android Chrome (iframes and popups both fail there).
  let styleEl = document.getElementById("pos-print-style")
  if (!styleEl) {
    styleEl = document.createElement("style")
    styleEl.id = "pos-print-style"
    styleEl.textContent = `
      @page { margin: 0; size: 58mm auto; }
      #pos-receipt { display: none; }
      @media print {
        body > *:not(#pos-receipt) { display: none !important; }
        #pos-receipt {
          display: block !important;
          font-family: 'Courier New', Courier, monospace;
          font-size: 11px;
          width: 58mm;
          padding: 4mm 3mm 8mm;
          color: #000;
        }
        #pos-receipt .r-center { text-align: center; }
        #pos-receipt .r-store  { font-size: 15px; font-weight: bold; margin-bottom: 2px; }
        #pos-receipt .r-divider { border: none; border-top: 1px dashed #000; margin: 4px 0; }
        #pos-receipt .r-meta { font-size: 10px; line-height: 1.6; }
        #pos-receipt .r-table { width: 100%; border-collapse: collapse; }
        #pos-receipt .r-table td { padding: 1px 0; vertical-align: top; line-height: 1.4; }
        #pos-receipt .r-item-name { padding-top: 3px; }
        #pos-receipt .r-item-sub  { padding-left: 8px; color: #555; font-size: 10px; }
        #pos-receipt .r-total-label { font-weight: bold; font-size: 13px; padding-top: 4px; }
        #pos-receipt .r-total-value { font-weight: bold; font-size: 13px; padding-top: 4px; text-align: right; }
      }
    `
    document.head.appendChild(styleEl)
  }

  const existing = document.getElementById("pos-receipt")
  if (existing) existing.remove()

  const el = document.createElement("div")
  el.id = "pos-receipt"
  el.innerHTML = receiptContent
  document.body.appendChild(el)

  window.addEventListener("afterprint", () => el.remove(), { once: true })
  window.print()
}
