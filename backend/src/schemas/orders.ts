import { z } from "zod";
import mongoose from "mongoose";
import { paginationQuerySchema } from "./pagination.js";

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z
          .string()
          .refine((v) => mongoose.isValidObjectId(v), "Each item needs a valid productId"),
        quantity: z.number().int().min(1, "Each item needs a whole-number quantity of at least 1"),
        portion: z.enum(["full", "half"]).optional().default("full"),
        // The add-on rate actually charged. Absent means no add-on; the label
        // is never taken from the client, only the product it belongs to.
        fee: z.number().min(0, "A fee can't be negative").optional(),
      })
    )
    .min(1, "Order must contain at least one item"),
  paymentMethod: z.enum(["cash", "gcash"]).optional().default("cash"),
  orderType: z.enum(["sale", "staff_meal"]).optional().default("sale"),
  staffMealRecipient: z.string().trim().optional(),
  tableNumber: z.number().int().min(1).max(6).optional(),
});

// Intl throws RangeError on an unknown zone — the cheapest reliable check,
// and it keeps a bad value from reaching the aggregation pipeline.
function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const peakHoursQuerySchema = z.object({
  timezone: z.string().default("UTC").refine(isValidTimeZone, "Invalid timezone"),
});

// The dashboard's figures are aggregated in the database rather than summed
// from a page of orders in the browser, which silently truncated every total
// once the shop passed the page limit. Both periods are asked for at once so
// the KPI cards get their comparison without a second round trip.
export const summaryQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  prevFrom: z.string().optional(),
  prevTo: z.string().optional(),
  bucket: z.enum(["hour", "day", "month"]).optional().default("day"),
  timezone: z.string().default("UTC").refine(isValidTimeZone, "Invalid timezone"),
});

export const listOrdersQuerySchema = paginationQuerySchema(1000).extend({
  q: z.string().trim().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  paymentType: z.enum(["cash", "gcash", "staff_meal"]).optional(),
  // Absent lists both, which is what the history page has always shown.
  status: z.enum(["voided", "completed"]).optional(),
  sortKey: z.enum(["date", "cashier", "total", "payment"]).optional().default("date"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
});
