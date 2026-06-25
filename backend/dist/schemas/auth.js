import { z } from "zod";
const required = "Email and password are required";
export const loginSchema = z.object({
    email: z.string({ error: required }).trim().min(1, required),
    password: z.string({ error: required }).min(1, required),
});
