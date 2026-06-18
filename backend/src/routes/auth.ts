import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import User from "../models/User.js";
import { validateBody } from "../middleware/validate.js";
import { loginSchema } from "../schemas/auth.js";

const router = Router();

// Caps repeated login attempts per IP so a password can't be brute-forced.
// Successful logins don't count against the limit.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many login attempts. Please try again later." },
});

// POST /api/auth/login — verify credentials against a registered user
router.post("/login", loginLimiter, validateBody(loginSchema), async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  // Same response whether the email is unknown or the password is wrong,
  // so attackers can't tell which emails are registered.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = jwt.sign(
    { sub: user._id, name: user.name, role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: "8h" }
  );

  res.json({ token, user });
});

export default router;
