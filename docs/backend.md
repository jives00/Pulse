# Backend Conventions

- **Auth middleware**: `requireAuth` in `apps/server/src/middleware/auth.ts` — adds `req.userId` to request.
- **DB**: MySQL pool imported from `apps/server/api/config/database.ts` as `{ pool }`. Use `pool.execute()` for queries.
- **Migrations**: SQL files in `apps/server/src/db/migrations/`, run in order by `migrate.ts`. Add new migrations as `00N_description.sql`.
- **Route structure**: Each domain has its own route file. All protected routes use `requireAuth` middleware mounted in `index.ts`.
- **Passwords**: bcryptjs, 10 rounds. Always verify current password before allowing username/password changes.

## API route map

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
                       GET  /api/log/history?limit=90     last N days of food log entries grouped by `date (per-day totals + per-meal entry list)
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
                       POST /api/measurements/sync  trigger WeightGurus → DB sync (last 7 days)
/api/export/*          Excel export — GET /excel?start=&end= returns a 7-sheet .xlsx (Daily Diary, Daily Summary, Weekly Summary, TDEE Breakdown, Workout Log, Body Measurements, Water Log); user-scoped
/api/steps/*           Steps CRUD — GET / (today), GET /history?start=&end=, POST / (upsert day)
/api/schedules/*       Workout schedules — GET / (active), GET /upcoming, POST /, PUT /:id, DELETE /:id, POST /:id/override; GET /program-templates, POST /program-templates/:id/import
/api/meal-plan/*       Meal plan entries — GET / (date range), POST /entries, DELETE /entries/:id; GET /templates, POST /templates, POST /templates/:id/apply, DELETE /templates/:id
/api/meal-schedules/*  Recurring meal schedule entries — full CRUD
/api/nutrition-schedules/* Recurring nutrition targets — full CRUD
/api/day-types/*       Day type presets — GET/POST/PUT/DELETE /presets; GET /overrides, PUT /overrides/:date (upsert), DELETE /overrides/:date
/api/goal-checkpoints/* Goal checkpoints — GET /, POST /, PUT /:id, DELETE /:id
/api/user-goals/*      Custom goals — GET /, POST /, PUT /:id, DELETE /:id
/api/recovery/*        Recovery score — GET / (returns HRV/sleep/fatigue summary)
/api/ai/assistant/*    AI assistant — GET /insight (daily insight), POST / (chat message), POST /transcribe (audio → text)
/api/scrape/*          Recipe scraper — POST / (scrape URL → recipe), POST /estimate-nutrition
/api/templates/*       Meal templates (named sets of foods) — GET /, POST /, PUT /:id, DELETE /:id
```

## Services

### AI Provider
All AI calls go through `apps/server/src/services/aiProvider.ts` which exports `runText()` and `runWithTools()`. Both try Anthropic first; on any error, fall back to Gemini (if `GEMINI_API_KEY` is set). Gemini uses a structured JSON prompt as a tool-use equivalent. Model mapping: `haiku` $\rightarrow$ `claude-haiku-4-5-20251001` / `gemini-1.5-flash`; `sonnet` $\rightarrow$ `claude-sonnet-4-6` / `gemini-1.5-pro`. If neither key is configured, the call throws. Services using AI: `claude.ts` (tag suggestion), `macroEstimation.ts` (per-100g nutrition), `calorieEstimation.ts` (calories burned), `scrape.ts` (recipe extraction + nutrition estimation), `recipes.ts` (/suggest endpoint).

### WeightGurus Sync
`apps/server/src/services/weightGurusSync.ts` — authenticates to the WeightGurus v3 API (`WG_EMAIL`, `WG_PASSWORD` env vars), fetches operations for the last N days, and upserts rows into `body_measurements`. Skips duplicates via a bulk pre-fetch of existing `(metric, measured_at)` pairs. Triggered two ways: (1) node-cron schedule `0 6-12 * * *` America/Chicago registered in `index.ts` at startup (only if `WG_EMAIL`/`WG_PASSWORD` are set); (2) `POST /api/measurements/sync` endpoint for on-demand calls from the web UI.

### Calories Burned Estimation
`POST /api/workouts/:id/estimate-calories` fetches workout exercises/sets, looks up user's body weight from `body_measurements` (falls back to 75 kg), calls `estimateCaloriesBurned()` in `calorieEstimation.ts`, saves result to `workout_logs.calories_burned`. Called non-blocking from `WorkoutDetailPage` `handleFinish()` — result updates the header stat line (`X kcal`) when it returns. Only completed sets are included. `lastCaloriesBurned` is also surfaced on routine cards via `GET /api/routines`. Only populates going forward — past workouts have null.

### Barcode $\rightarrow$ Prepackaged Recipe
`POST /api/recipes/from-barcode` accepts `{ barcode, name? }`. Checks existing `recipe_barcodes` first $\rightarrow$ lookups Open Food Facts $\rightarrow$ if not found and `name` provided, uses AI macro estimation $\rightarrow$ creates `prepackaged` recipe row + barcode link. Returns `{ recipeId, created }` or `{ found: false }` (when barcode unknown and no name). Mobile: after scan finds a food (not a recipe), offers "Save as Recipe?" Alert. If barcode unknown, `Alert.prompt` collects product name then creates recipe with AI-estimated nutrition.
