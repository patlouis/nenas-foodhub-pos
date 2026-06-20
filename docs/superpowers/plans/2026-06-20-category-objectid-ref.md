# Category ObjectId Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `Product.category` (plain string name) with a Mongoose `ObjectId` reference to `Category`, so product-category links survive renames without cascades.

**Architecture:** Change the Mongoose field type and Zod validator in the backend, update both route handlers (filter cast + aggregate sort for categories), run a one-time migration script to convert existing string data to ObjectIds, then update the two frontend pages that resolve category names from the loaded category list.

**Tech Stack:** Node 20, TypeScript (ESM, `.js` extensions on imports), Mongoose 9, Zod 4, Express 5, Vitest + mongodb-memory-server + supertest (backend tests), React 19 + Vite (frontend, no component tests).

## Global Constraints

- All backend imports use `.js` extension even for `.ts` source files (ESM project).
- Run all backend commands via `wsl -d Ubuntu -- bash -c "cd /home/patlouis/Projects/pos-example/backend && <cmd>"`.
- Run all frontend commands via `wsl -d Ubuntu -- bash -c "cd /home/patlouis/Projects/pos-example/frontend && <cmd>"`.
- Backend test command: `npm test` (runs `vitest run`).
- Backend typecheck: `npm run typecheck`.
- The `connectDB` helper is in `src/db.ts`; env var is `MONGO_URI` (loaded from `backend/.env` via `dotenv/config`).
- Test helpers live in `src/test/`: `connectTestDB`, `disconnectTestDB`, `clearTestDB` (from `db.ts`), `loginAs` (from `helpers.ts`).
- Never use `beforeEach(clearTestDB)` — it wipes users created in `beforeAll`. Use `afterEach(clearTestDB)` so each test starts clean and creates its own user via `loginAs`.

---

## File Map

| File | Action |
|---|---|
| `backend/src/models/Product.ts` | Modify — ObjectId ref |
| `backend/src/schemas/products.ts` | Modify — ObjectId regex validation |
| `backend/src/routes/products.ts` | Modify — cast filter, aggregate sort |
| `backend/src/routes/products.test.ts` | Create — category validation + filter tests |
| `backend/src/routes/categories.ts` | Modify — remove cascade, fix productCount |
| `backend/src/routes/categories.test.ts` | Create — productCount test |
| `backend/scripts/migrate-category-ids.ts` | Create — one-time migration |
| `frontend/src/pages/ProductsPage.tsx` | Modify — catMap + selects keyed by `_id` |
| `frontend/src/pages/OrderPage.tsx` | Modify — catOrder + chips keyed by `_id` |

---

### Task 1: Product model + Zod schema (TDD)

**Files:**
- Modify: `backend/src/models/Product.ts`
- Modify: `backend/src/schemas/products.ts`
- Create: `backend/src/routes/products.test.ts`

**Interfaces:**
- Produces: `IProduct.category?: mongoose.Types.ObjectId`, validation regex `/^[a-f\d]{24}$/i`

- [ ] **Step 1: Write the failing test**

Create `backend/src/routes/products.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import Category from "../models/Category.js";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../test/db.js";
import { loginAs } from "../test/helpers.js";

describe("POST /api/products — category field", () => {
  beforeAll(connectTestDB);
  afterAll(disconnectTestDB);
  afterEach(clearTestDB);

  it("accepts a valid ObjectId as category", async () => {
    const { token } = await loginAs("admin");
    const cat = await Category.create({ name: "Beverages", color: "#0000ff" });

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Cola", price: 50, category: cat._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.category).toBe(cat._id.toString());
  });

  it("rejects a category value that is not a valid ObjectId", async () => {
    const { token } = await loginAs("admin");

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Cola", price: 50, category: "Beverages" });

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
wsl -d Ubuntu -- bash -c "cd /home/patlouis/Projects/pos-example/backend && npm test -- --reporter=verbose src/routes/products.test.ts"
```

Expected: both tests fail — the second test passes `"Beverages"` and gets 201 (not 400), because the current schema accepts any string.

- [ ] **Step 3: Update the Product model**

Replace `backend/src/models/Product.ts` entirely:

```typescript
import mongoose from "mongoose";

export interface IProduct {
  name: string;
  sku?: string;
  price: number;
  stock: number;
  category?: mongoose.Types.ObjectId;
  status: "active" | "disabled";
  discountQty?: number | null;
  discountPrice?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const productSchema = new mongoose.Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, trim: true, unique: true, sparse: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    discountQty: { type: Number, default: null, min: 2 },
    discountPrice: { type: Number, default: null, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<IProduct>("Product", productSchema);
```

- [ ] **Step 4: Update the Zod validation schema**

In `backend/src/schemas/products.ts`, change the `category` field in `createProductSchema` and the `category` field in `listProductsQuerySchema` to validate ObjectId format:

```typescript
import { z } from "zod";
import { paginationQuerySchema } from "./pagination.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid category ID");

export const createProductSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  sku: z.string().trim().optional(),
  price: z.number().min(0, "Price must be 0 or greater"),
  stock: z.number().int().min(0, "Stock must be 0 or greater").optional(),
  category: objectId.optional(),
  status: z.enum(["active", "disabled"]).optional(),
  discountQty: z.number().int().min(2, "discountQty must be at least 2").nullable().optional(),
  discountPrice: z.number().min(0, "discountPrice must be 0 or greater").nullable().optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const adjustStockSchema = z.object({
  delta: z
    .number()
    .int("delta must be a non-zero integer")
    .refine((d) => d !== 0, "delta must be a non-zero integer"),
});

export const listProductsQuerySchema = paginationQuerySchema(500).extend({
  q: z.string().trim().optional(),
  category: objectId.optional(),
  sortKey: z.enum(["name", "sku", "price", "stock", "category"]).optional().default("category"),
  sortDir: z.enum(["asc", "desc"]).optional().default("asc"),
});
```

- [ ] **Step 5: Run the test — expect PASS**

```
wsl -d Ubuntu -- bash -c "cd /home/patlouis/Projects/pos-example/backend && npm test -- --reporter=verbose src/routes/products.test.ts"
```

Expected: both tests pass.

- [ ] **Step 6: Typecheck**

```
wsl -d Ubuntu -- bash -c "cd /home/patlouis/Projects/pos-example/backend && npm run typecheck"
```

Expected: no errors.

- [ ] **Step 7: Commit**

```
git add backend/src/models/Product.ts backend/src/schemas/products.ts backend/src/routes/products.test.ts
git commit -m "feat: change product.category to ObjectId ref and add validation"
```

---

### Task 2: Categories route — remove cascade, fix productCount (TDD)

**Files:**
- Modify: `backend/src/routes/categories.ts`
- Create: `backend/src/routes/categories.test.ts`

**Interfaces:**
- Consumes: `IProduct.category` is now `ObjectId` (from Task 1)
- Produces: `GET /api/categories` returns correct `productCount` when products reference category by `_id`

- [ ] **Step 1: Write the failing test**

Create `backend/src/routes/categories.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import Category from "../models/Category.js";
import Product from "../models/Product.js";
import { connectTestDB, disconnectTestDB, clearTestDB } from "../test/db.js";
import { loginAs } from "../test/helpers.js";

describe("GET /api/categories — productCount via ObjectId", () => {
  beforeAll(connectTestDB);
  afterAll(disconnectTestDB);
  afterEach(clearTestDB);

  it("counts products whose category ObjectId matches the category _id", async () => {
    const { token } = await loginAs("cashier");
    const cat = await Category.create({ name: "Snacks", color: "#ff0000" });
    await Product.create({ name: "Chips", price: 30, category: cat._id });
    await Product.create({ name: "Nuts",  price: 45, category: cat._id });

    const res = await request(app)
      .get("/api/categories")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const found = res.body.find((c: { name: string }) => c.name === "Snacks");
    expect(found?.productCount).toBe(2);
  });

  it("shows 0 productCount for a category with no products", async () => {
    const { token } = await loginAs("cashier");
    await Category.create({ name: "Empty", color: "#aaaaaa" });

    const res = await request(app)
      .get("/api/categories")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const found = res.body.find((c: { name: string }) => c.name === "Empty");
    expect(found?.productCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
wsl -d Ubuntu -- bash -c "cd /home/patlouis/Projects/pos-example/backend && npm test -- --reporter=verbose src/routes/categories.test.ts"
```

Expected: first test fails — productCount comes back 0 instead of 2, because the Map is currently keyed by name but `$group._id` is now an ObjectId.

- [ ] **Step 3: Update categories route**

Replace `backend/src/routes/categories.ts` entirely:

```typescript
import { Router, type Request, type Response, type NextFunction } from "express";
import Category from "../models/Category.js";
import Product from "../models/Product.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { createCategorySchema, updateCategorySchema, reorderSchema } from "../schemas/categories.js";

const router = Router();

// GET /api/categories — list all (any authenticated user)
router.get("/", requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [categories, counts] = await Promise.all([
      Category.find().sort({ order: 1, name: 1 }).lean(),
      Product.aggregate([
        { $match: { category: { $exists: true, $ne: null } } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
    ]);

    const countById = new Map(counts.map((c) => [c._id.toString(), c.count]));
    res.json(
      categories.map((c) => ({
        ...c,
        productCount: countById.get(c._id.toString()) ?? 0,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// PUT /api/categories/reorder — persist display order (admin only)
// Must be defined before PUT /:id so "reorder" isn't treated as a Mongo ObjectId.
router.put("/reorder", requireAuth, requireAdmin, validateBody(reorderSchema), async (req: Request, res: Response) => {
  const { items } = req.body;
  await Promise.all(
    items.map(({ id, order }: { id: string; order: number }) => Category.findByIdAndUpdate(id, { order }))
  );
  res.json({ ok: true });
});

// POST /api/categories — create (admin only)
router.post("/", requireAuth, requireAdmin, validateBody(createCategorySchema), async (req: Request, res: Response) => {
  try {
    const count = await Category.countDocuments();
    const category = await Category.create({
      name: req.body.name,
      color: req.body.color || "#aa3bff",
      order: count,
    });
    res.status(201).json(category);
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "A category with that name already exists" });
    }
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/categories/:id — rename / recolor (admin only)
router.put("/:id", requireAuth, requireAdmin, validateBody(updateCategorySchema), async (req: Request, res: Response) => {
  try {
    const updates: { name?: string; color?: string } = {};
    if (req.body.name  !== undefined) updates.name  = req.body.name;
    if (req.body.color !== undefined) updates.color = req.body.color;
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      updates,
      { returnDocument: "after", runValidators: true }
    );
    if (!category) return res.status(404).json({ error: "Not found" });
    res.json(category);
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "A category with that name already exists" });
    }
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/categories/:id (admin only)
router.delete("/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

export default router;
```

Key changes from the previous version:
- `$match` uses `{ $exists: true, $ne: null }` (no empty-string check — ObjectId can't be `""`)
- `countByName` → `countById`, keyed by `c._id.toString()`
- The PUT `/:id` handler no longer has the `existing` lookup or `Product.updateMany` cascade

- [ ] **Step 4: Run the test — expect PASS**

```
wsl -d Ubuntu -- bash -c "cd /home/patlouis/Projects/pos-example/backend && npm test -- --reporter=verbose src/routes/categories.test.ts"
```

Expected: both tests pass.

- [ ] **Step 5: Run all tests to check for regressions**

```
wsl -d Ubuntu -- bash -c "cd /home/patlouis/Projects/pos-example/backend && npm test"
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```
git add backend/src/routes/categories.ts backend/src/routes/categories.test.ts
git commit -m "feat: fix category productCount to use ObjectId grouping, remove cascade"
```

---

### Task 3: Products route — ObjectId filter cast + aggregate sort (TDD)

**Files:**
- Modify: `backend/src/routes/products.ts`
- Modify: `backend/src/routes/products.test.ts` (add tests)

**Interfaces:**
- Consumes: `IProduct.category` is `ObjectId` (Task 1), `paginate()` from `schemas/pagination.js`
- Produces: `GET /api/products?category=<ObjectId>` returns only matching products; default category sort groups by category drag-order

- [ ] **Step 1: Add failing tests to `backend/src/routes/products.test.ts`**

Append these two `describe` blocks to the existing file:

```typescript
describe("GET /api/products — filter by category ObjectId", () => {
  beforeAll(connectTestDB);
  afterAll(disconnectTestDB);
  afterEach(clearTestDB);

  it("returns only products in the requested category", async () => {
    const { token } = await loginAs("admin");
    const bev = await Category.create({ name: "Beverages", color: "#00f" });
    const snk = await Category.create({ name: "Snacks",    color: "#f00" });
    await Product.create({ name: "Cola",  price: 50, category: bev._id });
    await Product.create({ name: "Chips", price: 30, category: snk._id });

    const res = await request(app)
      .get(`/api/products?category=${bev._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("Cola");
  });

  it("rejects a category query param that is not a valid ObjectId", async () => {
    const { token } = await loginAs("cashier");

    const res = await request(app)
      .get("/api/products?category=not-an-id")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

describe("GET /api/products — category sort uses category order", () => {
  beforeAll(connectTestDB);
  afterAll(disconnectTestDB);
  afterEach(clearTestDB);

  it("sorts products by their category drag-order then by name", async () => {
    const { token } = await loginAs("cashier");
    const bev = await Category.create({ name: "Beverages", color: "#00f", order: 1 });
    const snk = await Category.create({ name: "Snacks",    color: "#f00", order: 0 });
    await Product.create({ name: "Cola",  price: 50, category: bev._id });
    await Product.create({ name: "Chips", price: 30, category: snk._id });

    const res = await request(app)
      .get("/api/products?sortKey=category&sortDir=asc")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    // Snacks has order 0, Beverages has order 1 — Chips should come first
    expect(res.body.data[0].name).toBe("Chips");
    expect(res.body.data[1].name).toBe("Cola");
  });
});
```

- [ ] **Step 2: Run the new tests — expect FAIL**

```
wsl -d Ubuntu -- bash -c "cd /home/patlouis/Projects/pos-example/backend && npm test -- --reporter=verbose src/routes/products.test.ts"
```

Expected: the filter test fails (returns both products — category string isn't cast so `filter.category = "..."` doesn't match an ObjectId in the DB). The sort test may accidentally pass or return wrong order.

- [ ] **Step 3: Update the products route**

Replace `backend/src/routes/products.ts` entirely:

```typescript
import { Router, type Request, type Response, type NextFunction } from "express";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { createProductSchema, updateProductSchema, adjustStockSchema, listProductsQuerySchema } from "../schemas/products.js";
import { paginate } from "../schemas/pagination.js";

const router = Router();

// GET /api/products — paginated list (any authenticated user).
// ?q= searches name/SKU, ?category= filters by category ObjectId, ?page=&limit= page through results.
router.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = listProductsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
    }
    const { page, limit, q, category, sortKey, sortDir } = parsed.data;

    const filter: Record<string, unknown> = {};
    if (category) filter.category = new mongoose.Types.ObjectId(category);
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: re }, { sku: re }];
    }

    const dir = sortDir === "asc" ? 1 : -1;

    if (sortKey === "category") {
      // Sort by the category's drag-order field, then category name, then product name.
      // Requires a $lookup; use $facet to get both page data and total in one round-trip.
      const pipeline: mongoose.PipelineStage[] = [
        { $match: filter },
        {
          $lookup: {
            from: "categories",
            localField: "category",
            foreignField: "_id",
            as: "_cat",
          },
        },
        {
          $addFields: {
            _catOrder: { $ifNull: [{ $arrayElemAt: ["$_cat.order", 0] }, 9999] },
            _catName:  { $ifNull: [{ $arrayElemAt: ["$_cat.name",  0] }, "zzz"] },
          },
        },
        { $sort: { _catOrder: dir, _catName: dir, name: 1 } },
        {
          $facet: {
            data:  [{ $skip: (page - 1) * limit }, { $limit: limit }],
            total: [{ $count: "count" }],
          },
        },
      ];
      const [result] = await Product.aggregate(pipeline);
      const items = (result?.data ?? []) as unknown[];
      const total = (result?.total?.[0]?.count ?? 0) as number;
      return res.json(paginate(items, page, limit, total));
    }

    const sort: Record<string, 1 | -1> = { [sortKey]: dir };
    const [products, total] = await Promise.all([
      Product.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
      Product.countDocuments(filter),
    ]);
    res.json(paginate(products, page, limit, total));
  } catch (err) {
    next(err);
  }
});

// POST /api/products — create (admin only)
router.post("/", requireAuth, requireAdmin, validateBody(createProductSchema), async (req: Request, res: Response) => {
  try {
    const data = { ...req.body };
    if (!data.sku) data.sku = undefined;
    const product = await Product.create(data);
    res.status(201).json(product);
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "A product with that SKU already exists" });
    }
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/products/:id — update (admin only)
router.put("/:id", requireAuth, requireAdmin, validateBody(updateProductSchema), async (req: Request, res: Response) => {
  try {
    const data = { ...req.body };
    if (!data.sku) data.sku = undefined;
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      data,
      { returnDocument: "after", runValidators: true }
    );
    if (!product) return res.status(404).json({ error: "Not found" });
    res.json(product);
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "A product with that SKU already exists" });
    }
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/products/:id/stock — adjust stock (admin only)
router.patch("/:id/stock", requireAuth, requireAdmin, validateBody(adjustStockSchema), async (req: Request, res: Response) => {
  try {
    const { delta } = req.body;
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, ...(delta < 0 ? { stock: { $gte: -delta } } : {}) },
      { $inc: { stock: delta } },
      { returnDocument: "after" }
    );
    if (!product) {
      return res.status(delta < 0 ? 409 : 404).json({
        error: delta < 0 ? "Not enough stock to remove that many units" : "Product not found",
      });
    }
    res.json(product);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/products/:id (admin only)
router.delete("/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

export default router;
```

- [ ] **Step 4: Run all tests — expect PASS**

```
wsl -d Ubuntu -- bash -c "cd /home/patlouis/Projects/pos-example/backend && npm test -- --reporter=verbose"
```

Expected: all tests pass.

- [ ] **Step 5: Typecheck**

```
wsl -d Ubuntu -- bash -c "cd /home/patlouis/Projects/pos-example/backend && npm run typecheck"
```

Expected: no errors.

- [ ] **Step 6: Commit**

```
git add backend/src/routes/products.ts backend/src/routes/products.test.ts
git commit -m "feat: cast category filter to ObjectId, use aggregate sort by category order"
```

---

### Task 4: Migration script — convert existing products from string to ObjectId

**Files:**
- Create: `backend/scripts/migrate-category-ids.ts`

**Interfaces:**
- Consumes: `MONGO_URI` env var, `connectDB` from `src/db.ts`, `Category` and `Product` models
- Produces: all products in the live DB that have `category` stored as a BSON string are updated to the corresponding `ObjectId`

- [ ] **Step 1: Create the scripts directory and write the migration**

```
wsl -d Ubuntu -- bash -c "mkdir -p /home/patlouis/Projects/pos-example/backend/scripts"
```

Create `backend/scripts/migrate-category-ids.ts`:

```typescript
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
  // After the schema change, Mongoose writes ObjectIds; old docs retain string type.
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

  await Product.bulkWrite(ops as mongoose.mongo.AnyBulkWriteOperation[]);
  console.log(`Done: ${matched} converted to ObjectId, ${unmatched} cleared.`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the migration against the live database**

Make sure `backend/.env` has `MONGO_URI` set (it should already be set for the running app).

```
wsl -d Ubuntu -- bash -c "cd /home/patlouis/Projects/pos-example/backend && npx tsx scripts/migrate-category-ids.ts"
```

Expected output (example):
```
[db] Connected to MongoDB Atlas
Loaded 5 categories.
Found 42 products to migrate.
Done: 42 converted to ObjectId, 0 cleared.
```

- [ ] **Step 3: Verify idempotency — run again, expect "Nothing to migrate"**

```
wsl -d Ubuntu -- bash -c "cd /home/patlouis/Projects/pos-example/backend && npx tsx scripts/migrate-category-ids.ts"
```

Expected:
```
[db] Connected to MongoDB Atlas
Loaded 5 categories.
Found 0 products to migrate.
Nothing to migrate.
```

- [ ] **Step 4: Commit**

```
git add backend/scripts/migrate-category-ids.ts
git commit -m "feat: add one-time migration script to convert product.category strings to ObjectIds"
```

---

### Task 5: Frontend — ProductsPage

**Files:**
- Modify: `frontend/src/pages/ProductsPage.tsx`

**Interfaces:**
- Consumes: `Product.category` is now an ObjectId string; `Category._id` is used as the key for all maps and select values

- [ ] **Step 1: Update `catMap` to key by `_id` instead of `name`**

In `frontend/src/pages/ProductsPage.tsx`, find line 108:
```typescript
const catMap = new Map(categories.map((c) => [c.name, c]))
```
Change to:
```typescript
const catMap = new Map(categories.map((c) => [c._id, c]))
```

- [ ] **Step 2: Update the category filter `<select>` option value**

Find the category filter select (around line 217). Change:
```tsx
<option key={c._id} value={c.name}>{c.name}</option>
```
To:
```tsx
<option key={c._id} value={c._id}>{c.name}</option>
```

- [ ] **Step 3: Update the category form `<select>` option value**

Find the category form select inside the Add/Edit modal (around line 369). Change:
```tsx
<option key={c._id} value={c.name}>{c.name}</option>
```
To:
```tsx
<option key={c._id} value={c._id}>{c.name}</option>
```

- [ ] **Step 4: Typecheck**

```
wsl -d Ubuntu -- bash -c "cd /home/patlouis/Projects/pos-example/frontend && npx tsc --noEmit"
```

Expected: no errors.

- [ ] **Step 5: Commit**

```
git add frontend/src/pages/ProductsPage.tsx
git commit -m "feat: key product category map and selects by _id instead of name"
```

---

### Task 6: Frontend — OrderPage

**Files:**
- Modify: `frontend/src/pages/OrderPage.tsx`

**Interfaces:**
- Consumes: `Product.category` is an ObjectId string; `Category._id` used for all matching

- [ ] **Step 1: Update `catOrder` map to key by `_id`**

In `frontend/src/pages/OrderPage.tsx`, find line 84:
```typescript
const catOrder = new Map(categories.map((c) => [c.name, c.order ?? 0]))
```
Change to:
```typescript
const catOrder = new Map(categories.map((c) => [c._id, c.order ?? 0]))
```

- [ ] **Step 2: Update category chip `active` and `onClick` to use `_id`**

Find the chip render in the category filter row (around line 175):
```tsx
<Chip key={c._id} active={category === c.name} onClick={() => { setCategory(c.name); setQuery("") }} color={c.color}>
```
Change to:
```tsx
<Chip key={c._id} active={category === c._id} onClick={() => { setCategory(c._id); setQuery("") }} color={c.color}>
```

- [ ] **Step 3: Fix the empty-state text that prints the raw category ID**

Find (around line 188):
```tsx
: category
? `No products in ${category}.`
```
Change to:
```tsx
: category
? `No products in ${categories.find((c) => c._id === category)?.name ?? category}.`
```

- [ ] **Step 4: Typecheck**

```
wsl -d Ubuntu -- bash -c "cd /home/patlouis/Projects/pos-example/frontend && npx tsc --noEmit"
```

Expected: no errors.

- [ ] **Step 5: Commit**

```
git add frontend/src/pages/OrderPage.tsx
git commit -m "feat: key category chips and sort map by _id in OrderPage"
```

---

## Post-Implementation Verification

After all tasks are committed, start the backend and frontend and manually verify:

1. **Products page** — open the category filter dropdown. Categories should display correctly (names visible, not IDs).
2. **Add a product** — select a category from the dropdown and save. The product row should show the category name and color dot.
3. **Rename a category** (Categories page) — go back to Products. The renamed category should appear on previously categorised products without any extra step.
4. **Order page** — category chips filter correctly. Products appear under the right category chip. The sort order matches the drag order from the Categories page.
5. **Product count** — after renaming a category, the product count shown on the Categories page should still be correct.
