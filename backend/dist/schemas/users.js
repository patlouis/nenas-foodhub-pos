import { z } from "zod";
export const createUserSchema = z.object({
    name: z.string().trim().min(1, "Name, email, and password are required"),
    email: z
        .string()
        .trim()
        .min(1, "Name, email, and password are required")
        .email("Enter a valid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    role: z.enum(["admin", "cashier"]).optional(),
});
export const updateUserSchema = z.object({
    name: z.string().trim().min(1).optional(),
    email: z.string().trim().email("Enter a valid email address").optional(),
    role: z.enum(["admin", "cashier"]).optional(),
    password: z.string().min(6, "Password must be at least 6 characters").optional(),
});
