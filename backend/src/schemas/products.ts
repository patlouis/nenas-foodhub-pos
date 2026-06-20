import { z } from "zod";
import { paginationQuerySchema } from "./pagination.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid category ID");

export const createProductSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  sku: z.string().trim().optional(),
  price: z.number().min(0, "Price must be 0 or greater"),
  stock: z.number().int().min(0, "Stock must be 0 or greater").optional(),
  category: objectId.optional(),
  status: z.enum(["active", "disabled"]).optional(),
  costPrice: z.number().min(0, "costPrice must be 0 or greater").nullable().optional(),
  discountQty: z.number().int().min(2, "discountQty must be at least 2").nullable().optional(),
  discountPrice: z.number().min(0, "discountPrice must be 0 or greater").nullable().optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const adjustStockSchema = z.object({
  delta: z
    .number()
    .int("delta must be a non-zero integer")
    .refine((d) => d !== 0, "delta must be a non-zero integer"),
});

export const listProductsQuerySchema = paginationQuerySchema(500).extend({
  q: z.string().trim().optional(),
  category: objectId.optional(),
  sortKey: z.enum(["name", "sku", "price", "stock", "category"]).optional().default("category"),
  sortDir: z.enum(["asc", "desc"]).optional().default("asc"),
});
