# Pulse — CLAUDE.md

## Project overview

Pulse is a personal health tracker: food/drink recipes, nutrition logging, workout tracking, and goal dashboards. It is a full-stack TypeScript monorepo deployed on AWS EC2 + S3.

## Monorepo structure

```
apps/
  server/          Express API (Node + TypeScript)
  web/             React SPA (Vite + Tailwind)
packages/
  api-client/      Shared types and API client (used by web and server)
```

npm workspaces — install from the root: `npm install`

## Dev commands

Run both server and web in parallel:
```
npm run dev
```

Or individually:
```
npm run dev --workspace=apps/server
npm run dev --workspace=apps/web
```

Production build:
```
npm run build
```

Run DB migrations:
```
npm run migrate --workspace=apps/server
```

## Tech stack

| Layer | Stack |
|---|---|
| Frontend | React 18, React Router v6, Zustand, Tailwind CSS v3, Recharts |
| Backend | Express 4, mysql2, bcryptjs, jsonwebtoken, Zod |
| Storage | MySQL, AWS S3 (recipe photos) |
| Auth | JWT — token stored in Zustand, passed as `Authorization: Bearer` |
| Build | Vite (web), tsc (server) |

## Environment variables (apps/server/.env)

```
DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
JWT_SECRET          (min 32 chars)
PORT                (default 3000)
CORS_ORIGIN         (comma-separated, e.g. http://localhost:5173)
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET   (optional, for photo uploads)
ANTHROPIC_API_KEY   (optional, for AI features)
USDA_API_KEY        (optional, food database)
```

## Key conventions

### Frontend

- **Routing**: React Router v6, all routes defined in `apps/web/src/App.tsx`. Base path is `/pulse` in prod, `/` in dev.
- **State**: Zustand stores in `apps/web/src/store/`. Auth token lives in `authStore`. UI settings (color scheme, sort) live in `settingsStore` (persisted to localStorage as `dram-settings`).
- **API calls**: All in `apps/web/src/api/client.ts`. Functions take `token` as first arg and throw on non-2xx.
- **Theming**: CSS variables defined in `apps/web/src/index.css` as RGB channels (not hex). Tailwind config references them via `rgb(var(--color-X) / <alpha-value>)`. Theme applied by setting `document.documentElement.dataset.theme` in `App.tsx`. Current themes: `blue` (default), `slate`.
- **Color palette**: `dram-bg`, `dram-card`, `dram-accent`, `dram-border` — always use these, not hardcoded colors, so theming works.
- **Layout**: `Layout.tsx` renders the sidebar (desktop) and bottom nav (mobile). Pages render inside `<Outlet />`. Pages should use `flex flex-col h-full overflow-hidden` for full-height layouts, or `max-w-2xl mx-auto px-4 py-6` for centered content pages.
- **URL-driven state**: The Food/Drinks library uses URL params (`?sub=main` etc.) for category filtering rather than component state, so the sidebar can control it via navigation.

### Backend

- **Auth middleware**: `requireAuth` in `apps/server/src/middleware/auth.ts` — adds `req.userId` to request.
- **DB**: MySQL pool imported from `apps/server/src/config/database.ts` as `{ pool }`. Use `pool.execute()` for queries.
- **Migrations**: SQL files in `apps/server/src/db/migrations/`, run in order by `migrate.ts`. Add new migrations as `00N_description.sql`.
- **Route structure**: Each domain has its own route file. All protected routes use `requireAuth` middleware mounted in `index.ts`.
- **Passwords**: bcryptjs, 10 rounds. Always verify current password before allowing username/password changes.

## Route map (frontend)

```
/food                  → Library (food items)
/food?sub=main|side|breakfast|dessert → filtered subcategory
/drinks                → Library (cocktails)
/nutrition/today       → TodayPage
/nutrition/history     → NutritionHistoryPage
/nutrition/foods       → FoodsPage
/workouts              → WorkoutsPage
/workouts/:id          → WorkoutDetailPage
/goals                 → GoalsPage
/history               → RecipeHistory
/links                 → Links
/settings              → SettingsPage
```

## API route map (backend)

```
POST   /api/auth/login
POST   /api/auth/register
POST   /api/auth/invite
PUT    /api/auth/username
PUT    /api/auth/password
DELETE /api/auth/data?scope=recipes|history|workouts|goals|links

/api/recipes/*         CRUD + scrape + cook log
/api/tags/*
/api/links/*
/api/foods/*           USDA food search + custom foods
/api/log/*             Nutrition log (meals, water)
/api/goals/*           Nutrition + exercise goals, weekly summary
/api/water/*
/api/history/*         Nutrition history charts
/api/workouts/*        Workout sessions + exercises + sets
/api/exercises/*       Exercise library + categories
/api/export/*          Excel export
```

## Deployment

CI/CD via GitHub Actions: push to `main` → SSH to EC2 → `git pull` → `npm run build` → `pm2 restart`. Server runs behind nginx. Web build is served as static files at `/pulse` base path.
