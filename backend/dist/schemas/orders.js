import { z } from "zod";
import mongoose from "mongoose";
import { paginationQuerySchema } from "./pagination.js";
export const createOrderSchema = z.object({
    items: z
        .array(z.object({
        productId: z
            .string()
            .refine((v) => mongoose.isValidObjectId(v), "Each item needs a valid productId"),
        quantity: z.number().int().min(1, "Each item needs a whole-number quantity of at least 1"),
    }))
        .min(1, "Order must contain at least one item"),
    paymentMethod: z.enum(["cash", "gcash"]).optional().default("cash"),
    orderType: z.enum(["sale", "staff_meal"]).optional().default("sale"),
    staffMealRecipient: z.string().trim().optional(),
});
export const listOrdersQuerySchema = paginationQuerySchema(1000).extend({
    q: z.string().trim().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    paymentType: z.enum(["cash", "gcash", "staff_meal"]).optional(),
    sortKey: z.enum(["date", "cashier", "total", "payment"]).optional().default("date"),
    sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
});
