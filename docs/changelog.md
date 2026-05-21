# Pulse Changelog — Next APK Build

Tracking changes since April 19, 2026 @ 8:39 PM.

---

## May 20, 2026

### Web

- **Additional weight on bodyweight exercises** — Bodyweight exercises (lunges, push-ups, etc.) now show a +lbs field in the set row; entered weight adds to body weight for volume calculation (e.g. 130 lb body + 20 lb vest = 150 lb × reps); fixes unit mismatch where 'lb' body weight entries were treated as kg, inflating volume. `10af3bd`
- **Workout volume calculation fix** — Detail screen volume calculation now matches backend/API logic: checks weight_kg first, then uses bodyweight for bodyweight exercises; fixes discrepancy where detail showed different volumes than dashboard/history. `f92fb0e`
- **Resistance exercise type** — New exercise type for reps-only movements (e.g. Deadbug) that don't use added weight or bodyweight volume; contributes 0 to total workout volume; available in exercise type picker and defaults to tracking reps only. `f92fb0e`
- **Meal scheduling with food/recipe selection** — Planning board AddMealScheduleForm now allows selecting existing foods, recipes, or custom labels; macros auto-populate from nutrition database when food/recipe selected, can be manually edited before save; custom labels allow manual macro entry. `d78d1b8`
- **Goals system refactor** — Removed redundant old-style goal editing UI from PlanningPage and WorkoutsPage; SettingsPage migrated to new userGoalsApi for nutrition and exercise goal management; old goalsApi routes remain for backward compatibility with dashboard displays. `4b63709`
- **Planning goals overhaul** — Goals section moved above calendar; redesigned as 4-column layout (Body Composition, Daily Nutrition, Weekly Nutrition, Weekly Exercise); clicking any stat row or goal name opens edit modal; empty system goal rows hidden; removed separate Edit buttons. `ae50402`
- **Custom user-defined goals** — New goal system: name any goal, pick metric type (max weight, volume, reps, steps, distance, duration, sessions, body measurement, nutrition avg), choose source exercise or routine, set target value and optional date; goals appear on the matching card (body/nutrition/exercise). `ae50402`
- **Weekly nutrition goals** — Weekly targets editable independently; default is daily × 7 (shown as "Based on daily × 7"); user can override; stored as nullable columns on user_goals table. `ae50402`
- **Planning calendar improvements** — Larger font sizes throughout; gridlines added using `border-slate-600`; nutrition schedule recurrence (once/daily/days-of-week/etc.) added to calendar day modal Nutrition tab. `ae50402`

### Mobile

- **Workout volume calculation fix** — Running volume display and notifications now match backend logic: checks weight_kg first, then uses bodyweight for bodyweight exercises; fixes mismatch with dashboard volume. `f92fb0e`
- **Resistance exercise type** — New exercise type for reps-only movements that don't contribute to volume; available in custom exercise creator and exercise type picker. `f92fb0e`
- **Goals system refactor** — Updated api/client.ts wrapper functions (getExerciseGoals, saveNutritionGoals, saveExerciseGoals) to use new /user-goals endpoints; nutrition goals split into 4 separate goal records (calories, carbs, protein, fat); all 6 mobile screens continue to work without changes. `4b63709`

### API

- **Additional weight on bodyweight exercises** — Migration 034 adds `additional_weight_kg` to `exercise_sets` and `routine_exercise_sets`; volume query adds carried weight to body weight for bodyweight sets; set endpoints accept `additionalWeightKg`. `10af3bd`
- **Resistance exercise type** — New ENUM value added to exercises.exercise_type; migration 033 updates the column definition. `f92fb0e`
- **Meal schedules food/recipe support** — POST and PUT endpoints now accept foodId, servingSizeId, quantity, recipeId, recipeServings, and macro fields (calories, proteinG, carbsG, fatG); macros auto-computed from food/recipe data when not manually provided; migration 030 adds columns to meal_schedules table. `d78d1b8`
- **Custom goals route** — New `GET/POST/PUT/DELETE /api/user-goals` backed by `custom_goals` table; category auto-derived from metric type server-side; JOINs exercises and workout_routines to resolve source name. `ae50402`
- **Nutrition schedules route** — New `GET/POST/PUT/DELETE /api/nutrition-schedules` with full recurrence expansion (`/upcoming?days=N`). `ae50402`
- **Weekly nutrition PATCH** — `PATCH /api/goals/weekly` updates only weekly nutrition columns on the current user_goals row without creating a new row. `ae50402`
- **Goals summary weekly fields** — `GET /api/goals/summary` now includes `weeklyCalories`, `weeklyProteinG`, `weeklyCarbsG`, `weeklyFatG`, `weeklyWaterGoalOz` inside `nutrition.goals`. `ae50402`
- **Migrations 026–032** — Schedule exercise, goal checkpoints, day types + nutrition overrides, meal schedules, nutrition schedules, custom goals, weekly nutrition columns. `ae50402`

## May 19, 2026

### Web

- **Food Log page header** — renamed "Today" to "Food Log" in the page header at /nutrition/today. `482a570`
- **Active workout page retheme** — replaced all slate/blue Tailwind classes with dram design system tokens (dram-card, dram-border, dram-accent, dram-muted); Finish button now uses dram-accent gold matching other header buttons. `0114775`
- **Workout stats band** — Overview band on active workout page shows Timer, Volume (live), Last Session volume + date, and Best Session volume + date; dates spelled out (e.g. "May 10"); fetches routine history on load. `0114775`
- **Workout 3-column exercise layout** — each exercise row now has three columns: tracker (sets/inputs), how-to image/video (pulled from exercise mediaUrl, wrapped in dram-card), and instructions text; server now returns mediaUrl and instructions in workout detail response. `0114775`
- **Exercises section header** — gold-rule + uppercase "Exercises (N)" header added above exercise list, aligned to px-9 matching the stats band. `0114775`
- **Workouts page stat tile colors** — "Last 7 Days" and "Steps" headers standardized to dram accent gold; Steps card progress bar, input focus, Log button, and placeholder text updated to dram theme. `0114775`

- **Routine detail redesign** — full match to exercise detail page style: dram theme throughout, Overview stats band (Sessions, Best Volume + date, Last Performed + day-of-week, Avg/Week), 3-column layout (left 2: Progress chart with Now/vs-30-days + History table, right 1: Exercises list), history rewritten as table view (Exercise | Sets | Max Weight | Avg Reps). `bf425b1`
- **Exercise detail vs-30-days fixes** — font size matches Now (text-3xl), unit label added, spacing increased between Now and vs-30-days. `bf425b1`

- **Square corners site-wide** — removed rounded-xl/2xl from all card and panel containers across every page (dashboard, workouts, routines, planning, settings, history, recipes, foods, links, exercise/workout/routine detail); also fixed `.card` CSS class which had `border-radius: 14px`. Modals, buttons, inputs, and pills retain their rounding. `64f78b4`
- **Workouts Today card** — now flattens exercises across all of today's sessions; per-exercise type detection (stairs: count/MM:SS/pace, distance: miles/pace, strength: set count); calories attributed per-workout. `c19fd8d`
- **Workouts layout polish** — Stats header matches Routines/Exercises style and date removed; routine and exercise grids expanded to 6 columns; Routines/Exercises sections aligned to match Stats horizontal padding; search bar and filter chips on same row in Exercises section. `c19fd8d`
- **Routine detail redesign** — thumbnail in header with click-to-upload; Start/Delete buttons moved to header top-right; cover image and standalone Start button removed from body; line chart replaced with full-width bar chart (wider bars, larger fonts, slate tooltip); exercises in 2-3 column grid with Add Exercise as next grid slot; stats strip shows "Last session:" instead of exercise count. `fd2db7d`
- **Exercise detail header redesign** — inline name and notes editing; exercise type dropdown (saves on change); last session stats strip adapts per tracked fields; Quick Log/Edit/Delete buttons with consistent rounded-lg styling; ⚡ icon removed from Quick Log buttons site-wide. `8caa1e2`
- **Food log band headers** — "Today" and "Meals" section headers stripped of subtitle text and macro summary line. `26e3c5b`

### API

- **log DELETE clears made-date** — deleting a food log entry that references a recipe now also removes the linked `recipe_log` row, keeping the recipe card's made-date accurate. `2f53420`
- **Exercise personal bests** — stats endpoint now returns workout name, date, and set details (weight × reps) for heaviest lift and best set volume. `e090c74`

### Web

- **Exercise detail redesign** — PB band with 4 tiles (heaviest weight, est. 1RM, best set vol, muscles); bar chart with Stats/History as gold-bar section headers; metric chips and Now/vs-30-days stats inside chart card; right column has How-To and Instructions as headers with per-line instruction spacing; all hardcoded slate colors replaced with theme tokens. `e090c74`

- **Food Log redesign** — Today page updated to match reference design: tabbed FoodSearchModal (Search / Add Recipe / Describe a Meal), Band-style section headers with gold accent line, NutritionSummaryCard with 2-column layout + large donut + glass water visualization, sharp-cornered meal cards, text-sm minimum font sizes, inline date nav in header, Copy from yesterday moved to Meals band. `fbbb525`
- **Library category filter** — food category (All, Main Dishes, Breakfast, etc.) is now a dropdown chip in the filter bar alongside Favorites/Made/Tags, replacing the old tab row. `2f53420`
- **Food log auto-refresh** — modal closes immediately after save; page updates silently in background with no loading spinner; frequent-food taps now guarded against double-log. `2f53420`
- **New recipe defaults to Food type** instead of Cocktail. `2f53420`

## May 18, 2026

### API

- **Phase 10: Meal planning API** — migration 025 adds `meal_plan_entries`, `meal_plan_templates`, `meal_plan_template_items`; new `/api/meal-plan` route with CRUD for planned meals, template save/apply/delete; macros pre-computed at insert time from food or recipe data. `57fefb7`

### Web

- **Phase 10: Projections section in Planning page** — planned macros vs. weekly goals with 7-bar day chart, scheduled workout calorie burn estimate, weight projection (14-day trend + meal-plan implied rate + 30-day forward view), goal progress ETAs comparing current trajectory vs. meal plan trajectory, and What if mode for interactive daily intake adjustment. `79aa558`
- **Phase 10: Meal Planning section in Planning page** — day strip with week navigation, per-day macro totals, four meal slots with add/delete, food/recipe picker modal with debounced search and serving size/quantity picker, template save and apply controls. `57fefb7`

### Mobile

- **Phase 10: Meal Planning card in Planning tab** — day strip with week navigation, meal slots with add/delete, food/recipe picker modal, template save/apply via action sheet. `57fefb7`

### API

- **Phase 9: Bidirectional "I Made This" sync via food log** — `POST /log` now inserts into `recipe_log` when `dramRecipeId` is present, so logging a recipe-based food entry from the food log screen also marks it as made in Recipes. `7f6db3f`
- **Phase 8: Daily steps logger** — migration 024 adds `steps_log` table; new `/api/steps` route with GET (by date), POST (upsert), and GET /history endpoints. `5eb9ca9`

### Web

- **Phase 8: Steps card on Workouts page** — Routines tab now shows a steps card with today's count vs. 10,000 goal, progress bar, and manual input field. `5eb9ca9`

### Mobile

- **Phase 9: Hello Fresh QR scan import** — added QR button next to the URL import field in the recipe edit screen; scanning a QR code populates the URL field so it feeds directly into the existing import flow. `7f6db3f`
- **Phase 8: Steps logger in Log tab** — daily steps card with manual input, save button, and progress toward 10,000 goal. `5eb9ca9`
- **Phase 8: Active workout banner on Routines tab** — resume banner surfaces when a workout is in progress. `5eb9ca9`
- **Phase 8: Exercise How To as default tab** — exercise detail screen opens on How To instead of Summary. `5eb9ca9`
- **Phase 8: Recent Sessions on Summary tab** — last 5 sessions shown with date, set count, top weight, and total volume. `5eb9ca9`

### API

- **Phase 7: Frequent foods endpoint** — new `GET /api/log/frequent` returns top 10 foods logged by the user in the past 90 days with macros per default serving; excludes quick-log entries. `6311fbe`
- **Phase 7: Bidirectional recipe log sync** — `POST /log/recipe` now also inserts into `recipe_log`, so logging a recipe from the food log screen marks it as "I Made This". `6311fbe`
- **Phase 6: AI assistant endpoint** — new `POST /api/ai/assistant` route; `runConversation` added to aiProvider for multi-turn history (Anthropic native messages, Gemini prompt-flattened); screen-aware system prompt maps recipe/food-log/routine/planning context to human-readable descriptions; structured JSON response with `log_food` and `update_nutrition_goal` action types. `2dccb52`

### Web

- **Phase 7: Frequent foods in search modal** — food search now loads top 10 frequent foods on open; shows as a tappable list when query is empty; clicking logs the food immediately at qty 1. `6311fbe`
- **Phase 7: Per-entry macros in food log** — each food entry in MealSection now shows P / C / F breakdown below the calorie count. `6311fbe`
- **Phase 7: Remove "Create Custom Food" header button** — button removed from TodayPage header; the flow remains accessible via the search modal footer. `6311fbe`
- **Phase 6: AI assistant** — floating ✦ FAB in Layout opens a slide-up chat panel; chat history with user/assistant bubbles, loading animation, and action execution via `logApi.logInline` and `goalsApi.saveNutrition`; screen context passed from `assistantStore`. `2dccb52`

### Mobile

- **Phase 7: Frequent foods in search modal** — food search loads top 10 frequent foods when modal opens; shows tappable list when query is empty; tapping logs immediately at qty 1. `6311fbe`
- **Phase 7: Per-entry macros in food log** — each food entry now shows P · C · F macro line alongside calories. `6311fbe`
- **Phase 6: AI assistant** — floating ✦ FAB overlaid on tab layout opens a `pageSheet` modal chat; bubbles, loading indicator, error display; executes `log_food` and `update_nutrition_goal` actions; screen context from Zustand `assistantStore`. `2dccb52`

### API

- **Phase 5: Workout scheduling** — new DB migration (023) adds `workout_schedules`, `workout_schedule_log`, `program_templates`, `program_template_days` tables; seeded with 3-Day Full Body, 4-Day Upper/Lower, 5-Day PPL, 6-Day PPL templates; full schedules route with recurrence expansion, override, and program import. `dfe19b0`

### Web

- **Phase 5: Planning page scheduling** — Workout Schedule section with week strip, active schedule list, Add Schedule modal (all recurrence types), and Import Program modal. `dfe19b0`
- **Phase 5: Upcoming workouts card** — DashboardPage Upcoming card now shows real schedule data from the API instead of the routines placeholder. `dfe19b0`
- **Phase 5: Routine detail simplification** — removed template sets UI; routine detail now shows exercise list with last-session reference only. `dfe19b0`
- **Dashboard v4 preview** — new `/dashboard-v4` route with 4-band layout (Fuel, Body, Trends, Sessions) using custom SVG sparklines, display typography, and square-corner panels matching the reference design. `fda83ff`

### Mobile

- **Phase 5: Planning tab scheduling** — Workout Schedule section with week strip, active schedule list, Add Schedule modal (all recurrence types), and Import Program modal. `dfe19b0`
- **Phase 5: Upcoming workouts card** — dashboard-v4 Now tab gains an Upcoming card showing the next 7 days from the schedule API. `dfe19b0`
- **Phase 5: Routine detail simplification** — removed template sets UI; routine detail now shows exercise list with last-session reference only. `dfe19b0`
- **Dashboard v4 preview** — new dashboard screen accessible via More menu (hidden from tab bar); matches the 4-band reference design. `fda83ff`

## May 17, 2026

### Web

- **New color schemes** — added Midnight, Tide, and Graphite themes alongside existing Blue, Slate, Sand. `f708cab`
- **Font size minimum** — replaced all `text-xs` (11px) with `text-sm` (14px) across 23 files; bumped `--t-xs` CSS variable from 11px to 13px. `af2f36d`
- **Cleanup** — deleted unused `MacroBar` and `NutritionHistoryCharts` components. `e0d7d39`

### API

- **Cleanup** — removed debug `console.log` from recipes, scrape, and aiProvider; upgraded Anthropic fallback notices to `console.warn`. `e0d7d39`

### Web

- **Log custom food (AI inline)** — added "✦ Log custom food" flow to the food log modal: describe what you ate, estimate macros with AI, log without creating a permanent food record. `d876ece`

### Mobile

- **"I Made This" logs to food log** — button now opens a meal/servings modal and logs the recipe to the nutrition food log in addition to make history. `d876ece`
- **Rest timer stays accurate when backgrounded** — replaced interval-based countdown with a start-timestamp approach; timer now resyncs from `Date.now()` on each tick. `d876ece`
- **Rest timer ding at zero** — haptic + audio alert fires when rest expires; requires EAS build (graceful no-op in Expo Go). `d876ece`
- **Routine: import last session** — exercises with no template sets now show an "Import as template sets" button that copies last-performed weights/reps as editable template rows. `d876ece`

### Mobile

- **New color schemes** — Midnight, Tide, and Graphite added to settings color picker. `f708cab`
- **Nav bar redesign** — replaced emoji icons with Ionicons, added Planning tab, renamed labels (Home/Plan/Log/Train/Recipes), fixed More button alignment and styling. `d1598f5`
- **Metro config** — added explicit `extraNodeModules` mapping for `@pulse/theme` to fix workspace resolution. `d1598f5`
- **Font size minimum** — replaced all `fontSize.xs` and hardcoded sub-13 sizes across all screens; chart/heatmap labels floored at 11. `af2f36d`
- **Plan tab** — fully implemented: nutrition goals with inline editing, exercise targets (workouts/minutes/volume) with progress bars, and body measurement goals with pace tracking and add/edit/delete. `8de0807`

### Web

- **Planning page** — new `/planning` route in the sidebar centralizes all goal management: nutrition targets, weekly exercise targets with volume, and body measurement goals with pace badges and projected dates. Inline goal editors removed from Today and Dashboard pages. `8de0807`

## May 14, 2026

### API

- **EC2 disk reduction** — deploy script now excludes mobile workspace from npm install and prunes devDeps after build, cutting node_modules from 606MB to ~130MB. `b1486ba`

### Mobile

- **API base URL** — updated from bare IP to `https://berek.xyz/pulse` in both EAS build config and fallback default. `b1486ba`

## May 04, 2026

### Mobile

- **Expo Go notification guard** â€” workout notifications now load lazily and skip unavailable notification APIs in Android Expo Go, preventing startup crashes while preserving pause/resume actions in notification-capable builds. `2c39d0c`
- **Active workout set edits** â€” lbs/reps inline edits now commit reliably when tapping away quickly, preventing active routine sets from reverting to their original values. `92aeb43`
- **Workout set edit row switching** — switching between set rows during an in-flight save no longer clears previous edits, preventing values from disappearing when moving to a new row before the API call completes. `3aed0a8`

## April 26, 2026

### Mobile

- **Local release APK build** — fixed Windows build pipeline: CMake 3.30.3 via `CMAKE_VERSION` env var resolves reanimated CONFIGURE_DEPENDS loop; metro.config.js updated so bundler resolves `@pulse/theme` symlinks on subst/junction paths. `ccc8d87`

- **History range filter** — date range chips (30d / 90d / 1y / All) filter all three History tabs; data reloads automatically when the range changes. `8ccb833`
- **History refresh controls** — pull-to-refresh enabled on Workouts, Nutrition, and Measurements tabs. `8ccb833`
- **Nutrition food detail modal** — tap any food entry in History → Nutrition to see full macro breakdown (calories, protein, carbs, fat, serving size). `8ccb833`
- **History page** — new full History screen (Workouts / Nutrition / Measurements tabs) accessible from the More menu; swipe between tabs; workouts grouped by date with volume/exercise summary; nutrition grouped by meal with daily totals; measurements table with add/edit/delete and metric filter chips. `5724898`
- **Goal "Achieved" status** — dashboard goal cards show "Achieved: [date]" in green when a goal is met instead of a projected date. `5724898`
- **Log measurement from dashboard** — "+ Log" button in the North Star Goals card opens an inline modal to record a body measurement. `5724898`
- **Custom food AI log** — food log search modal gains a "Log custom food" option; describe the food, AI estimates macros, user edits then logs without saving a recipe. `5724898`
- **Links filter chip wrap** — category filter chips wrap to multiple lines instead of horizontal scroll, matching the Recipes page. `5724898`
- **Keyboard fix in food log** — custom food modal now uses `behavior="padding"` on both platforms so the form stays above the keyboard. `5724898`
- **Custom food keyboard fix** — custom food form moved into the modalView ternary chain so it replaces the search view entirely; keyboard no longer buries the form. `5414467`

### API

- **Log history date range** — `GET /api/log/history` now accepts `start`/`end` params; route ordering fixed so `/history` is no longer shadowed by `/:id`. `8ccb833`
- **Measurements PUT returns object** — `PUT /api/measurements/:id` now returns the full updated measurement instead of `{ success: true }`, enabling optimistic UI updates. `8ccb833`
- **Measurements route ordering fix** — `DELETE /api/measurements/:id` moved after `/goals` routes to prevent shadowing `DELETE /goals/:metric`. `8ccb833`
- **Workouts date range + bodyweight volume** — `GET /api/workouts` now accepts `start`/`end` filters; bodyweight-exercise volume now calculated using the user's most recent body-weight measurement. `8ccb833`

### Web

- **Goal pace "Achieved" fix** — North Star goal cards now show "✓ Achieved" (green) with the date the goal was first met instead of "↓ Behind"; ETA label changes to "Achieved" on completion. `76bfa0f`
- **Measurement modal lag fix** — extracted modal inputs into a standalone component so typing only re-renders the modal, not the entire History page. `76bfa0f`

## April 25, 2026

### Mobile

- **Personal bests label fix** — "Most Calories Burned" is now a static label; the workout name moves to the subtitle line. `e7eb397`
- **Expanded highlights & personal bests (Phase 5)** — highlight column now shows all matching badges (each on its own line) instead of just the first; new highlights: all-time session volume record, best pace (stairs/min / cardio speed); fixed non-strength routines (steps, cardio_distance, cardio_duration) never getting a best-metric highlight; fixed missing first-time-exercise check; personal bests card adds "Most Calories" row, both calories and stair pace always shown. `a0d5085`
- **Insights & coaching cues (Phase 4)** — week-over-week volume/steps delta badge on dashboard; plateau detection callout on exercise detail; "beat your last" label in active workout exercise headers; week streak counter on dashboard. `563b846`

### Web

- **Quick-log flow** — RecipeForm gains a "Log to today" section (don't log / save + log / log only); TodayPage modal now refreshes the food journal after saving. `e7eb397`
- **Log-after-save in Foods** — Create Custom Food form gets a "Log to today's food journal" checkbox + meal picker; button becomes "Save & log today" when checked. `e7eb397`
- **Body measurements filter** — RecipeHistory measurements tab gains a tab bar to filter by metric (weight, body fat, etc.). `e7eb397`
- **Routine cards layout** — last-session stats stack vertically instead of inline dots on WorkoutsPage and WorkoutsDashboardPage. `e7eb397`
- **Volume heatmap** — cells with workouts but no volume data show a faint highlight with a tooltip "Workout logged · no volume data". `e7eb397`
- **NorthStar sparkline tooltip** — hover over the sparkline to see date and value at that point. `e7eb397`
- **Personal bests label fix** — "Most Calories Burned" is now a static label; workout name moves to the subtitle line. `e7eb397`
- **cardio_distance line fix** — `buildWorkoutLine` now detects miles vs meters entries and handles durationMinutes accidentally stored as seconds. `e7eb397`
- **Expanded highlights & personal bests (Phase 5)** — same highlight and personal bests improvements as mobile; personal bests card "Most Calories" and "Best Stair Pace" rows always rendered with — when no data. `a0d5085`
- **Insights & coaching cues (Phase 4)** — same week delta, plateau detection, beat-your-last, and streak features added to web dashboard, exercise detail, and workout detail pages. `563b846`

### API

- **Quick-log endpoint** — `POST /log/inline` logs a one-time food entry without saving it as a custom food (tagged `source='quick_log'`); migration 022 extends the `source` ENUM; custom foods list excludes quick-log entries. `e7eb397`
- **Personal bests** — `GET /api/workouts/personal-bests` now returns `mostCaloriesBurned` (calories, workout date, workout name). `a0d5085`

---

## April 24, 2026

### Mobile

- **Pace as primary metric** — steps routines now show stairs/min (replacing raw step count) and cardio_distance routines show mi/min across the routine list, recent workouts card, and Personal Bests card (stair pace replaces stair time). `94cfcd6`

### Web

- **Pace as primary metric** — same pace-based display for steps and cardio_distance routines in the routine cards, today's stats blurb, recent workouts table, and Personal Bests card; `buildWorkoutLine` extracted to a testable utility. `94cfcd6`

### API

- **Pace metrics** — `GET /api/workouts/personal-bests` now returns `bestStairPace` (stairs/min, best session) instead of `bestStairTime`; `GET /api/routines` `lastPrimaryMetric` for steps returns stairs/min and for cardio_distance returns mi/min. `94cfcd6`

---

### Mobile

- **Workout notification updates every second** — notification body now refreshes every 1s so the elapsed timer always looks live. `66c401f`
- **Add /commit slash command and initial changelog** — `/commit` skill added to `.claude/commands/`; `docs/changelog.md` initialized with history back to April 19. `28959fc`
- **Fix: notification pause/resume button stale closure** — pause/resume actions triggered from the notification now correctly read current workout state via a ref instead of a stale closure; added a 300ms delay before dismiss+reschedule on pause to prevent race conditions. `25b5ecd`
- **Fix: workout notification name and elapsed time** — routine name now appears correctly in the notification title (server JOIN fix); notification action buttons (Pause/Resume) now appear via `categoryIdentifier`; elapsed time updates via a ref so the timer stays in sync. `ff7d8e4`

---

## April 23, 2026

### Mobile

- **Workout timer pause/resume** — pause and resume buttons added to the active workout screen. Timer stops accumulating on pause. State is persisted server-side (`paused_at` + `total_paused_seconds` via migration 021). `f916cd6`
- **AI modifications of food logs** — new AI Modify option on food log entries in the Nutrition tab. Opens `AiModifyModal` where you describe a change ("I only ate half", "make it dairy-free") and AI adjusts the macros. Also available from Recipe Detail. `2e633d7`

### Web

- **Active workout banner on Routine Detail page** — when a workout is in progress, a banner now appears on the routine detail page with a Resume button. `5e93d77`
- **Active workout banner on Routines tab** — the banner was moved to the Routines tab on `/workouts` so it's visible while browsing routines. `bfa4586` `d12038b`
- **AI modifications of food logs** — same AI Modify feature available in the web Food Search modal and Recipe Detail page. `2e633d7`

---

## April 20, 2026

### Mobile

- **Personal Bests card redesign** — dashboard PB card now shows 5 metrics: best session volume per strength routine (top 3, compact grid), heaviest single lift (excluding bodyweight), fastest stair time, and all dates now show 4-digit years. `894e657`
- **Fix: crash opening Exercises tab `+` button** — `MuscleTagInput` was referencing out-of-scope variables; now calls `useColors`/`makeMStyles` internally. `b4ba0f7`
- **Fix: swipe navigation on Exercise Detail** — can now swipe left/right between Summary, History, and How To tabs. `b4ba0f7`
- **Fix: double-modal flash when editing a food log** — tapping Edit from the action sheet no longer briefly shows two modals. `b4ba0f7`
- **Fix: set row losing focus when switching fields** — tapping reps then weight (or vice versa) in the same set row no longer collapses the row; uses a ref + 50ms blur delay to distinguish same-row vs cross-row blur. `b4ba0f7`
- **Tappable exercise links in routine detail** — exercise names in the routine detail page now navigate to the exercise detail screen. `b4ba0f7`
- **Fix: Android keyboard focus jumping in routine templates** — removed `onSubmitEditing` from template set inputs so pressing Done no longer jumps focus to the next exercise block. `b4ba0f7`

### Web

- **Personal Bests card updated** — web workout dashboard card updated to match the new API shape from the PB redesign. `fd81bf4`
- **Fix: water bonus double-count** — water bonus is now cleared after a successful log so it can't be added twice. `a13198f`

---

## April 19, 2026 (post-build — infrastructure only)

### Mobile Build / CI

- EAS build cache disabled to clear stale Windows reanimated paths. `b8925f8`
- `react-native-reanimated` hoisted to root to fix Linux build path issue. `2a54a1d`
- `semver` v7 nested under reanimated to fix missing subpath export. `0baa878`
- CI: EC2 deploy skipped on `apk-*` tags to prevent concurrent deploys. `e2a7143`
- CI: SSH command timeout increased to 30 minutes for `npm ci`. `eda01d6`

### Web

- Upgraded to React 19 to support reanimated/worklets in the monorepo. `779c77d`
