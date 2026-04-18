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
  api-client/      Shared types, API client, and utility functions (used by web, mobile, and server)
  theme/           Color palette source of truth (used by web + mobile)
```

npm workspaces — install from the root: `npm install`
All packages including `apps/mobile` are in the root workspace. A single `npm install` from the root installs everything.

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
npm run dev:mobile
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

## Test commands

Tests live in `testing/` — a standalone folder with its own packages. Each suite runs independently.

```
# Server (Jest + ts-jest) — unit tests for services
cd testing/server && npm test

# Web (Vitest + jsdom) — component + store tests
cd testing/web && npm test

# Mobile (Jest + @react-native/jest-preset) — store + hook tests
cd testing/mobile && npm test
```

Note: `testing/mobile` has its own `node_modules` (isolated from root `testing/`). Run `npm install` inside it if cloning fresh. See `.plans/TestingInfrastructure.md` for full setup details.

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
ANTHROPIC_API_KEY   (optional, for AI features — tried first)
GEMINI_API_KEY      (optional, Gemini fallback when Anthropic fails/quota exhausted)
USDA_API_KEY        (optional, food database)
```

## Key conventions

### Frontend

- **Routing**: React Router v6, all routes defined in `apps/web/src/App.tsx`. Base path is `/pulse` in prod, `/` in dev.
- **State**: Zustand stores in `apps/web/src/store/`. Auth token lives in `authStore`. UI settings (color scheme, sort) live in `settingsStore` (persisted to localStorage as `dram-settings`).
- **API calls**: All in `apps/web/src/api/client.ts`. Functions take `token` as first arg and throw on non-2xx.
- **Theming**: CSS variables defined in `apps/web/src/index.css` as RGB channels (not hex). Tailwind config references them via `rgb(var(--color-X) / <alpha-value>)`. Theme applied by setting `document.documentElement.dataset.theme` in `App.tsx`. Current themes: `blue` (default), `slate`, `sand`. `index.css` is a generated artifact — source of truth is `packages/theme/src/index.ts`. To change a color: edit that file, then run `npm run generate-css --workspace=packages/theme`.
- **Color palette**: `dram-bg`, `dram-card`, `dram-accent`, `dram-border`, `dram-muted` — always use these, not hardcoded colors, so theming works. Use `dram-muted` for secondary/subtitle text instead of hardcoded `text-gray-*` or `text-slate-*`.
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
/                      → redirects to /dashboard (home)
/dashboard             → WorkoutsDashboardPage (home — North Star Goals, This Week, Fuel Today, Creatine, Personal Bests)
/food                  → Library (food items — excludes prepackaged)
/food?sub=main|side|breakfast|dessert → filtered subcategory
/food?sub=prepackaged  → Prepackaged recipes (type=prepackaged in DB)
/drinks                → Library (cocktails)
/nutrition/today       → TodayPage
/nutrition/history     → NutritionHistoryPage
/nutrition/foods       → FoodsPage
/workouts              → WorkoutsPage (2 tabs: Routines + Exercises)
/workouts/exercises    → ExercisesPage
/workouts/exercises/:id → ExerciseDetailPage
/workouts/routines     → RoutinesPage
/workouts/routines/:id → RoutineDetailPage
/workouts/:id          → WorkoutDetailPage
/goals                 → (removed; redirects to /food)
/history               → RecipeHistory (4 tabs: Workouts, Nutrition, Measurements, Charts)
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
                       POST /api/recipes/from-barcode     create prepackaged recipe from barcode scan (looks up OFacts, falls back to AI macro estimate)
/api/tags/*
/api/links/*
/api/foods/*           USDA food search + custom foods
/api/log/*             Nutrition log (meals, water)
                       GET  /api/log/history?limit=90     last N days of food log entries grouped by date (per-day totals + per-meal entry list)
                       POST /api/log/recipe               log a recipe to nutrition (creates shadow food if needed)
/api/goals/*           Nutrition + exercise goals, weekly summary
/api/water/*
/api/history/*         Nutrition history charts
/api/workouts/*        Workout sessions + exercises + sets (includes ?routineId filter on GET /)
                       PUT  /api/workouts/:id/exercises/:weId    update workout exercise notes; also syncs notes back to routine_exercises if workout has a routine_id
                       POST /api/workouts/:id/estimate-calories  AI-estimates calories burned, saves to workout_logs.calories_burned
/api/exercises/*       Exercise library CRUD — GET /, GET /:id, POST / (custom), PUT /:id (any), DELETE /:id (custom only), GET /:id/stats, GET /:id/history, GET /categories
/api/routines/*        Saved workout routines CRUD + start (POST /:id/start creates workout from routine)
/api/measurements/*    Body measurements CRUD + goals (weight, waist, bicep, …)
/api/export/*          Excel export — GET /excel?start=&end= returns a 7-sheet .xlsx (Daily Diary, Daily Summary, Weekly Summary, TDEE Breakdown, Workout Log, Body Measurements, Water Log); user-scoped
```

## Deployment

CI/CD via GitHub Actions: push to `main` → SSH to EC2 → `git pull` → `npm run build` → `pm2 restart`. Server runs behind nginx. Web build is served as static files at `/pulse` base path.

## Key component responsibilities

| Component | Location | Notes |
|---|---|---|
| `Layout` | `apps/web/src/components/Layout.tsx` | Desktop sidebar + mobile bottom nav. Sidebar nav has **no icons** (by design). Mobile keeps icons. |
| `NutritionSummaryCard` | `apps/web/src/components/NutritionSummaryCard.tsx` | Calorie ring, macro rings, water bar. Used by TodayPage. `onAddWater` prop optional — omit when no water quick-add is needed. |
| `NutritionHistoryCharts` | `apps/web/src/components/NutritionHistoryCharts.tsx` | 30-day scrollable bar charts (calories + protein). Used by TodayPage. Fetches its own data via `historyApi.daily()`. |
| `Library` | `apps/web/src/pages/Library.tsx` | Food and Drinks recipe grid. Filter state is URL-driven (`?sub=main` etc.). Tags scoped to current user + page type (food vs cocktail). |
| `RecipeForm` | `apps/web/src/components/RecipeForm.tsx` | Grouped pill picker for tags (Health/Cuisine/Category). Pulls from `tag_definitions` table — no free-text entry. Accepts `initialType` prop. Three types: cocktail, food, prepackaged. Food shows subcategory (main/side/breakfast/dessert) + timing + nutrition. Prepackaged shows servings + nutrition + barcode. Cocktail shows glass/ABV + optional nutrition. Barcode saved to `recipe_barcodes` on submit. |
| `FoodSearchModal` | `apps/web/src/components/FoodSearchModal.tsx` | Searches recipes (`GET /recipes/search`) + foods in parallel. "My Recipes" section at top. Selecting a recipe opens a servings picker that logs via `POST /log/recipe`. Accepts `onCreateCustomFood` prop; if provided, "Create custom food" calls it instead of the inline create flow. |
| `SettingsPage` | `apps/web/src/pages/SettingsPage.tsx` | Tabbed layout: **Options** (Color Scheme, Default Sort (Recipes), Default Sort (Exercises), Tags), **Goals** (nutrition daily macros + workout weekly goals + body measurement goals — all in one place), **User** (change username/password), **Delete Data** (danger zone), **Export** (date range pickers + download all data as xlsx). Left-aligned layout matching History/Links pages. |
| `TodayPage` | `apps/web/src/pages/TodayPage.tsx` | Daily nutrition log with date nav, summary card, history charts, meal sections. Toolbar has "Edit Goals" (nutrition goal modal), "Create Custom Food", and "Log Food" buttons. `FoodSearchModal` passes `onCreateCustomFood` to bridge the two flows. |
| `WorkoutsDashboardPage` | `apps/web/src/pages/WorkoutsDashboardPage.tsx` | Home page. Two tabs: **Dashboard** (V3 layout) and **Other** (TodaysBlurb). V3 is a full-width custom SVG dashboard: North Star Goals (weight/waist/bicep pace gauges + sparklines); This Week (workouts + volume progress bars + bar chart); Fuel Today (calorie ring, macro bars, water glasses with +1 glass / +Bottle quick-log, meals by slot, Net vs TDEE); Body Composition (BMI/Body Fat/Muscle Mass cells, waist+bicep pencil-icon quick-log); How You're Trending (Calories vs TDEE + Volume Heatmap in a 50/50 grid; Weight + Protein SVG charts in a 50/50 grid; Weekly Averages full-width); Creatine saturation gauge + Personal Bests. Header toolbar: "Edit Goals" + "+ Start Workout". All data loaded eagerly on mount via `loadV2()`. |
| `WorkoutsPage` | `apps/web/src/pages/WorkoutsPage.tsx` | Two tabs: **Routines** (inline routine grid with ▶ Start button on each card, + New Routine modal), **Exercises** (inline exercise grid with search/filter, + New Exercise modal). Progress dashboard has moved to `/dashboard` (WorkoutsDashboardPage). |
| `WorkoutDetailPage` | `apps/web/src/pages/WorkoutDetailPage.tsx` | Active workout session — add/remove exercises, log sets (weight in lbs, converted to kg for storage). Timer (started_at from DB), running volume total, set checkboxes, exercise name links to ExerciseDetailPage. Set columns rendered dynamically from `exercise.trackedFields`. Duration uses MM:SS input. Date is editable inline (click to open `<input type="date">`, saves on blur/Enter via `workoutsApi.update`). |
| `ExercisesPage` | `apps/web/src/pages/ExercisesPage.tsx` | Library-style grid. Cards use `cover_image_url` (static image) or category emoji fallback. No edit/delete on cards — clicking navigates to detail page. "New Exercise" modal creates with name/category/type only; all other fields edited on detail page. |
| `ExerciseDetailPage` | `apps/web/src/pages/ExerciseDetailPage.tsx` | Full-width 2-column layout (no tabs). Header has Edit + Delete buttons (Edit opens inline modal with all fields; Delete available for all exercises). Left column: notes, demo media, instructions, muscle diagram image (hidden if none uploaded), muscle tags. Right column: summary (personal bests, set records, progress chart) + history (paginated sessions). |
| `RoutinesPage` | `apps/web/src/pages/RoutinesPage.tsx` | Library-style grid (matches food/drinks). Cards show a cover photo (S3, uploaded via pre-signed URL) or stat block fallback. Hover image area → "Change photo" overlay. Info section: name, last-used date + last session volume (lbs), exercise count + notes. Create modal. Clicking navigates to RoutineDetailPage. |
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
| `recipes` | `id`, `user_id`, `type` (food/cocktail/prepackaged), `name`, `subcategory`, `photo_key`, `is_favorite`, `prep_time`, `cook_time`, `servings`, `calories`, `carbs_g`, `protein_g`, `fat_g` |
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
| `exercises` | `id`, `name`, `category`, `exercise_type` (weight/cardio/bodyweight/duration), `muscles_primary` (JSON), `muscles_secondary` (JSON), `is_custom`, `instructions` TEXT NULL, `media_url` VARCHAR(500) NULL, `cover_image_url` VARCHAR(500) NULL, `muscle_image_url` VARCHAR(500) NULL, `notes` TEXT NULL, `tracked_fields` VARCHAR(100) DEFAULT 'reps,weight' (comma-separated: reps/weight/duration/distance) |
| `workout_logs` | `id`, `user_id`, `workout_date`, `name`, `duration_minutes`, `calories_burned`, `started_at` TIMESTAMP NULL, `routine_id` INT NULL (FK to workout_routines), `completed` TINYINT(1) DEFAULT 0 |
| `workout_routines` | `id`, `user_id`, `name`, `notes`, `cover_image_key` VARCHAR(500) NULL, `created_at`, `updated_at` |
| `routine_exercises` | `id`, `routine_id`, `exercise_id`, `sort_order`, `notes` |
| `routine_exercise_sets` | `id`, `routine_exercise_id`, `set_number`, `reps`, `weight_kg`, `duration_seconds`, `distance_meters` |
| `workout_exercises` | `id`, `workout_log_id`, `exercise_id`, `sort_order`, `notes` TEXT NULL |
| `exercise_sets` | `id`, `workout_exercise_id`, `set_number`, `reps`, `weight_kg`, `duration_seconds`, `distance_meters` |
| `exercise_goals` | `id`, `user_id`, `workouts_per_week`, `minutes_per_week`, `calories_per_week`, `volume_lbs_per_week`, `effective_from` |
| `body_measurements` | `id`, `user_id`, `metric` (weight/waist/bicep/…), `value` DECIMAL, `unit`, `measured_at` DATE, `notes` |
| `body_measurement_goals` | `id`, `user_id`, `metric`, `target_value`, `unit`, `target_date` DATE — UNIQUE on (user_id, metric) |

### Links
| Table | Key columns |
|---|---|
| `links` | `id`, `user_id`, `url`, `title`, `favicon_url`, `category` ENUM('food','drinks','nutrition','exercise','other') DEFAULT 'other', `created_at` |

## Mobile app (apps/mobile)

Android-only Expo app. Key conventions:

- **Styling**: Use `StyleSheet.create()` — NOT NativeWind/Tailwind classes (NativeWind is installed but not used in practice)
- **Theme**: Three color schemes (`blue`, `slate`, `sand`). `PALETTES` source of truth lives in `packages/theme/src/index.ts` — `src/theme.ts` re-exports from `@pulse/theme` and adds mobile-only `fontSize`. Use `useColors()` hook (`src/hooks/useColors.ts`) to get the active palette — never import `colors` directly. Pass result `c` to a `makeStyles(c: Colors)` factory function instead of module-level `StyleSheet.create()`, so styles react to scheme changes. Each palette includes `muted` for secondary text.
- **Swipe navigation**: `src/hooks/useSwipeNav.ts` — returns a `PanResponder` for horizontal swipe-left/right navigation. All 5 main tabs use it. Pages with internal tabs (Workouts, Settings) pass their tab list so swipes move through internal tabs first, then fall through to bottom tab navigation at the edges. No looping. Attach via `{...swipe.panHandlers}` on the root `SafeAreaView`.
- **API client**: `src/api/client.ts` — fetch-based, token passed explicitly. `API_BASE` from `src/api/config.ts` (defaults to `http://10.0.2.2:3000` for Android emulator; override via `EXPO_PUBLIC_API_BASE`)
- **Auth store**: `src/store/auth.ts` — Zustand + expo-secure-store, key `pulse-auth`
- **Settings store**: `src/store/settings.ts` — Zustand + expo-secure-store, key `pulse-settings`. Persists `defaultSort` (recipes), `defaultExerciseSort` (`name` or `created_at`), and `colorScheme` (`blue`, `slate`, or `sand`).
- **Routing**: expo-router file-based. Tabs live in `app/(app)/(tabs)/`. `app/(app)/_layout.tsx` is a Stack with `(tabs)` as the first screen and detail screens (`workout/[id]`, `exercise/[id]`, `recipe/[id]`, `recipe/edit`) as sibling Stack.Screens — this gives proper back-navigation to the previous tab screen rather than always going to Recipes. Hidden tab routes (history, goals) use `href: null` in the Tabs layout.
- **Weights**: Same as web — stored kg, displayed lbs. `KG_TO_LBS` imported from `@pulse/api-client`

### Mobile tab structure
| Tab | File | Notes |
|---|---|---|
| Dashboard | `app/(app)/(tabs)/dashboard.tsx` | **First tab (home).** Sections in order: Fuel Today (calories/protein/water progress bars), This Week (volume progress + 13-wk line chart), Last 30 Days (calories/protein/water line charts), Volume Heatmap (13-wk × routine grid), Creatine widget (saturation gauge + phase badge), North Star Goals (weight/waist/bicep pace cards + water-weight callout), Personal Bests, Recent Workouts (last 5, shows routine name). Loads all data via `useFocusEffect`. |
| Recipes | `app/(app)/(tabs)/index.tsx` | 2-col grid, filters, sort. Sort initializes from `settingsStore.defaultSort`. No sign-out button (sign out is in Settings). |
| Nutrition | `app/(app)/(tabs)/nutrition.tsx` | Date nav, 30-day calorie+protein bar charts (scroll to newest), water quick-add (above meal sections), meal sections, food search modal (recipes + foods), barcode scanner (expo-camera). Pull-to-refresh supported. Each meal section's "Add food" row has a barcode icon on the right that skips search and opens the scanner directly. Barcode scan: if food found (not already a recipe), offers "Save as Recipe?" Alert → calls `POST /api/recipes/from-barcode` → navigates to `recipe/edit`. If barcode unknown, prompts for product name via `Alert.prompt` then creates recipe with AI-estimated nutrition. |
| Workouts | `app/(app)/(tabs)/workouts.tsx` | 3 tabs: Routines (default), Exercises, Log. Log tab shows a "Workout in progress" resume banner when a session is incomplete. Log "+" Start button opens a bottom-sheet routine picker — choose a routine or start blank. Routines + Exercises use 2-col image grid matching Recipes page. Tapping a routine navigates to `routine/[id]` detail page. Tapping an exercise navigates to detail page. Progress dashboard has moved to the Dashboard tab. |
| Links | `app/(app)/(tabs)/links.tsx` | Saved links list with category filter chips (All / Food / Drinks / Nutrition / Exercise / Other). |
| Settings | `app/(app)/(tabs)/settings.tsx` | 5 tabs: Options (default sort), Tags (add/delete tags per category), Goals (nutrition/workout/body), User (change username/password), Delete (per-scope danger zone) |

Hidden routes: `recipe/[id]`, `recipe/edit`, `workout/[id]`, `routine/[id]`, `exercise/[id]`, `history`, `goals`

### Mobile key files
| File | Notes |
|---|---|
| `app/(app)/workout/[id].tsx` | Active session — timer (startedAt from DB), set input rows (lbs→kg), set completion checkmarks, running volume total (full number, no abbreviation), exercise picker modal. Date row at top is tappable to edit (YYYY-MM-DD text input, saves on blur/submit). Exercise name is a tappable link to the exercise detail page. Each exercise block has a notes TextInput (saves on blur, syncs back to routine template). Logged set values are tappable for inline editing (TextInput with accent border, saves on blur). |
| `app/(app)/routine/[id].tsx` | Routine detail — editable name, volume line chart (per-session history), exercise blocks with template sets (blur-save), last-performed sets as reference, Start Routine button. Exercise picker modal with search + category filter. |
| `app/(app)/exercise/[id].tsx` | Exercise detail — Summary (PBs, set records, progress), History, How To tabs. Edit button opens sheet modal. Delete button shown for custom exercises only. |
| `src/api/client.ts` | All API functions — recipe, nutrition log, water, goals, workouts, exercises, routines, food search, auth changes, measurement goals, daily history (`getDailyHistory`), personal bests (`getPersonalBests`), body measurements (`getMeasurements`, `addMeasurement`) |
| `src/api/config.ts` | `API_BASE` — use `10.0.2.2:3000` for emulator, LAN IP for physical device |

## Design decisions

- **Shared utilities in api-client**: `packages/api-client/src/utils/` contains shared logic used by both web and mobile to prevent divergence. Four modules: `conversions.ts` (`KG_TO_LBS`, `kgToLbs`, `lbsToKg`, `fmtLbs`), `dates.ts` (`localDateStr`, `getWeekStart` [Monday-based], `shortDate`, `formatDate`), `time.ts` (`secondsToMMSS`, `mmssToSeconds`, `formatElapsed`), `calculations.ts` (`buildWeeklyData`, `computeGoalPace`, `computeCreatineSaturation`, `SATURATION_DAYS`). All exported from `@pulse/api-client` top-level. **Never re-define these inline** — always import from `@pulse/api-client` (web) or `../../../../../packages/api-client/src/index` (mobile, 5 levels up from `app/(app)/(tabs)/`). Tests live in `testing/web/src/__tests__/utils.test.ts`.

- **Prepackaged recipe type**: `prepackaged` is a first-class `type` in the `recipes` table (alongside `food` and `cocktail`). It is NOT a subcategory of food. Web nav shows it as a sub-nav item under "Recipes" (`/food?sub=prepackaged`); Library.tsx sends `type=prepackaged` to the API. Data migration: `UPDATE recipes SET type = 'prepackaged', subcategory = NULL WHERE type = 'food' AND subcategory = 'prepackaged';` — run manually on EC2 (migration 014). `GET /api/recipes/search` (nutrition food picker) includes both `food` and `prepackaged` types.
- **Tags**: Stored in `tag_definitions` (user-scoped, 3 categories: health/cuisine/category). Auto-seeded with defaults on first `GET /api/tags/definitions`. Tag filter only shows tags used by actual recipes on the current page type (food vs cocktail).
- **`food_log.dram_recipe_id`**: Added via `ALTER TABLE` in migration 009 post-hook — links a nutrition log entry back to the originating recipe.
- **Dashboard as home**: `/dashboard` (`WorkoutsDashboardPage`) is the app home page — index redirects there, and it appears first in both the desktop sidebar and mobile tab bar. The Progress tab was removed from WorkoutsPage; all goal/progress content lives in WorkoutsDashboardPage.
- **Sidebar icons**: Intentionally removed from desktop nav; mobile bottom nav keeps icons.
- **Default sort**: Stored in Zustand `settingsStore` (persisted to localStorage), applied to Library on mount.
- **Theming**: CSS variables as bare RGB channels in `index.css` (generated from `packages/theme/src/index.ts`); Tailwind uses `rgb(var(--color-X) / alpha)`. Always use `dram-*` palette, not hardcoded colors.
- **Nutrition components**: `NutritionSummaryCard` and `NutritionHistoryCharts` are used by TodayPage. Water quick-add only shows when `onAddWater` prop is passed.
- **Workout weights**: All weights stored in kg in DB (`weight_kg`, `total_volume_kg`). WorkoutsPage and WorkoutDetailPage display/accept in lbs using `KG_TO_LBS` from `@pulse/api-client`. Always convert at the UI boundary.
- **Exercise goals secondary sort**: `ORDER BY effective_from DESC, id DESC LIMIT 1` — the secondary `id DESC` is critical to avoid returning an old row with NULL `volume_lbs_per_week` when multiple rows share the same `effective_from` date.
- **Migration 006**: `006_body_measurements.sql` creates `body_measurements` and `body_measurement_goals`. The `volume_lbs_per_week` column on `exercise_goals` is added via a post-migration hook in `migrate.ts` (checks `information_schema` first — MySQL < 8 doesn't support `ADD COLUMN IF NOT EXISTS`).
- **Migration 007**: `007_workout_routines.sql` creates `workout_routines`, `routine_exercises`, `routine_exercise_sets`. The `started_at` and `routine_id` columns on `workout_logs` were added manually via `ALTER TABLE` (not in the migration file).
- **Migration 008**: `008_exercise_fields.sql` adds `instructions` and `media_url` columns to `exercises` via post-migration hook in `migrate.ts`.
- **Migration 009**: `009_recipe_nutrition_bridge.sql` creates `recipe_barcodes` table. The `foods.recipe_id` FK column and `food_log.dram_recipe_id` column are added via post-migration hooks in `migrate.ts` (MySQL <8 `ADD COLUMN IF NOT EXISTS` workaround).
- **Migration 011**: `011_exercise_extended_fields.sql` adds `cover_image_url`, `muscle_image_url`, `notes`, and `track_weight` columns to `exercises` via post-migration hook. `muscle_image_url` and `track_weight` were applied manually on EC2 since migration 011 was already marked applied before those columns were added.
- **Migration 016**: `016_exercise_tracked_fields.sql` adds `tracked_fields VARCHAR(100) DEFAULT 'reps,weight'` to `exercises` via post-migration hook. Backfills from `exercise_type` defaults and existing `track_weight` values. Run manually on EC2: `ALTER TABLE exercises ADD COLUMN tracked_fields VARCHAR(100) NOT NULL DEFAULT 'reps,weight'; UPDATE exercises SET tracked_fields = CASE WHEN exercise_type = 'cardio' THEN 'duration,distance' WHEN exercise_type = 'duration' THEN 'duration' WHEN exercise_type = 'bodyweight' THEN 'reps' ELSE 'reps,weight' END; UPDATE exercises SET tracked_fields = REPLACE(REPLACE(tracked_fields, ',weight', ''), 'weight,', '') WHERE track_weight = 0 AND tracked_fields LIKE '%weight%';`
- **Migration 012**: `012_routine_cover_image.sql` adds `cover_image_key VARCHAR(500) NULL` to `workout_routines` via post-migration hook. Column was also applied manually on EC2 (`ALTER TABLE workout_routines ADD COLUMN cover_image_key VARCHAR(500) NULL;`). `POST /api/routines/:id/photo` returns a pre-signed S3 upload URL; client PUTs directly to S3 then calls `PUT /api/routines/:id` with `coverImageKey` to persist. `GET /api/routines` returns `coverImageUrl` (pre-signed get URL), `lastVolumeLbs` (total volume in lbs from the most recent session for that routine), and `lastCaloriesBurned` (calories burned on the most recent session, null if not yet estimated).
- **Migration 013**: `013_links_category.sql` adds `category ENUM('food','drinks','nutrition','exercise','other') NOT NULL DEFAULT 'other'` to `links` via post-migration hook. Applied manually on EC2: `ALTER TABLE links ADD COLUMN category ENUM('food','drinks','nutrition','exercise','other') NOT NULL DEFAULT 'other'; UPDATE links SET category = 'food';`
- **Shadow food pattern**: Logging a recipe to nutrition auto-upserts a `foods` row (`source='custom'`, `recipe_id=<recipe.id>`) storing per-serving macros as `calories_per100` etc. (treating 1 serving = 100 virtual grams). A "1 serving" `serving_sizes` row (100g) is also upserted. The `food_log.quantity` field then equals the number of servings. Logic lives in `upsertRecipeNutritionLog()` exported from `apps/server/src/routes/recipes.ts` and shared by both `POST /recipes/:id/log` and `POST /log/recipe`. Both call sites wrap the operation in a database transaction (getConnection → beginTransaction → commit/rollback → release) so the shadow food upsert and food_log insert are atomic — a partial write cannot leave an orphaned foods row. `upsertRecipeNutritionLog` accepts a `PoolConnection`, not a `Pool`, so the caller always controls the transaction boundary.
- **Recipe barcode scanning (mobile)**: `expo-camera` (CameraView) is used in `nutrition.tsx` (food log scan) and `recipe/edit.tsx` (barcode field scan for prepackaged/food recipes). In the food log, on scan checks `recipe_barcodes` first via `GET /api/recipes/barcode/:barcode`, then `barcode_cache` foods via `GET /api/foods/barcode/:barcode`. In the recipe edit form, the scan populates the barcode text field directly. Camera permission declared in `app.json` plugin config.
- **Exercise PUT**: `PUT /api/exercises/:id` updates any exercise (not just custom). Accepts `name`, `category`, `exerciseType`, `musclesPrimary`, `musclesSecondary`, `instructions`, `mediaUrl`, `coverImageUrl`, `muscleImageUrl`, `notes`, `trackedFields`.
- **Exercise media fields**: `cover_image_url` = static image shown on the library card. `media_url` = how-to demo (YouTube embed, GIF, or image) shown on detail page left column. `muscle_image_url` = muscle diagram image shown on detail page left column — hidden entirely if not set (no placeholder). `GET /exercises` and `GET /exercises/:id` both return all fields including `instructions` and `mediaUrl`.
- **Exercise trackedFields**: `tracked_fields` VARCHAR(100) stores a comma-separated list of which inputs to show per set: `reps`, `weight`, `duration`, `distance`. Defaults per type: weight → `reps,weight`; bodyweight → `reps`; cardio → `duration,distance`; duration → `duration`. User can override any combination (e.g. stairs = `duration,reps`). Both the workout detail fetch and the add-exercise response include this field from the exercises JOIN. Duration is stored as `duration_seconds` (integer) and displayed/entered as MM:SS.
- **Sidebar sub-nav**: Workouts section has no sub-nav items — Routines and Exercises are tabs within WorkoutsPage, not separate sidebar entries.
- **Routine start pre-fill priority**: `POST /api/routines/:id/start` pre-fills sets from the user's last actual session for each exercise; falls back to template sets from `routine_exercise_sets` if no prior history exists. All pre-filled sets have `completed = 0`. Exercise notes from `routine_exercises.notes` are also copied to `workout_exercises.notes` at start time.
- **Exercise notes carry-over**: `workout_exercises.notes` is editable in the active workout screen. On save, `PUT /api/workouts/:id/exercises/:weId` also writes the note back to `routine_exercises` (matched by `routine_id` + `exercise_id`), so the note appears pre-filled the next time the same routine is started.
- **Exercise stats**: `GET /api/exercises/:id/stats?metric=` supports 5 metrics: `heaviest_weight`, `one_rep_max` (Epley formula: `weight * (1 + reps/30)` computed in SQL), `best_set_volume`, `session_volume`, `total_reps`. Returns personal bests + set records table + progress series.
- **Workout timer**: `started_at` is persisted in DB (survives page refresh). `POST /api/workouts/:id/start-timer` is idempotent (only sets if NULL). "Finish" computes `durationMinutes = ceil(elapsedSeconds / 60)` and saves via the existing update endpoint with `completed: true`.
- **Workout completed flag**: `workout_logs.completed` (TINYINT, default 0) controls log visibility. `GET /api/workouts` only returns `completed = 1` rows. `GET /api/workouts/active` returns the user's single in-progress session (or null). Navigating away from a session without finishing leaves it incomplete and resumable. "Cancel Session" deletes the workout row entirely. `POST /api/routines/:id/start` is idempotent — returns the existing incomplete session for that routine if one exists instead of creating a new one.
- **Sidebar sub-nav**: Workouts section has no sub-nav items. Routines (`/workouts/routines`) and Exercises (`/workouts/exercises`) routes still exist for direct linking (e.g. from RoutineDetailPage back-nav), but the primary entry point is the Routines/Exercises tabs in WorkoutsPage.
- **Mobile routing structure**: `app/(app)/_layout.tsx` is a Stack. The `(tabs)` group is the first child; detail screens (`workout/[id]`, `routine/[id]`, `exercise/[id]`, `recipe/[id]`, `recipe/edit`) are sibling `Stack.Screen` entries. This is required for correct back-gesture behavior — if detail screens were inside the Tabs navigator (via `href: null`), back would cycle tabs instead of popping the stack.
- **Mobile home screen**: `app/index.tsx` redirects to `/(app)/(tabs)/dashboard` explicitly (not `/(app)`) — expo-router would otherwise default to the `index` filename (Recipes tab) instead of Dashboard.
- **Mobile bar charts**: Nutrition tab shows 30-day calorie + protein bar charts (`MiniBarChart` in `nutrition.tsx`). Uses explicit pixel width via `useWindowDimensions` (NOT `flex: 1`) because `flex: 1` gives zero width inside a horizontal `ScrollView`. `contentContainerStyle` on the ScrollView carries `flexDirection`, `alignItems`, and `height` — not an inner `View`. Auto-scrolls to newest (rightmost) entry via `onContentSizeChange` + `scrollToEnd`.
- **AI provider pattern**: All AI calls go through `apps/server/src/services/aiProvider.ts` which exports `runText()` and `runWithTools()`. Both try Anthropic first; on any error, fall back to Gemini (if `GEMINI_API_KEY` is set). Gemini uses a structured JSON prompt as a tool-use equivalent. Model mapping: `haiku` → `claude-haiku-4-5-20251001` / `gemini-1.5-flash`; `sonnet` → `claude-sonnet-4-6` / `gemini-1.5-pro`. If neither key is configured, the call throws. Services using AI: `claude.ts` (tag suggestion), `macroEstimation.ts` (per-100g nutrition), `calorieEstimation.ts` (calories burned), `scrape.ts` (recipe extraction + nutrition estimation), `recipes.ts` (/suggest endpoint).
- **Calories burned estimation**: `POST /api/workouts/:id/estimate-calories` fetches workout exercises/sets, looks up user's body weight from `body_measurements` (falls back to 75 kg), calls `estimateCaloriesBurned()` in `calorieEstimation.ts`, saves result to `workout_logs.calories_burned`. Called non-blocking from `WorkoutDetailPage` `handleFinish()` — result updates the header stat line (`X kcal`) when it returns. Only completed sets are included. `lastCaloriesBurned` is also surfaced on routine cards via `GET /api/routines`. Only populates going forward — past workouts have null.
- **Barcode → prepackaged recipe**: `POST /api/recipes/from-barcode` accepts `{ barcode, name? }`. Checks existing `recipe_barcodes` first → lookups Open Food Facts → if not found and `name` provided, uses AI macro estimation → creates `prepackaged` recipe row + barcode link. Returns `{ recipeId, created }` or `{ found: false }` (when barcode unknown and no name). Mobile: after scan finds a food (not a recipe), offers "Save as Recipe?" Alert. If barcode unknown, `Alert.prompt` collects product name. Both flows navigate to `recipe/edit?id=` pre-filled.
