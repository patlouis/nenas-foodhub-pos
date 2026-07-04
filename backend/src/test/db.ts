import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

// A single-node replica set (not a plain standalone server) so routes that
// use multi-document transactions work the same in tests as against Atlas.
let replSet: MongoMemoryReplSet | null = null;

export async function connectTestDB() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
}

export async function disconnectTestDB() {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
  replSet = null;
}

// Wipes every collection between tests so they don't leak state into each other.
export async function clearTestDB() {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany({}))
  );
}
