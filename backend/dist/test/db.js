import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
let mongod = null;
export async function connectTestDB() {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
}
export async function disconnectTestDB() {
    await mongoose.disconnect();
    if (mongod)
        await mongod.stop();
    mongod = null;
}
// Wipes every collection between tests so they don't leak state into each other.
export async function clearTestDB() {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}
