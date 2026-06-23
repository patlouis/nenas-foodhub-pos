import { z } from "zod";

// Shared page/limit query params for every paginated list endpoint.
// z.coerce.number() converts the raw query-string values ("2") to numbers.
export function paginationQuerySchema(maxLimit: number) {
  return z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(maxLimit).optional().default(20),
  });
}

export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  totalAmount?: number;
}

export function paginate<T>(data: T[], page: number, limit: number, total: number, totalAmount?: number): Paginated<T> {
  return { data, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), ...(totalAmount !== undefined ? { totalAmount } : {}) };
}
