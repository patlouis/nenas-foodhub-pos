import mongoose from "mongoose";

export async function connectDB(uri: string | undefined) {
  if (!uri) {
    console.warn("[db] MONGO_URI is empty — paste your Atlas string into backend/.env");
    return;
  }
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    // Mongoose 9 / MongoDB driver v6 enables TCP keep-alive automatically
  });
  console.log("[db] Connected to MongoDB Atlas");
}
