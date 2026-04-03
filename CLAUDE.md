# Pulse — CLAUDE.md

## Project overview

Pulse is a personal health tracker: food/drink recipes, nutrition logging, workout tracking, and goal dashboards. It is a full-stack TypeScript monorepo deployed on AWS EC2 + S3.

## Monorepo structure

```
apps/
  server/          Express API (Node + TypeScript)
  web/             React SPA (Vite + Tailwind)
  mobile/          Android app (Expo SDK 55, React Native)
packages/
  api-client/      Shared types and API client (used by web and server)
```

npm workspaces — install from the root: `npm install`
**Note**: `apps/mobile` is NOT in the root workspace. Install its deps separately: `cd apps/mobile && npm install`

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

Mobile (Android emulator — start emulator in Android Studio first):
```
cd apps/mobile && npx expo start
# then press 'a' to open in emulator
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
| Frontend (web) | React 18, React Router v6, Zustand, Tailwind CSS v3, Recharts |
| Mobile | Expo SDK 55, React Native 0.83, expo-router, Zustand + expo-secure-store, StyleSheet (not NativeWind) |
| Backend | Express 4, mysql2, bcryptjs, jsonwebtoken, Zod |
| Storage | MySQL, AWS S3 (recipe photos) |
| Auth | JWT — web: token in Zustand; mobile: token in expo-secure-store (key: `pulse-auth`) |
| Build | Vite (web), tsc (server), EAS (mobile) |

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
/food?sub=main|side|breakfast|dessert|prepackaged → filtered subcategory
/drinks                → Library (cocktails)
/nutrition/today       → TodayPage
/nutrition/history     → NutritionHistoryPage
/nutrition/foods       → FoodsPage
/workouts              → WorkoutsPage
/workouts/exercises    → ExercisesPage
/workouts/exercises/:id → ExerciseDetailPage
/workouts/routines     → RoutinesPage
/workouts/routines/:id → RoutineDetailPage
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
                       GET  /api/recipes/search?q=        search food-type recipes with calories
                       GET  /api/recipes/barcode/:barcode look up recipe by barcode (user-scoped)
                       GET  /api/recipes/:id/barcode      get barcode for recipe
                       PUT  /api/recipes/:id/barcode      set/upsert barcode (409 on conflict)
                       DELETE /api/recipes/:id/barcode    remove barcode
/api/tags/*
/api/links/*
/api/foods/*           USDA food search + custom foods
/api/log/*             Nutrition log (meals, water)
                       POST /api/log/recipe               log a recipe to nutrition (creates shadow food if needed)
/api/goals/*           Nutrition + exercise goals, weekly summary
/api/water/*
/api/history/*         Nutrition history charts
/api/workouts/*        Workout sessions + exercises + sets (includes ?routineId filter on GET /)
/api/exercises/*       Exercise library CRUD — GET /, GET /:id, POST / (custom), PUT /:id (any), DELETE /:id (custom only), GET /:id/stats, GET /:id/history, GET /categories
/api/routines/*        Saved workout routines CRUD + start (POST /:id/start creates workout from routine)
/api/measurements/*    Body measurements CRUD + goals (weight, waist, bicep, …)
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
| `RecipeForm` | `apps/web/src/components/RecipeForm.tsx` | Grouped pill picker for tags (Health/Cuisine/Category). Pulls from `tag_definitions` table — no free-text entry. Accepts `initialType` prop. Food-type recipes show a barcode field (optional); saved to `recipe_barcodes` on submit. |
| `FoodSearchModal` | `apps/web/src/components/FoodSearchModal.tsx` | Searches recipes (`GET /recipes/search`) + foods in parallel. "My Recipes" section at top. Selecting a recipe opens a servings picker that logs via `POST /log/recipe`. Accepts `onCreateCustomFood` prop; if provided, "Create custom food" calls it instead of the inline create flow. |
| `SettingsPage` | `apps/web/src/pages/SettingsPage.tsx` | Default Sort (persisted in Zustand `settingsStore`), Tag Definitions editor, Color Scheme, username/password, danger zone. |
| `GoalsPage` | `apps/web/src/pages/GoalsPage.tsx` | Nutrition goals + history charts + workout goals (weekly progress bars). |
| `TodayPage` | `apps/web/src/pages/TodayPage.tsx` | Daily nutrition log with date nav, summary card, history charts, meal sections. "Create Custom Food" opens `RecipeForm` in a modal overlay (initialType="food"). `FoodSearchModal` passes `onCreateCustomFood` to bridge the two flows. |
| `WorkoutsPage` | `apps/web/src/pages/WorkoutsPage.tsx` | Renamed "Progress" in nav. Three tabs: **Week** (summary ring, progress bars, 4 stat tiles, 13-week charts), **Body** (body measurements card), **Records** (personal bests). "Edit Goals" modal edits exercise goals + body measurement goals (with target dates). Workout history moved to RecipeHistory. |
| `WorkoutDetailPage` | `apps/web/src/pages/WorkoutDetailPage.tsx` | Active workout session — add/remove exercises, log sets (weight in lbs, converted to kg for storage). Timer (started_at from DB), running volume total, set checkboxes, exercise name links to ExerciseDetailPage. Weight column hidden when `exercise.trackWeight = false`. |
| `ExercisesPage` | `apps/web/src/pages/ExercisesPage.tsx` | Library-style grid. Cards use `cover_image_url` (static image) or category emoji fallback. Edit modal has fields for cover image, how-to media (YouTube/GIF/image), muscle diagram image, primary/secondary muscles (tag chips), instructions, notes, and a Track Weight toggle. Delete only for custom exercises. |
| `ExerciseDetailPage` | `apps/web/src/pages/ExerciseDetailPage.tsx` | Header has Edit button opening an inline modal (same fields as ExercisesPage edit). Notes displayed below tab bar. 3 tabs: Summary (personal bests, set records, progress chart), History (paginated sessions), How To (how-to media embed, muscle diagram image or placeholder, muscle tags, instructions). |
| `RoutinesPage` | `apps/web/src/pages/RoutinesPage.tsx` | Library-style grid (matches food/drinks). Cards use a stat block image area (exercise count + notes). Create modal. Clicking navigates to RoutineDetailPage. |
| `RoutineDetailPage` | `apps/web/src/pages/RoutineDetailPage.tsx` | Routine editor — editable name, volume BarChart, exercise blocks with template sets (blur-save), last-performed sets as reference, Start Routine button. |

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
| `recipe_barcodes` | `barcode` VARCHAR(64) PK, `recipe_id` INT UNSIGNED (FK → recipes.id CASCADE), `created_at` — maps a barcode to a food-type recipe; one barcode per recipe |

### Nutrition
| Table | Key columns |
|---|---|
| `foods` | `id`, `name`, `brand`, `source` (custom/open_food_facts/usda), `calories_per100`, `carbs_per100`, `protein_per100`, `fat_per100`, `is_custom`, `recipe_id` INT NULL (FK → recipes.id, identifies shadow foods) |
| `serving_sizes` | `id`, `food_id`, `label`, `grams`, `is_default` |
| `food_log` | `id`, `user_id`, `log_date`, `meal` (breakfast/lunch/dinner/snack), `food_id`, `serving_size_id`, `quantity`, `calories`, `carbs_g`, `protein_g`, `fat_g`, `dram_recipe_id` (nullable, links to recipes) |
| `user_goals` | `id`, `user_id`, `calories`, `carbs_g`, `protein_g`, `fat_g`, `water_goal_oz`, `effective_from` |
| `water_log` | `id`, `user_id`, `log_date`, `amount_oz` |
| `meal_templates` | `id`, `user_id`, `name` |
| `meal_template_items` | `id`, `template_id`, `food_id`, `serving_size_id`, `quantity`, `sort_order` |
| `barcode_cache` | `barcode`, `food_id`, `fetched_at` |

### Workouts
| Table | Key columns |
|---|---|
| `exercises` | `id`, `name`, `category`, `exercise_type` (weight/cardio/bodyweight/duration), `muscles_primary` (JSON), `muscles_secondary` (JSON), `is_custom`, `instructions` TEXT NULL, `media_url` VARCHAR(500) NULL, `cover_image_url` VARCHAR(500) NULL, `muscle_image_url` VARCHAR(500) NULL, `notes` TEXT NULL, `track_weight` TINYINT(1) DEFAULT 1 |
| `workout_logs` | `id`, `user_id`, `workout_date`, `name`, `duration_minutes`, `calories_burned`, `started_at` TIMESTAMP NULL, `routine_id` INT NULL (FK to workout_routines) |
| `workout_routines` | `id`, `user_id`, `name`, `notes`, `created_at`, `updated_at` |
| `routine_exercises` | `id`, `routine_id`, `exercise_id`, `sort_order`, `notes` |
| `routine_exercise_sets` | `id`, `routine_exercise_id`, `set_number`, `reps`, `weight_kg`, `duration_seconds`, `distance_meters` |
| `workout_exercises` | `id`, `workout_log_id`, `exercise_id`, `sort_order` |
| `exercise_sets` | `id`, `workout_exercise_id`, `set_number`, `reps`, `weight_kg`, `duration_seconds`, `distance_meters` |
| `exercise_goals` | `id`, `user_id`, `workouts_per_week`, `minutes_per_week`, `calories_per_week`, `volume_lbs_per_week`, `effective_from` |
| `body_measurements` | `id`, `user_id`, `metric` (weight/waist/bicep/…), `value` DECIMAL, `unit`, `measured_at` DATE, `notes` |
| `body_measurement_goals` | `id`, `user_id`, `metric`, `target_value`, `unit`, `target_date` DATE — UNIQUE on (user_id, metric) |

### Links
| Table | Key columns |
|---|---|
| `links` | `id`, `user_id`, `url`, `title`, `favicon_url`, `created_at` |

## Mobile app (apps/mobile)

Android-only Expo app. Key conventions:

- **Styling**: Use `StyleSheet.create()` — NOT NativeWind/Tailwind classes (NativeWind is installed but not used in practice)
- **Theme**: Colors + font sizes from `src/theme.ts` (`colors.bg`, `colors.card`, `colors.accent`, `colors.border`, `colors.text`, `colors.muted`)
- **API client**: `src/api/client.ts` — fetch-based, token passed explicitly. `API_BASE` from `src/api/config.ts` (defaults to `http://10.0.2.2:3000` for Android emulator; override via `EXPO_PUBLIC_API_BASE`)
- **Auth store**: `src/store/auth.ts` — Zustand + expo-secure-store, key `pulse-auth`
- **Routing**: expo-router file-based. Tab screens in `app/(app)/`. Hidden routes (modals/detail) use `href: null` in `_layout.tsx`
- **Weights**: Same as web — stored kg, displayed lbs. `KG_TO_LBS = 2.20462`

### Mobile tab structure
| Tab | File | Notes |
|---|---|---|
| Recipes | `app/(app)/index.tsx` | Existing library grid |
| Nutrition | `app/(app)/nutrition.tsx` | Date nav, meal sections, food search modal (recipes + foods), barcode scanner (expo-camera), water quick-add |
| Workouts | `app/(app)/workouts.tsx` | List + Start button |
| Goals | `app/(app)/goals.tsx` | Read-only calorie/macro/workout progress bars |
| Settings | `app/(app)/settings.tsx` | Nav to History + Links; data management |

Hidden routes: `recipe/[id]`, `recipe/edit`, `workout/[id]`, `history`, `links`

### Mobile key files
| File | Notes |
|---|---|
| `app/(app)/workout/[id].tsx` | Active session — timer (startedAt from DB), set input rows (lbs→kg), exercise picker modal |
| `src/api/client.ts` | All API functions — recipe, nutrition log, water, goals, workouts, exercises, food search |
| `src/api/config.ts` | `API_BASE` — use `10.0.2.2:3000` for emulator, LAN IP for physical device |

## Design decisions

- **Tags**: Stored in `tag_definitions` (user-scoped, 3 categories: health/cuisine/category). Auto-seeded with defaults on first `GET /api/tags/definitions`. Tag filter only shows tags used by actual recipes on the current page type (food vs cocktail).
- **`food_log.dram_recipe_id`**: Added via `ALTER TABLE` in migration 009 post-hook — links a nutrition log entry back to the originating recipe.
- **Sidebar icons**: Intentionally removed from desktop nav; mobile bottom nav keeps icons.
- **Default sort**: Stored in Zustand `settingsStore` (persisted to localStorage), applied to Library on mount.
- **Theming**: CSS variables as bare RGB channels in `index.css`; Tailwind uses `rgb(var(--color-X) / alpha)`. Always use `dram-*` palette, not hardcoded colors.
- **Nutrition components**: `NutritionSummaryCard` and `NutritionHistoryCharts` are shared between TodayPage and GoalsPage. Water quick-add only shows when `onAddWater` prop is passed.
- **Workout weights**: All weights stored in kg in DB (`weight_kg`, `total_volume_kg`). WorkoutsPage and WorkoutDetailPage display/accept in lbs using `KG_TO_LBS = 2.20462`. Always convert at the UI boundary.
- **Exercise goals secondary sort**: `ORDER BY effective_from DESC, id DESC LIMIT 1` — the secondary `id DESC` is critical to avoid returning an old row with NULL `volume_lbs_per_week` when multiple rows share the same `effective_from` date.
- **Migration 006**: `006_body_measurements.sql` creates `body_measurements` and `body_measurement_goals`. The `volume_lbs_per_week` column on `exercise_goals` is added via a post-migration hook in `migrate.ts` (checks `information_schema` first — MySQL < 8 doesn't support `ADD COLUMN IF NOT EXISTS`).
- **Migration 007**: `007_workout_routines.sql` creates `workout_routines`, `routine_exercises`, `routine_exercise_sets`. The `started_at` and `routine_id` columns on `workout_logs` were added manually via `ALTER TABLE` (not in the migration file).
- **Migration 008**: `008_exercise_fields.sql` adds `instructions` and `media_url` columns to `exercises` via post-migration hook in `migrate.ts`.
- **Migration 009**: `009_recipe_nutrition_bridge.sql` creates `recipe_barcodes` table. The `foods.recipe_id` FK column and `food_log.dram_recipe_id` column are added via post-migration hooks in `migrate.ts` (MySQL <8 `ADD COLUMN IF NOT EXISTS` workaround).
- **Migration 011**: `011_exercise_extended_fields.sql` adds `cover_image_url`, `muscle_image_url`, `notes`, and `track_weight` columns to `exercises` via post-migration hook. `muscle_image_url` must be run manually on EC2 (`ALTER TABLE exercises ADD COLUMN muscle_image_url VARCHAR(500) NULL; ALTER TABLE exercises ADD COLUMN track_weight TINYINT(1) NOT NULL DEFAULT 1;`) since migration 011 was already marked applied before these columns were added.
- **Shadow food pattern**: Logging a recipe to nutrition auto-upserts a `foods` row (`source='custom'`, `recipe_id=<recipe.id>`) storing per-serving macros as `calories_per100` etc. (treating 1 serving = 100 virtual grams). A "1 serving" `serving_sizes` row (100g) is also upserted. The `food_log.quantity` field then equals the number of servings. Logic lives in `upsertRecipeNutritionLog()` exported from `apps/server/src/routes/recipes.ts` and shared by both `POST /recipes/:id/log` and `POST /log/recipe`.
- **Recipe barcode scanning (mobile)**: `expo-camera` (CameraView) is used in `nutrition.tsx`. On scan, checks `recipe_barcodes` first via `GET /api/recipes/barcode/:barcode`, then `barcode_cache` foods via `GET /api/foods/barcode/:barcode`. Routes to recipe-servings picker or food-servings picker accordingly. Camera permission declared in `app.json` plugin config.
- **Exercise PUT**: `PUT /api/exercises/:id` updates any exercise (not just custom). Accepts `name`, `category`, `exerciseType`, `musclesPrimary`, `musclesSecondary`, `instructions`, `mediaUrl`, `coverImageUrl`, `muscleImageUrl`, `notes`, `trackWeight`.
- **Exercise media fields**: `cover_image_url` = static image shown on the library card. `media_url` = how-to demo (YouTube embed, GIF, or image) shown on How To tab. `muscle_image_url` = muscle diagram image shown on How To tab (falls back to emoji placeholder with muscle list). `GET /exercises` and `GET /exercises/:id` both return all fields including `instructions` and `mediaUrl` — the list endpoint was intentionally updated to return full data so the edit modal doesn't need a separate fetch (though `openEdit` in ExercisesPage still calls `getOne` as a safety fallback).
- **Exercise trackWeight**: `track_weight` TINYINT (default 1). When false, the weight column is hidden in `WorkoutDetailPage` set rows. Both the workout detail fetch and the add-exercise response include this field from the exercises JOIN.
- **Sidebar sub-nav**: Workouts section expands to show "Log", "Routines", and "Exercises" when active.
- **Routine start pre-fill priority**: `POST /api/routines/:id/start` pre-fills sets from the user's last actual session for each exercise; falls back to template sets from `routine_exercise_sets` if no prior history exists. All pre-filled sets have `completed = 0`.
- **Exercise stats**: `GET /api/exercises/:id/stats?metric=` supports 5 metrics: `heaviest_weight`, `one_rep_max` (Epley formula: `weight * (1 + reps/30)` computed in SQL), `best_set_volume`, `session_volume`, `total_reps`. Returns personal bests + set records table + progress series.
- **Workout timer**: `started_at` is persisted in DB (survives page refresh). `POST /api/workouts/:id/start-timer` is idempotent (only sets if NULL). "Finish" computes `durationMinutes = ceil(elapsedSeconds / 60)` and saves via the existing update endpoint.
- **Sidebar sub-nav**: Workouts section expands to show "Log" (`/workouts`), "Routines" (`/workouts/routines`), and "Exercises" (`/workouts/exercises`) when active, matching the Food sub-nav pattern.
