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

## Key component responsibilities

| Component | Location | Notes |
|---|---|---|
| `Layout` | `apps/web/src/components/Layout.tsx` | Desktop sidebar + mobile bottom nav. Sidebar nav has **no icons** (by design). Mobile keeps icons. |
| `NutritionSummaryCard` | `apps/web/src/components/NutritionSummaryCard.tsx` | Calorie ring, macro rings, water bar. Shared by TodayPage + GoalsPage. `onAddWater` prop optional — omit on GoalsPage. |
| `NutritionHistoryCharts` | `apps/web/src/components/NutritionHistoryCharts.tsx` | 30-day scrollable bar charts (calories + protein). Shared by TodayPage + GoalsPage. Fetches its own data via `historyApi.daily()`. |
| `Library` | `apps/web/src/pages/Library.tsx` | Food and Drinks recipe grid. Filter state is URL-driven (`?sub=main` etc.). Tags scoped to current user + page type (food vs cocktail). |
| `RecipeForm` | `apps/web/src/components/RecipeForm.tsx` | Grouped pill picker for tags (Health/Cuisine/Category). Pulls from `tag_definitions` table — no free-text entry. |
| `SettingsPage` | `apps/web/src/pages/SettingsPage.tsx` | Default Sort (persisted in Zustand `settingsStore`), Tag Definitions editor, Color Scheme, username/password, danger zone. |
| `GoalsPage` | `apps/web/src/pages/GoalsPage.tsx` | Nutrition goals + history charts + workout goals (weekly progress bars). |
| `TodayPage` | `apps/web/src/pages/TodayPage.tsx` | Daily nutrition log with date nav, summary card, history charts, meal sections. |

## Database schema

All tables are MySQL InnoDB, utf8mb4. User-scoped tables have `user_id INT UNSIGNED NOT NULL` with FK to `users.id`.

### Auth
| Table | Key columns |
|---|---|
| `users` | `id`, `username`, `password_hash`, `email`, `created_at` |
| `invite_tokens` | `id`, `token_hash`, `created_by`, `used_at`, `expires_at` |

### Recipes
| Table | Key columns |
|---|---|
| `recipes` | `id`, `user_id`, `type` (food/cocktail), `name`, `subcategory`, `photo_key`, `is_favorite`, `prep_time`, `cook_time`, `servings`, `calories`, `carbs_g`, `protein_g`, `fat_g` |
| `recipe_ingredients` | `recipe_id`, `ingredient_id`, `quantity`, `unit`, `sort_order` |
| `recipe_steps` | `recipe_id`, `step_number`, `instruction` |
| `recipe_log` | `id`, `recipe_id`, `user_id`, `made_at` |
| `ingredients` | `id`, `name`, `category` |
| `tags` | `id`, `name` (global, not user-scoped) |
| `recipe_tags` | `recipe_id`, `tag_id` |
| `tag_definitions` | `id`, `user_id`, `name`, `category` (ENUM: health/cuisine/category) — per-user predefined tag lists; seeded with defaults on first GET |

### Nutrition
| Table | Key columns |
|---|---|
| `foods` | `id`, `name`, `brand`, `source` (custom/open_food_facts/usda), `calories_per100`, `carbs_per100`, `protein_per100`, `fat_per100`, `is_custom` |
| `serving_sizes` | `id`, `food_id`, `label`, `grams`, `is_default` |
| `food_log` | `id`, `user_id`, `log_date`, `meal` (breakfast/lunch/dinner/snack), `food_id`, `serving_size_id`, `quantity`, `calories`, `carbs_g`, `protein_g`, `fat_g`, `dram_recipe_id` (nullable, links to recipes) |
| `user_goals` | `id`, `user_id`, `calories`, `carbs_g`, `protein_g`, `fat_g`, `water_goal_ml`, `effective_from` |
| `water_log` | `id`, `user_id`, `log_date`, `amount_ml` |
| `meal_templates` | `id`, `user_id`, `name` |
| `meal_template_items` | `id`, `template_id`, `food_id`, `serving_size_id`, `quantity`, `sort_order` |
| `barcode_cache` | `barcode`, `food_id`, `fetched_at` |

### Workouts
| Table | Key columns |
|---|---|
| `exercises` | `id`, `name`, `category`, `exercise_type` (weight/cardio/bodyweight/duration), `muscles_primary` (JSON), `is_custom` |
| `workout_logs` | `id`, `user_id`, `workout_date`, `name`, `duration_minutes`, `calories_burned` |
| `workout_exercises` | `id`, `workout_log_id`, `exercise_id`, `sort_order` |
| `exercise_sets` | `id`, `workout_exercise_id`, `set_number`, `reps`, `weight_kg`, `duration_seconds`, `distance_meters` |
| `exercise_goals` | `id`, `user_id`, `workouts_per_week`, `minutes_per_week`, `calories_per_week`, `effective_from` |

### Links
| Table | Key columns |
|---|---|
| `links` | `id`, `user_id`, `url`, `title`, `favicon_url`, `created_at` |

## Design decisions

- **Tags**: Stored in `tag_definitions` (user-scoped, 3 categories: health/cuisine/category). Auto-seeded with defaults on first `GET /api/tags/definitions`. Tag filter only shows tags used by actual recipes on the current page type (food vs cocktail).
- **`food_log.dram_recipe_id`**: Added via `ALTER TABLE` (not in a migration file yet) — allows logging a recipe as a meal entry.
- **Sidebar icons**: Intentionally removed from desktop nav; mobile bottom nav keeps icons.
- **Default sort**: Stored in Zustand `settingsStore` (persisted to localStorage), applied to Library on mount.
- **Theming**: CSS variables as bare RGB channels in `index.css`; Tailwind uses `rgb(var(--color-X) / alpha)`. Always use `dram-*` palette, not hardcoded colors.
- **Nutrition components**: `NutritionSummaryCard` and `NutritionHistoryCharts` are shared between TodayPage and GoalsPage. Water quick-add only shows when `onAddWater` prop is passed.
