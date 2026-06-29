# Expenses — Optional Quantity Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `qty` (positive decimal) field to expenses — stored on the model, validated by Zod, passed through the API, displayed in the table and modal.

**Architecture:** `qty` is informational only; `amount` remains the financial source of truth. Two tasks: (1) backend model + schema + route + tests; (2) frontend type + API client + ExpensesPage UI.

**Tech Stack:** TypeScript, Express, Mongoose, Zod, Vitest + supertest (backend); React, Tailwind CSS (frontend)

## Global Constraints

- `qty` is optional on all layers — never required
- `qty` must be ≥ 0.01 if provided — Zod uses `z.number().min(0.01)`, Mongoose uses `min: 0.01` (aligned exactly, avoiding the `.positive()` vs `min: 0.01` mismatch present on `amount`)
- `qty` is a positive decimal (not integer-only) — `step="any"` in the input
- `qty` does not affect `amount` — amount is entered independently
- All shell commands: `wsl -d Ubuntu -e bash -ic "..."` — never PowerShell/Git Bash for npm/node
- Restart backend after editing `backend/src` files (no hot-reload across WSL boundary)

---

### Task 1: Backend — model, schema, route, tests

**Files:**
- Modify: `backend/src/models/Expense.ts`
- Modify: `backend/src/schemas/expenses.ts`
- Modify: `backend/src/routes/expenses.ts`
- Modify: `backend/src/routes/expenses.test.ts`

**Interfaces:**
- Produces: `IExpense.qty?: number` — consumed by Task 2 (frontend type must mirror this)
- Produces: `createExpenseSchema` with optional `qty` — consumed by POST handler

- [ ] **Step 1: Add `qty` to the Expense model**

In `backend/src/models/Expense.ts`, add `qty?: number` to the `IExpense` interface after `note`:

```typescript
export interface IExpense extends Document {
  amount: number;
  category: ExpenseCategory;
  note?: string;
  qty?: number;
  date: Date;
  loggedBy: mongoose.Types.ObjectId;
  loggedByName: string;
  voided: boolean;
  voidedAt?: Date;
  voidedBy?: mongoose.Types.ObjectId;
  voidedByName?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

And add `qty` to the schema after `note`:

```typescript
const expenseSchema = new mongoose.Schema<IExpense>(
  {
    amount: { type: Number, required: true, min: 0.01 },
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
    note: { type: String, maxlength: 200 },
    qty: { type: Number, min: 0.01 },
    date: { type: Date, required: true },
    loggedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    loggedByName: { type: String, required: true },
    voided: { type: Boolean, default: false },
    voidedAt: { type: Date },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    voidedByName: { type: String },
  },
  { timestamps: true }
);
```

- [ ] **Step 2: Add `qty` to the Zod schema**

In `backend/src/schemas/expenses.ts`, add `qty` to `createExpenseSchema` after `note`:

```typescript
export const createExpenseSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0"),
  category: z.enum(EXPENSE_CATEGORIES),
  note: z.string().trim().max(200, "Note must be 200 characters or fewer").optional(),
  qty: z.number().min(0.01, "Quantity must be at least 0.01").optional(),
  date: z.string().optional(),
});
```

- [ ] **Step 3: Write failing tests**

Add three tests to the `describe("POST /api/expenses", ...)` block in `backend/src/routes/expenses.test.ts`, after the existing tests:

```typescript
it("creates an expense with qty", async () => {
  const { token } = await loginAs("admin");
  const res = await request(app)
    .post("/api/expenses")
    .set("Authorization", `Bearer ${token}`)
    .send({ amount: 500, category: "supplies", qty: 3 });

  expect(res.status).toBe(201);
  expect(res.body.qty).toBe(3);
});

it("creates an expense with fractional qty", async () => {
  const { token } = await loginAs("admin");
  const res = await request(app)
    .post("/api/expenses")
    .set("Authorization", `Bearer ${token}`)
    .send({ amount: 200, category: "supplies", qty: 1.5 });

  expect(res.status).toBe(201);
  expect(res.body.qty).toBe(1.5);
});

it("rejects qty less than 0.01", async () => {
  const { token } = await loginAs("admin");
  const res = await request(app)
    .post("/api/expenses")
    .set("Authorization", `Bearer ${token}`)
    .send({ amount: 500, category: "supplies", qty: 0 });

  expect(res.status).toBe(400);
});
```

- [ ] **Step 4: Run tests — verify they fail**

```bash
wsl -d Ubuntu -e bash -ic "cd /home/patlouis/Projects/pos-example/backend && npx vitest run src/routes/expenses.test.ts"
```

Expected: the 3 new tests fail (qty not yet handled in route).

- [ ] **Step 5: Pass `qty` through the POST route handler**

In `backend/src/routes/expenses.ts`, update the POST handler to destructure and pass `qty`:

```typescript
router.post("/", requireAuth, requireAdmin, validateBody(createExpenseSchema), async (req: Request, res: Response) => {
  try {
    const { amount, category, note, qty, date } = req.body;
    const expense = await Expense.create({
      amount,
      category,
      note: note || undefined,
      qty: qty ?? undefined,
      date: date ? new Date(date) : new Date(),
      loggedBy: req.user!.sub,
      loggedByName: req.user!.name,
    });
    res.status(201).json(expense);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
```

- [ ] **Step 6: Run tests — verify all pass**

```bash
wsl -d Ubuntu -e bash -ic "cd /home/patlouis/Projects/pos-example/backend && npx vitest run src/routes/expenses.test.ts"
```

Expected: all 22 tests pass (19 existing + 3 new).

- [ ] **Step 7: Run full suite — no regressions**

```bash
wsl -d Ubuntu -e bash -ic "cd /home/patlouis/Projects/pos-example/backend && npm test"
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
wsl -d Ubuntu -e bash -ic "git -C /home/patlouis/Projects/pos-example add backend/src/models/Expense.ts backend/src/schemas/expenses.ts backend/src/routes/expenses.ts backend/src/routes/expenses.test.ts && git -C /home/patlouis/Projects/pos-example commit -m 'feat: add optional qty field to Expense model and API'"
```

---

### Task 2: Frontend — type, API client, ExpensesPage UI

**Files:**
- Modify: `frontend/src/types/expense.ts`
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/pages/ExpensesPage.tsx`

**Interfaces:**
- Consumes: `IExpense.qty?: number` from Task 1 (backend now returns qty on expense documents)

- [ ] **Step 1: Add `qty` to the frontend Expense type**

In `frontend/src/types/expense.ts`, add `qty?: number` to the `Expense` interface after `note`:

```typescript
export interface Expense {
  _id: string;
  amount: number;
  category: ExpenseCategory;
  note?: string;
  qty?: number;
  date: string;
  loggedByName: string;
  voided: boolean;
  voidedAt?: string;
  voidedByName?: string;
  createdAt: string;
}
```

- [ ] **Step 2: Add `qty` to the `expensesApi.create` params**

In `frontend/src/api.ts`, update the `create` method signature to include `qty`:

```typescript
create: (data: { amount: number; category: string; note?: string; qty?: number; date?: string }) =>
  watchedFetch(EXPENSES, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(data),
  }).then(handle<Expense>),
```

- [ ] **Step 3: Add `addQty` state to ExpensesPage**

In `frontend/src/pages/ExpensesPage.tsx`, add the `addQty` state after the `addAmount` state (line 90):

```typescript
const [addAmount, setAddAmount] = useState("")
const [addQty, setAddQty] = useState("")
```

- [ ] **Step 4: Reset `addQty` in `openAdd`**

Update the `openAdd` function to reset `addQty`:

```typescript
function openAdd() {
  setAddCat("rent")
  setAddNote("")
  setAddAmount("")
  setAddQty("")
  setAddDate(toDateStr(new Date()))
  setAddError(null)
  setAddOpen(true)
}
```

- [ ] **Step 5: Parse and pass `qty` in `handleAdd`**

Replace the existing `handleAdd` function:

```typescript
async function handleAdd() {
  const amount = Number(addAmount)
  if (!addAmount.trim() || isNaN(amount) || amount <= 0) {
    setAddError("Enter a valid amount greater than 0")
    return
  }
  const qty = addQty.trim() ? Number(addQty) : undefined
  if (qty !== undefined && (isNaN(qty) || qty < 0.01)) {
    setAddError("Quantity must be at least 0.01")
    return
  }
  setAdding(true)
  setAddError(null)
  try {
    await expensesApi.create({
      amount,
      category: addCat,
      note: addNote.trim() || undefined,
      qty,
      date: addDate || undefined,
    })
    setAddOpen(false)
    load()
  } catch (err) {
    setAddError(err instanceof Error ? err.message : "Failed to add expense")
  } finally {
    setAdding(false)
  }
}
```

- [ ] **Step 6: Add Qty input to the Add Expense modal**

In the modal's JSX, insert a Qty field between the Amount label block and the Date label block (after the closing `</label>` for Amount at line 420, before the Date `<label>`):

```tsx
<label className={fieldLabelCls}>
  Qty <span className="text-xs font-normal text-[var(--text)]">(optional)</span>
  <input
    type="number" min="0.01" step="any"
    value={addQty}
    onChange={(e) => setAddQty(e.target.value)}
    placeholder="e.g. 3, 1.5"
    className={inputCls}
  />
</label>
```

The full modal field order after this change: Category → Amount (₱) → Qty (optional) → Date → Note (optional).

- [ ] **Step 7: Add Qty column to the desktop table**

In the `<thead>`, add a Qty header after the Category `<SortTh>` (after line 335):

```tsx
<SortTh label="Category" col="category" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
<th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-[var(--text)]">Qty</th>
<th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-[var(--text)]">Note</th>
```

In the `<tbody>` row, add a Qty cell after the Category `<td>` (after the closing `</td>` of the category cell, around line 357):

```tsx
<td className="px-4 py-3 tabular-nums text-[var(--text)]">
  {exp.qty ?? "—"}
</td>
```

- [ ] **Step 8: Add qty to mobile cards**

In the mobile card, add qty display after the note line (after line 305):

```tsx
{exp.note && <p className="mt-0.5 text-xs text-[var(--text)]">{exp.note}</p>}
{exp.qty !== undefined && <p className="mt-0.5 text-xs text-[var(--text)]">Qty: {exp.qty}</p>}
```

- [ ] **Step 9: Typecheck**

```bash
wsl -d Ubuntu -e bash -ic "cd /home/patlouis/Projects/pos-example/frontend && npx tsc --noEmit"
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
wsl -d Ubuntu -e bash -ic "git -C /home/patlouis/Projects/pos-example add frontend/src/types/expense.ts frontend/src/api.ts frontend/src/pages/ExpensesPage.tsx && git -C /home/patlouis/Projects/pos-example commit -m 'feat: add optional qty field to Expenses UI'"
```
