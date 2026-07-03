# Nenas FoodHub POS

A point-of-sale web app for Nenas FoodHub, with a React frontend and an Express/MongoDB backend. Supports products, categories, orders, stock adjustments, expenses, and user auth.

## Structure

- `backend/` — Express + TypeScript API, MongoDB via Mongoose, JWT auth, Zod validation
- `frontend/` — React 19 + TypeScript + Vite + Tailwind CSS

## Getting Started

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Scripts

Both `backend` and `frontend` expose:

- `npm run dev` — start in development mode
- `npm test` — run tests (Vitest)

Backend additionally has `npm run typecheck`; frontend additionally has `npm run build`, `npm run lint`, and `npm run preview`.

## License

See [LICENSE](LICENSE).
