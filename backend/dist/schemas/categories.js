import { z } from "zod";
export const createCategorySchema = z.object({
    name: z.string().trim().min(1, "Name is required"),
    color: z.string().trim().optional(),
});
export const updateCategorySchema = createCategorySchema.partial();
export const reorderSchema = z.object({
    items: z.array(z.object({
        id: z.string().min(1),
        order: z.number().int(),
    })),
});
