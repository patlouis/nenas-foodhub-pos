import mongoose from "mongoose";
export async function connectDB(uri) {
    if (!uri) {
        console.warn("[db] MONGO_URI is empty — paste your Atlas string into backend/.env");
        return;
    }
    await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000, // fail fast if Atlas is unreachable
        socketTimeoutMS: 10000,
    });
    console.log("[db] Connected to MongoDB Atlas");
}
