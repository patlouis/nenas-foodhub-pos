import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";

// Validates req.body against a zod schema and replaces it with the parsed
// (and possibly coerced/trimmed) value. Responds 400 with the first issue's
// message on failure, matching the single-string { error } shape every
// route already returns.
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.issues[0]?.message ?? "Invalid request body" });
    }
    req.body = result.data;
    next();
  };
}
