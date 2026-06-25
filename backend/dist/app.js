import express from "express";
import cors from "cors";
import morgan from "morgan";
import productRoutes from "./routes/products.js";
import userRoutes from "./routes/users.js";
import authRoutes from "./routes/auth.js";
import categoryRoutes from "./routes/categories.js";
import orderRoutes from "./routes/orders.js";
import stockAdjustmentRoutes from "./routes/stockAdjustments.js";
import { requireAuth } from "./middleware/auth.js";
// Comma-separated list of allowed frontend origins, e.g.
// "http://localhost:5173,https://pos.example.com". Defaults to the Vite
// dev server so local development keeps working out of the box.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173").split(",").map((o) => o.trim());
// Split from server.ts so tests can import the app directly (via supertest)
// without connecting to a real database or binding a real port.
export const app = express();
app.use(cors({ origin: allowedOrigins }));
if (process.env.NODE_ENV !== "test") {
    app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
}
app.use(express.json());
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/products", requireAuth, productRoutes);
app.use("/api/categories", requireAuth, categoryRoutes);
app.use("/api/orders", requireAuth, orderRoutes);
app.use("/api/stock-adjustments", requireAuth, stockAdjustmentRoutes);
app.use("/api/users", userRoutes);
// Global JSON error handler — catches anything routes don't handle themselves,
// including Mongoose errors from routes without try/catch.
app.use((err, _req, res, _next) => {
    console.error("[error]", err.message);
    res.status(err.status ?? 500).json({ error: err.message || "Internal server error" });
});
