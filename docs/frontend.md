# Frontend Conventions

## Web (React 19)

- **Routing**: React Router v6, all routes defined in `apps/web/src/App.tsx`. Base path is `/pulse` in prod, `/` in dev.
- **State**: Zustand stores in `apps/web/src/store/`. Auth token lives in `authStore`. UI settings (color scheme, sort) live in `settingsStore` (persisted to localStorage as `dram-settings`).
- **Auth flow**: `App.tsx` gates on a stored token. On load with no token it attempts `authApi.session()` (passwordless auto-login for trusted LAN/Tailscale networks) once, showing a brief splash; on success the token is stored and the app renders, on failure it falls back to the `/login` password form. Bootstrap runs once per page load, so an explicit logout still shows the form.
- **API calls**: All in `apps/web/src/api/client.ts`. Functions take `token` as first arg and throw on non-2xx.
- **Theming**: CSS variables defined in `apps/web/src/index.css` as RGB channels (not hex). Tailwind config references them via `rgb(var(--color-X) / <alpha-value>)`. Theme applied by setting `document.documentElement.dataset.theme` in `App.tsx`. Current themes: `blue` (default), `slate`, `sand`, `midnight`, `tide`, `graphite`, `trakt`. `index.css` is a generated artifact — source of truth is `packages/theme/src/index.ts`. To change a color: edit that file, then run `npm run generate-css --workspace=packages/theme`. **Adding a new scheme requires changes in two places:** `packages/theme/src/index.ts` (palette + `ColorScheme` type) AND `apps/web/src/store/settings.ts` (its own `ColorScheme` union type — not imported from the package). Also add an entry to the `THEMES` array in `apps/web/src/pages/SettingsPage.tsx`.
- **Color palette**: `dram-bg`, `dram-card`, `dram-accent`, `dram-border`, `dram-muted` — always use these, not hardcoded colors, so theming works. Use `dram-muted` for secondary/subtitle text instead of hardcoded `text-gray-*` or `text-slate-*`.
- **Layout**: `Layout.tsx` renders the sidebar (desktop) and bottom nav (mobile). Pages render inside `<Outlet />`. Pages should use `flex flex-col h-full overflow-hidden` for full-height layouts, or `max-w-2xl mx-auto px-4 py-6` for centered content pages.
- **URL-driven state**: The Food/Drinks library uses URL params (`?sub=main` etc.) for category filtering rather than component state, so the sidebar can control it via navigation.

### Route Map (Web)

```
/                      → redirects to /dashboard (home)
/dashboard             → DashboardPage (home — full workout/nutrition/recovery dashboard)
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

## Mobile (Expo/React Native)

- **Styling**: Use `StyleSheet.create()` — NOT NativeWind/Tailwind classes (NativeWind is installed but not used in practice).
- **Theme**: Three color schemes (`blue`, `slate`, `sand`). `PALETTES` source of truth lives in `packages/theme/src/index.ts` — `src/theme.ts` re-exports from `@pulse/theme` and adds mobile-only `fontSize`. Use `useColors()` hook (`src/hooks/useColors.ts`) to get the active palette — never import `colors` directly. Pass result `c` to a `...`
- **Swipe navigation**: `src/hooks/useSwipeNav.ts` — returns a `PanResponder` for horizontal swipe-left/right navigation. All 5 main tabs use it. Pages with internal tabs (Workouts, Settings) pass their tab list so swipes move through internal tabs first, then fall through to bottom tab navigation at the edges. No looping. Attach via `{...swipe.panHandlers}` on the root `SafeAreaView`.
- **API client**: `src/api/client.ts` — fetch-based, token passed explicitly. `API_BASE` from `src/api/config.ts` (defaults to `http://10.0.2.2:3000` for Android emulator; override via `EXPO_PUBLIC_API_BASE`)
- **Auth store**: `src/store/auth.ts` — Zustand + expo-secure-store, key `pulse-auth`
- **Settings store**: `src/store/settings.ts` — Zustand + expo-secure-store, key `pulse-settings`. Persists `defaultSort` (recipes), `defaultExerciseSort` (`name` or `created_at`), and `colorScheme` (`blue`, `slate`, or `sand`).
- **Routing**: expo-router file-based. Tabs live in `app/(app)/(tabs)/`. `app/(app)/_layout.tsx` is a Stack with `(tabs)` as the first screen and detail screens (`exercise/[id]`, `recipe/[id]`, `recipe/edit`) as sibling `Stack.Screens`. `workout/[id]` lives inside `(tabs)/workout/[id].tsx` (registered with `href: null`) so the bottom nav bar stays visible during an active session. Hidden tab routes (history, settings, links, workout/[id]) use `href: null` in the Tabs layout.
- **Weights**: Same as web — stored kg, displayed lbs. `KG_TO_LBS` imported from `@pulse/api-client`

### Mobile Tab Structure

| Tab | File | Notes |
|---|---|---|
| Dashboard | `app/(app)/(tabs)/dashboard.tsx` | **First tab (home).** Sections in order: Fuel Today (calories/protein/water progress bars), This Week (volume progress + 13-wk line chart), Last 30 Days (calories/protein/water line charts), Volume Heatmap (13-wk × routine grid), Creatine widget (saturation gauge + phase badge), North Star Goals (weight/waist/bicep pace cards + water-weight callout), Personal Bests, Recent Workouts (last 5, shows routine name). Loads all data via `useFocusEffect`. |
| Recipes | `app/(app)/(tabs)/index.tsx` | 2-col grid, filters, sort. Sort initializes from `settingsStore.defaultSort`. No sign-out button (sign out is in Settings). |
| Nutrition | `app/(app)/(tabs)/nutrition.tsx` | Date nav, 30-day calorie+protein bar charts (scroll to newest), water quick-add (above meal sections), meal sections, food search modal (recipes + foods), barcode scanner (expo-camera). Pull-to-refresh supported. Each meal section's "Add food" row has a barcode icon on the right that skips search and opens the scanner directly. Barcode scan: if food found (not already a recipe), offers "Save as Recipe?" Alert → calls `POST /api/recipes/from-barcode` → navigates to `recipe/edit`. If barcode unknown, prompts for product name via `Alert.prompt` then creates recipe with AI-estimated nutrition. |
| Workouts | `app/(app)/(tabs)/workouts.tsx` | 3 tabs: Routines (default), Exercises, Log. Log tab shows a "Workout in progress" resume banner when a session is incomplete. Log "+" Start button opens a bottom-sheet routine picker — choose a routine or start blank. Routines + Exercises use 2-col image grid matching Recipes page. Tapping a routine navigates to `routine/[id]` detail page. Tapping an exercise navigates to detail page. Progress dashboard has moved to the Dashboard tab. |
| Links | `app/(app)/(tabs)/links.tsx` | Saved links list with category filter chips (All / Food / Drinks / Nutrition / Exercise / Other). |
| Settings | `app/(app)/(tabs)/settings.tsx` | Accessible via swipe/navigation only (href: null in tabs). 5 tabs: Options (default sort), Tags (add/delete tags per category), Goals (nutrition/workout/body), User (change username/password), Delete (per-scope danger zone) |
| More | `app/(app)/(tabs)/more.tsx` | Placeholder — file exists to satisfy expo-router file-based routing; the "More" tab triggers a custom overlay menu. `href: null` in Tabs layout. |
| Planning | `app/(app)/(tabs)/planning.tsx` | Redirect to Settings tab. `href: null` in Tabs layout. |

### Mobile Key Files

| File | Notes |
|---|---|
| `app/(app)/(tabs)/workout/[id].tsx` | Active session — timer (startedAt from DB), set input rows (lbs→kg), set completion checkmarks, running volume total (full number, no abbreviation), exercise picker modal. Date row at top is tappable to edit (YYYY-MM-DD text input, saves on blur/submit). Exercise name is a tappable link to the exercise detail page. Each exercise block has a notes TextInput (saves on blur, syncs back to routine template). Logged set values are tappable for inline editing (TextInput with accent border, saves on blur). Steps column shown when `trackedFields` includes `steps`. Timer only starts for incomplete (active) workouts. Lives inside `(tabs)` so the bottom nav bar stays visible. |
| `app/(app)/routine/[id].tsx` | Routine detail — editable name, routine type picker (modal with 5 options), type-aware line chart (lbs/steps/mi/min), exercise blocks with template sets (blur-save, includes steps column), last-performed sets as reference, Start Routine button. Exercise picker modal with search + category filter. |
| `app/(...)/exercise/[id].tsx` | Exercise detail — Summary (PBs, set records, progress), History, How To tabs. Edit button opens sheet modal. Delete button shown for custom exercises only. |
| `src/api/client.ts` | All API functions — recipe, nutrition log, water, goals, workouts, exercises, routines, food search, auth changes, measurement goals, daily history (`getDailyHistory`), personal bests (`getPersonalBests`), body measurements (`getMeasurements`, `addMeasurement`) |
| `src/api/config.ts` | `API_BASE` — use `10.0.2.2:3000` for emulator, LAN IP for physical device |

### Component Responsibilities

| Component | Location | Notes |
|---|---|---|
| `Layout` | `apps/web/src/components/Layout.tsx` | Desktop sidebar + mobile bottom nav. Sidebar nav has **no icons** (by ...) |
| `NutritionSummaryCard` | `apps/web/src/components/NutritionSummaryCard.tsx` | Calorie ring, macro rings, water bar. Used by TodayPage. `onAddWater` prop optional — omit when no water quick-add is needed. |
| `NutritionHistoryCharts` | `apps/web/src/components/NutritionHistoryCharts.tsx` | 30-day scrollable bar charts (calories + protein). Used by TodayPage. Fetches its own data via `historyApi.daily()`. |
| `Library` | `apps/web/src/pages/Library.tsx` | Food and Drinks recipe grid. Filter state is URL-driven (`?sub=main` etc.). Tags scoped to current user + page type (food vs cocktail). |
| `RecipeForm` | `apps/web/src/components/RecipeForm.tsx` | Grouped pill picker for tags (Health/Cuisine/Category). Pulls from `tag_definitions` table — no free-text entry. Accepts `initialType` prop. Three types: cocktail, food, prepackaged. Food shows subcategory (main/side/breakfast/dessert) + timing + nutrition. Prepackaged shows servings + nutrition + barcode. Cocktail shows glass/ABV + optional nutrition. Barcode saved to `recipe_barcodes` on submit. |
| `FoodSearchModal` | `apps/web/src/components/FoodSearchModal.tsx` | Searches recipes (`GET /recipes/search`) + foods in parallel. "My Recipes" section at top. Selecting a recipe opens a servings picker that logs via `POST /log/api/recipes/search`) + foods in parallel. "My Recipes" section at top. Selecting a recipe opens a servings picker that logs via `POST /log/recipe`. Accepts `onCreateCustomFood` prop; if provided, "Create custom food" calls it instead of the inline create flow. |
| `SettingsPage` | `apps/web/src/pages/SettingsPage.tsx` | Tabbed layout: **Options** (Color Scheme, Default Sort (Recipes), Default Sort (Exercises), Tags), **Goals** (nutrition daily macros + workout weekly goals + per-routine session goals + body measurement goals — all in one place), **Planning** (workout schedules, meal schedules, nutrition schedules, day-type presets, goal checkpoints — all via `PlanningCalendarCard`), **User** (change username/password), **Delete Data** (danger zone), **Export** (date range pickers + download all data as xlsx). Left-aligned layout matching History/Links pages. |
| `TodayPage` | `apps/web/src/pages/TodayPage.tsx` | Daily nutrition log with date nav, summary card, and meal sections (Breakfast/Lunch/Dinner/Snacks). "Copy from yesterday" opens a `CopyFromDayModal` (inline) letting the user pick individual items per meal before copying. "Log food" button opens `FoodSearchModal`. |
| `WorkoutsDashboardPage` | `apps/web/src/pages/WorkoutsDashboardPage.tsx` | Home page. Two tabs: **Dashboard** (V3 layout) and **Other** (TodaysBlurb). V3 is a full-width custom SVG dashboard: North Star Goals (weight/waist/bicep pace gauges + sparklines); This Week (workouts + volume progress bars + day-of-week bar chart normalized by goal — hover a bar to see per-exercise details below chart); Fuel Today (calorie ring, macro bars, water glasses with +1 glass / +Bottle quick-log, meals by slot, Net vs TDEE); Body Composition (BMI/Body Fat/Muscle Mass cells, waist+bicep pencil-icon quick-log); How You're Trending (Calories vs TDEE + Volume Heatmap in a 50/50 grid; Weight + Protein SVG charts in a 50/50 grid; Weekly Averages full-width); Creatine saturation gauge + Personal Bests + Recent Workouts (steps rows show steps+time in volume column; vs Prior compares pace in steps/min). Header toolbar: "Edit Goals" + "+ Start Workout". All data loaded eagerly on mount via `loadV2()`. |
| `WorkoutsPage` | `apps/web/src/pages/WorkoutsPage.tsx` | Two tabs: **Routines** (inline routine grid with ▶ Start button on each card, + New Routine modal), **Exercises** (inline exercise grid with search/filter, + New Exercise modal). Progress dashboard has moved to `/dashboard` (WorkoutsDashboardPage). |
| `ExerciseDetailPage` | `apps/web/src/pages/ExerciseDetailPage.tsx` | Full-width 2-column layout (no tabs). Header has Edit + Delete buttons (Edit opens inline modal with all fields; Delete available for all exercises). Left column: notes, demo media, instructions, muscle diagram image (hidden if none uploaded), muscle tags. Right column: summary (personal $\dots$ |
| `RoutinesPage` | `apps/web/src/pages/RoutinesPage.tsx` | Library-style grid (matches food/drinks). Cards show a cover photo (S3, uploaded via pre-signed URL) or stat block fallback. Hover image area → "Change photo" overlay. Info section: name, last-used date + last session volume (lbs), exercise count + notes. Create modal. Clicking navigates to RoutineDetailPage. |
