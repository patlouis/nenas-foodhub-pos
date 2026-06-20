import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/db.js";
import Category from "../src/models/Category.js";
import Product from "../src/models/Product.js";

async function migrate() {
  await connectDB(process.env.MONGO_URI);

  const categories = await Category.find({}).lean();
  const nameToId = new Map(categories.map((c) => [c.name, c._id]));
  console.log(`Loaded ${categories.length} categories.`);

  // $type: "string" targets only documents where category is still a BSON string.
  // After the schema change Mongoose writes ObjectIds; old docs retain string type.
  const products = await Product.find({ category: { $type: "string" } }).lean();
  console.log(`Found ${products.length} products to migrate.`);

  if (products.length === 0) {
    console.log("Nothing to migrate.");
    await mongoose.disconnect();
    return;
  }

  let matched = 0;
  let unmatched = 0;

  const ops = products.map((p) => {
    const catName = p.category as unknown as string;
    const catId = nameToId.get(catName);
    if (catId) {
      matched++;
      return {
        updateOne: {
          filter: { _id: p._id },
          update: { $set: { category: catId } },
        },
      };
    } else {
      unmatched++;
      console.warn(`  [unmatched] "${p.name}" (${p._id}) had category="${catName}" — no matching category, clearing.`);
      return {
        updateOne: {
          filter: { _id: p._id },
          update: { $unset: { category: "" } },
        },
      };
    }
  });

  await Product.bulkWrite(ops as Parameters<typeof Product.bulkWrite>[0]);
  console.log(`Done: ${matched} converted to ObjectId, ${unmatched} cleared.`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
