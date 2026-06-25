import { z } from "zod";
// Shared page/limit query params for every paginated list endpoint.
// z.coerce.number() converts the raw query-string values ("2") to numbers.
export function paginationQuerySchema(maxLimit) {
    return z.object({
        page: z.coerce.number().int().min(1).optional().default(1),
        limit: z.coerce.number().int().min(1).max(maxLimit).optional().default(20),
    });
}
export function paginate(data, page, limit, total, totalAmount) {
    return { data, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), ...(totalAmount !== undefined ? { totalAmount } : {}) };
}
