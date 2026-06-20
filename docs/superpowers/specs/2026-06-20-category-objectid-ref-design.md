# Design: Product Category as ObjectId Reference

**Date:** 2026-06-20  
**Status:** Approved

## Problem

`Product.category` is stored as a plain string (the category name). Renaming a category leaves all products pointing to the old name, causing a data drift bug.

## Goal

Change `Product.category` to a Mongoose `ObjectId` reference to the `Category` collection so that category identity is stable across renames.

---

## Architecture

### Backend — Model

`backend/src/models/Product.ts`

- `category` field: `String` → `{ type: Schema.Types.ObjectId, ref: "Category" }`
- `IProduct` interface: `category?: string` → `category?: mongoose.Types.ObjectId`

### Backend — Validation Schema

`backend/src/schemas/products.ts`

- `category` Zod field: `z.string().trim().optional()` → `z.string().regex(/^[a-f\d]{24}$/i, "Invalid category ID").optional()`
- `listProductsQuerySchema` `category` field: same regex change (the `?category=` query param now accepts an ObjectId string, not a name)

### Backend — Products Route

`backend/src/routes/products.ts`

**Category filter** (`GET /api/products?category=<id>`):  
Cast the string param to ObjectId before querying:
```ts
if (category) filter.category = new mongoose.Types.ObjectId(category)
```

**Category sort** (`sortKey === "category"`):  
Sorting by raw ObjectId hex is meaningless for UX. When this sort key is active, switch from `Product.find()` to an aggregation pipeline with:
1. `$match` — apply filters
2. `$lookup` — join `categories` on `_id`
3. `$addFields` — expose `categoryOrder` (falls back to 9999 if uncategorised)
4. `$sort` — by `categoryOrder dir`, then `name asc`
5. `$facet` — split into `data` (skip + limit) and `total` (count)

All other sort keys keep the existing `Product.find().sort()` path.

### Backend — Categories Route

`backend/src/routes/categories.ts`

**Remove cascade update** (introduced as a workaround yesterday) from `PUT /:id` — no longer needed.

**Product count aggregation** (`GET /api/categories`):  
The pipeline already groups by `$category`; no pipeline change needed. The join from count results to category documents changes from matching by `c.name` to matching by `c._id`:
```ts
// was: countByName.get(c.name)
// now: countById.get(c._id.toString())
```
(where the aggregate `_id` will now be an ObjectId, so `.toString()` is needed for the Map key.)

### Backend — Migration Script

`backend/scripts/migrate-category-ids.ts` (new file)

One-time script, safe to re-run:
1. Connect to MongoDB using the same env config as the app
2. Load all categories into `Map<name, ObjectId>`
3. Fetch all products where `category` is a non-null string in BSON (`{ category: { $type: "string" } }`) — this is the precise filter for unmigrated rows, since after the schema change Mongoose will write ObjectIds but old documents retain BSON string type
4. For each product: look up the ObjectId by name, set `category` to ObjectId (or `undefined` if no match)
5. Bulk-write via `updateMany` or individual `updateOne` calls
6. Log a summary: matched / updated / unmatched

Run with: `npx ts-node --esm backend/scripts/migrate-category-ids.ts`

---

## Frontend

### `frontend/src/types.ts`

No change required — `Product.category?: string` still describes the wire format (Mongoose serialises ObjectId → hex string in JSON).

### `frontend/src/pages/ProductsPage.tsx`

| Location | Before | After |
|---|---|---|
| `catMap` construction | keyed by `c.name` | keyed by `c._id` |
| Category filter `<select>` option value | `c.name` | `c._id` |
| Category form `<select>` option value | `c.name` | `c._id` |
| `openEdit` category init | `p.category ?? ""` | unchanged (now holds ID string) |

### `frontend/src/pages/OrderPage.tsx`

| Location | Before | After |
|---|---|---|
| `catOrder` map | keyed by `c.name` | keyed by `c._id` |
| Category chip `active` check | `category === c.name` | `category === c._id` |
| Category chip `onClick` | `setCategory(c.name)` | `setCategory(c._id)` |
| Empty-state text `"No products in ${category}"` | prints ID | look up `categories.find(c => c._id === category)?.name ?? category` |

---

## Data Flow After Refactor

```
Frontend                     Backend                  DB
  |                            |                       |
  |  POST /api/products        |                       |
  |  { category: "<ObjectId>" }|                       |
  |--------------------------->|                       |
  |                            | Product.create(...)   |
  |                            |---------------------->|
  |                            |   category: ObjectId  |
  |                            |                       |
  |  GET /api/categories       |                       |
  |--------------------------->|  aggregate + count    |
  |                            |  group by category    |
  |                            |  (ObjectId)           |
  |  [{ _id, name, color,      |                       |
  |     productCount }]        |                       |
  |<---------------------------|                       |
  |                            |                       |
  |  GET /api/products         |                       |
  |  ?category=<ObjectId>      |                       |
  |--------------------------->|  filter.category =    |
  |                            |  new ObjectId(id)     |
  |  [{ ..., category: "<id>", |                       |
  |     ... }]                 |                       |
  |<---------------------------|                       |
  |                            |                       |
  | resolve name/color locally |                       |
  | via catMap keyed by _id    |                       |
```

---

## Error Handling

- Invalid ObjectId string in `?category=` query param: Zod regex rejects it with 400 before it reaches Mongoose.
- Product with no matching category name during migration: set `category` to `undefined`, log the product ID and unmatched name.
- Category deleted after products are assigned: products retain the dangling ObjectId. The frontend's `catMap.get(id)` returns `undefined`, which the existing `cat ? ... : "—"` fallback already handles correctly.

---

## Files Changed

| File | Type |
|---|---|
| `backend/src/models/Product.ts` | Modified |
| `backend/src/schemas/products.ts` | Modified |
| `backend/src/routes/products.ts` | Modified |
| `backend/src/routes/categories.ts` | Modified |
| `backend/scripts/migrate-category-ids.ts` | New |
| `frontend/src/pages/ProductsPage.tsx` | Modified |
| `frontend/src/pages/OrderPage.tsx` | Modified |
