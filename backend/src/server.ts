import "dotenv/config";
import { app } from "./app.js";
import { connectDB } from "./db.js";

// Async failures outside a request never reach the Express error handler, so
// catch them here or they vanish (or kill the process) without a trace.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

const PORT = process.env.PORT || 5000;
try {
  await connectDB(process.env.MONGO_URI);
} catch (err: any) {
  console.error("[db] Connection failed:", err.message);
  console.error("[db] Check your Atlas IP whitelist and MONGO_URI in backend/.env");
  process.exit(1);
}
app.listen(PORT, () => console.log(`[server] API running on http://localhost:${PORT}`));
