import { z } from "zod";
import { paginationQuerySchema } from "./pagination.js";

const SORT_KEYS = ["createdAt", "supplyName", "type", "quantity", "unitCost"] as const;

export const listSupplyAdjustmentsQuerySchema = paginationQuerySchema(1000).extend({
  type: z.enum(["restock", "consume"]).optional(),
  supply: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().optional(),
  sortKey: z.enum(SORT_KEYS).optional().default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
});
