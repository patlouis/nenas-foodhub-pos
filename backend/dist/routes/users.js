import { Router } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { createUserSchema, updateUserSchema } from "../schemas/users.js";
const router = Router();
router.use(requireAuth);
// GET /api/users — all authenticated users can fetch the list (needed for staff meal dropdown)
router.get("/", async (_req, res) => {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
});
// POST /api/users — register a new user (admin only)
router.post("/", requireAdmin, validateBody(createUserSchema), async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        const normalizedEmail = email.toLowerCase().trim();
        const existing = await User.findOne({ email: normalizedEmail });
        if (existing) {
            return res
                .status(409)
                .json({ error: "A user with that email already exists" });
        }
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({
            name,
            email: normalizedEmail,
            passwordHash,
            role,
        });
        res.status(201).json(user);
    }
    catch (err) {
        // Handle the unique-index race where two requests slip past the check above
        if (err.code === 11000) {
            return res
                .status(409)
                .json({ error: "A user with that email already exists" });
        }
        res.status(400).json({ error: err.message });
    }
});
// PUT /api/users/:id — update name, email, role, and optionally password (admin only)
router.put("/:id", requireAdmin, validateBody(updateUserSchema), async (req, res) => {
    try {
        const { name, email, role, password } = req.body;
        const updates = {};
        if (name)
            updates.name = name;
        if (email)
            updates.email = email.toLowerCase().trim();
        if (role)
            updates.role = role;
        if (password) {
            updates.passwordHash = await bcrypt.hash(password, 10);
        }
        const user = await User.findByIdAndUpdate(req.params.id, updates, { returnDocument: "after" });
        if (!user)
            return res.status(404).json({ error: "Not found" });
        res.json(user);
    }
    catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ error: "A user with that email already exists" });
        }
        res.status(400).json({ error: err.message });
    }
});
// DELETE /api/users/:id (admin only)
router.delete("/:id", requireAdmin, async (req, res) => {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user)
        return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
});
export default router;
