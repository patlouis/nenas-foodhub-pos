import { z } from "zod";
import { paginationQuerySchema } from "./pagination.js";

export const createSupplySchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    unit: z.string().trim().min(1, "Unit is required"),
    quantity: z.number().min(0, "Quantity must be 0 or greater").optional(),
    unitCost: z.number().positive("Unit cost must be greater than 0").optional(),
    lowStockAt: z.number().min(0, "Low stock threshold must be 0 or greater").nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.quantity && data.quantity > 0 && !data.unitCost) {
      ctx.addIssue({ code: "custom", message: "Unit cost is required when adding an initial quantity", path: ["unitCost"] });
    }
  });

export const updateSupplySchema = z.object({
  name: z.string().trim().min(1, "Name is required").optional(),
  unit: z.string().trim().min(1, "Unit is required").optional(),
  lowStockAt: z.number().min(0, "Low stock threshold must be 0 or greater").nullable().optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export const restockSchema = z.object({
  quantity: z.number().positive("Quantity must be greater than 0"),
  unitCost: z.number().positive("Unit cost must be greater than 0"),
});

export const consumeSchema = z.object({
  quantity: z.number().positive("Quantity must be greater than 0"),
  reason: z.string().trim().max(200, "Reason must be 200 characters or fewer").optional(),
});

export const listSuppliesQuerySchema = paginationQuerySchema(500).extend({
  q: z.string().trim().optional(),
  status: z.enum(["active", "archived"]).optional(),
  sortKey: z.enum(["name", "quantity", "unitCost"]).optional().default("name"),
  sortDir: z.enum(["asc", "desc"]).optional().default("asc"),
});
