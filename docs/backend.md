# Backend Conventions

- **Auth middleware**: `requireAuth` in `apps/server/src/middleware/auth.ts` — adds `req.userId` to request.
- **Trusted-network auth**: `isTrustedRequest` in the same file (logic in `apps/server/src/utils/trustedNetwork.ts`) — true when the request carries no Cloudflare headers and its socket peer IP is in a private/Tailscale range (`TRUSTED_CIDRS` extends the defaults). Powers `POST /api/auth/session` for passwordless login on the home LAN/Tailscale.
- **CORS**: `index.ts` allows an Origin via `isTrustedOrigin` (same util) — explicit `CORS_ORIGIN` entries plus any host that is `localhost`, `synology`, `*.local`, or a private/Tailscale IP. Lets the app be reached by LAN IP or `synology.local` (Tailscale-down) without a 500.
- **DB**: MySQL pool imported from `apps/server/api/config/database.ts` as `{ pool }`. Use `pool.execute()` for queries.
- **Migrations**: SQL files in `apps/server/src/db/migrations/`, run in order by `migrate.ts`. Add new migrations as `00N_description.sql`.
- **Route structure**: Each domain has its own route file. All protected routes use `requireAuth` middleware mounted in `index.ts`.
- **Passwords**: bcryptjs, 10 rounds. Always verify current password before allowing username/password changes.

## API route map

```
POST   /api/auth/login
POST   /api/auth/session            passwordless auto-login for trusted networks (LAN/Tailscale); returns the login JWT for user id 1, else 401
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
/api/nutrition-targets/* Operational nutrition targets (drive food-log rings; stored in user_goals) — GET /, GET /history, POST /, PATCH /weekly, GET /summary, GET /tdee. Replaced /api/goals
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
/api/steps/*           Steps CRUD — GET /?date= (defaults today), GET /history?days= (default 30, max 365; dates are YYYY-MM-DD), POST / (upsert day)
/api/schedules/*       Workout schedules — GET / (active), GET /upcoming?days=&from=, POST /, PUT /:id, DELETE /:id, POST /:id/override; GET /program-templates, POST /program-templates/:id/import
/api/meal-plan/*       Meal plan entries — GET / (date range), POST /entries, DELETE /entries/:id; GET /templates, POST /templates, POST /templates/:id/apply, DELETE /templates/:id
/api/meal-schedules/*  Recurring meal schedule entries — full CRUD; GET /upcoming?days=&from=
/api/nutrition-schedules/* Recurring nutrition targets — full CRUD; GET /upcoming?days=&from=
/api/day-types/*       Day type presets — GET/POST/PUT/DELETE /presets; GET /overrides, PUT /overrides/:date (upsert), DELETE /overrides/:date
/api/goals-v2/*        Unified goals (body/nutrition/exercise/activity) — GET /, GET /:id, POST /, PATCH /:id, DELETE /:id, POST /:id/close, GET /nudges, GET /since?date=YYYY-MM-DD; milestones: GET /milestones, GET|POST /:id/milestones, PATCH|DELETE /:id/milestones/:mid; progress: GET|POST /:id/progress, DELETE /:id/progress/:pid. Replaced /api/user-goals and /api/goal-checkpoints
/api/preferences       Feature modules + dashboard layout — GET / (always resolved through the catalog defaults), PUT / (partial merge; dashboardLayout merges per platform so a web-only save never wipes mobile)
/api/recovery/*        Recovery score — GET / (returns HRV/sleep/fatigue summary)
/api/ai/assistant/*    AI assistant — GET /insight (daily insight), POST / (chat message), POST /transcribe (audio → text)
/api/scrape/*          Recipe scraper — POST / (scrape URL → recipe), POST /estimate-nutrition
/api/templates/*       Meal templates (named sets of foods) — GET /, POST /, PUT /:id, DELETE /:id
```

The three `/upcoming` routes anchor their window on `from` — the **client's** local `YYYY-MM-DD`, appended automatically by the api-client `getUpcoming` helpers. The server clock is only a fallback: the container runs in UTC, so it reaches tomorrow hours before the user's day ends and would drop today from the results.

## Services

### Feature modules — gate aggregates, never gate CRUD
`packages/api-client/src/featureCatalog.ts` is the source of truth (7 modules, 13 sub-modules). `apps/server/src/middleware/features.ts` exports `loadFeatures`, which resolves `users.enabled_features` into `req.features` **per request with no cross-request cache**, so a toggle applies on the very next call. Mount it only on the routes that branch on it.

A disabled module keeps its CRUD endpoints live and functional. This is deliberate: it makes re-enabling trivial, avoids breaking clients whose cached preference is stale, and means a toggle can never orphan data. What changes is what the cross-feature **aggregates** report:
- `services/tdee.ts` — `calcTDEE` takes `include: { tef, exercise, steps }` (all default true); an excluded term contributes 0 and is omitted from the returned `components[]`, so clients can label the figure "Expenditure" rather than "TDEE" when TEF is missing.
- `routes/goals-v2.ts` — list and `/nudges` filter goals whose `category` maps to a disabled module via `utils/goalFeatureFilter.ts`. Filters, never deletes; `GET /:id` always works.
- `services/excelExport.ts` — builds its sheet list from the enabled modules.
- `routes/ai-assistant.ts` — the insight prompt only queries data for tracked domains, states them in the system prompt, and includes a feature fingerprint in its 24h cache key.

The one exception is `services/weightGurusSync.ts`, where a toggle stops data being *written*: it skips and logs when `body` or `weightGurusSync` is off. That is the intent — a user who stopped tracking body weight should not get scale data imported behind their back.

### AI Provider
All AI calls go through `apps/server/src/services/aiProvider.ts` which exports `runText()` and `runWithTools()`. Both try Anthropic first; on any error, fall back to Gemini (if `GEMINI_API_KEY` is set). Gemini uses a structured JSON prompt as a tool-use equivalent. Model mapping: `haiku` $\rightarrow$ `claude-haiku-4-5-20251001` / `gemini-1.5-flash`; `sonnet` $\rightarrow$ `claude-sonnet-4-6` / `gemini-1.5-pro`. If neither key is configured, the call throws. Services using AI: `claude.ts` (tag suggestion), `macroEstimation.ts` (`estimateMacros` for per-100g food-database nutrition, `estimateMeal` for whole-portion totals behind Describe a Meal), `calorieEstimation.ts` (calories burned), `scrape.ts` (recipe extraction + nutrition estimation), `recipes.ts` (/suggest endpoint).

### WeightGurus Sync
`apps/server/src/services/weightGurusSync.ts` — authenticates to the WeightGurus v3 API (`WG_EMAIL`, `WG_PASSWORD` env vars), fetches operations for the last N days, and upserts rows into `body_measurements`. Skips duplicates via a bulk pre-fetch of existing `(metric, measured_at)` pairs. Triggered two ways: (1) node-cron schedule `0 6-12 * * *` America/Chicago registered in `index.ts` at startup (only if `WG_EMAIL`/`WG_PASSWORD` are set); (2) `POST /api/measurements/sync` endpoint for on-demand calls from the web UI.

### Calories Burned Estimation
`POST /api/workouts/:id/estimate-calories` fetches workout exercises/sets, looks up user's body weight from `body_measurements` (falls back to 75 kg), calls `estimateCaloriesBurned()` in `calorieEstimation.ts`, saves result to `workout_logs.calories_burned`. Called non-blocking from `WorkoutDetailPage` `handleFinish()` — result updates the header stat line (`X kcal`) when it returns. Only completed sets are included. `lastCaloriesBurned` is also surfaced on routine cards via `GET /api/routines`. Only populates going forward — past workouts have null.

### Barcode $\rightarrow$ Prepackaged Recipe
`POST /api/recipes/from-barcode` accepts `{ barcode, name? }`. Checks existing `recipe_barcodes` first $\rightarrow$ lookups Open Food Facts $\rightarrow$ if not found and `name` provided, uses AI macro estimation $\rightarrow$ creates `prepackaged` recipe row + barcode link. Returns `{ recipeId, created }` or `{ found: false }` (when barcode unknown and no name). Mobile: after scan finds a food (not a recipe), offers "Save as Recipe?" Alert. If barcode unknown, `Alert.prompt` collects product name then creates recipe with AI-estimated nutrition.
