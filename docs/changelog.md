# Pulse Changelog — Next APK Build

Tracking changes since April 19, 2026 @ 8:39 PM.

---

## May 25, 2026

### API (fix)

- **Eliminated duplicate React key warnings** — Fixed `GET /log/frequent` returning the same food multiple times when it had multiple `is_default=1` serving sizes (replaced `GROUP BY f.id, ss.id` with correlated subquery); added migration 036 to add `UNIQUE KEY` on `routine_goals(user_id, routine_id, effective_from)` and delete pre-existing duplicate rows. `bd09e1c`

### Mobile (fix)

- **Fixed Health Connect write sync API** — Corrected all react-native-health-connect v3 API mismatches: record type strings, `insertRecords`/`deleteRecordsByUuids` replace non-existent `writeRecords`/`deleteRecords`, `Energy`/`Mass`/`Volume` field shapes, numeric `mealType`, `WeightRecord` uses `time` not `startTime`/`endTime`, and api-client import paths. `006f749`

- **Fixed startup crash on devices where Health Connect is unavailable** — Added `getSdkStatus()` check before `initialize()` and `requestPermission()`; app now skips all Health Connect native calls if SDK is not present. `71b3949`

- **Defensive dedup for routine goals** — Added client-side `Map`-keyed deduplication of `routineGoals` before rendering to prevent duplicate React keys surviving until migration is deployed. `bd09e1c`

### Mobile (refactor)

- **Consolidated API client** — Replaced 1,230-line mobile fetch client with a thin shim delegating to `@pulse/api-client`; no caller files changed. Deleted unused 397-line web fetch client. Expanded shared package endpoints to cover all mobile needs. `69c0a29`

### Web (refactor)

- **Updated `logApi.getHistory` callers** — Three pages updated to pass `{ limit: N }` object after shared client signature change. `69c0a29`

### Mobile (chore)

- **Dead code and type cleanup** — Fixed mobile TypeScript errors: added `@expo/vector-icons` as explicit dependency, corrected `PersonalBests` field references (`bestVolumeByRoutine`, `pacePerMinute`), fixed `useHealthSteps` permission check and `readRecords` API shape, added `'resistance'` to `Exercise.exerciseType`; removed debug `console.log` from `SettingsPlanningTab`. `944de45`

### Web (chore)

- **Dead code removal** — Removed ~1,550 lines of never-rendered components across `DashboardPage`, `WorkoutsPage`, `WorkoutsDashboardPage`, and `App.tsx` (`Spark`, `RecoveryCard`, `UpcomingCard`, `PersonalBestsTable`, `Ring`, `ProgressBar`, `StatTile`, `WeeklyChart`, `BodyMeasurementsCard`, `RoutinesTab`/`ExercisesTab` duplicates, `ComingSoon`, and associated dead helpers); stripped debug `console.log` from `RoutinesTab`. `944de45`

### Web (fix)

- **Per-routine workout goals now persist when set to 0** — Fixed logic error in Goals tab where setting a routine goal to 0 was not saved; reordered condition check to explicitly handle 0 as a delete operation. `a707a5e`

### API (chore)

- **Server cleanup** — Removed unused imports and locals from `log`, `nutrition-schedules`, `schedules`, and `user-goals` routes; stripped debug `console.log` statements from `routines` route; added duplicate-prefix guard to `migrate.ts` (throws on startup if two migration files share a numeric prefix). `944de45`
- **migrate.ts guard softened** — Changed duplicate migration prefix guard from `throw` to `console.warn` so existing 025_*/030_* files don't block `npm run migrate`; renamed `@dram/mobile` → `@pulse/mobile`; enabled `noUnusedLocals` in web tsconfig; removed remaining dead code (recharts import, `HowToTab`, `openCreate` duplicate, `MUTED`, `fmtDuration`, unused helpers); added root `check` script. `4c6d96b`

### Mobile (feature)

- **Health Connect write sync** — Food logs, water logs, workouts, and weight measurements now sync to Health Connect with fire-and-forget error handling. Nutrition records include macro breakdown (kcal→joules conversion). Workouts use smart exercise type mapping (30+ types with category awareness); calories logged as separate record. Weight converts lbs→kg. Uses clientRecordId for auto-upsert on edits. Gracefully skips writes if permission denied (Pulse still saves). Requires APK rebuild with new WRITE_* permissions. `c754048`

### Mobile

- **Dashboard swipe navigation** — Dashboard tabs (Today, Goals, Trends, Sessions) now respond to left/right swipes to navigate between them; swiping right from the last tab navigates to the next navbar section (Food Log). Navbar swipe order: Home → Log → Train → Recipes → Links → History → Settings. `e5297a2`
- **Weekly averages TDEE fix** — Weekly averages table on dashboard now correctly includes step calories in TDEE calculations, matching the formula used in the Today section. `1d791c5`
- **Steps auto-sync from Samsung Health** — Steps now auto-sync from Samsung Health via Health Connect when the Workouts Log tab opens; shows 'Synced from Samsung Health' or 'Manually entered' label; manual entry remains available as an override. Requires APK rebuild with Health Connect native module. `df231a2`
- **Today's Blurb shows step count** — Today's Blurb section on the dashboard now includes a steps line when steps have been logged for the day. `e5dadcc`
- **Planning tab date indicator** — Changed today's date circle to a square in the planning calendar. `43f3a7d`
- **Planning schedule edit** — Workout, meal, and nutrition schedules now have Edit buttons in SettingsPlanningTab; clicking Edit pre-fills the form with existing data (type/routineId/exerciseId/recurrence/macros/etc) and calls the update endpoint instead of create; `parseRecConfig` helper reconstructs form state from stored `recurrenceConfig` JSON. `1e6f9ae`

### API

- **Nutrition schedule overrides daily macro goals** — Planning calendar nutrition schedule entries now override daily macro and water goals on `GET /log`, `GET /goals/summary`, and `GET /water`; weekly goals are unaffected. `8cc5052`
- **Steps calories in TDEE** — Today's synced steps now contribute to TDEE at 0.05 kcal/step as a dedicated `stepsKcal` field; included in the total but kept separate from NEAT so the activity-level multiplier is unchanged. `1dcae3d`

### Web

- **Weekly averages TDEE fix** — Weekly averages table on dashboard now correctly includes step calories in TDEE calculations, matching the formula used in the Today section. `1d791c5`
- **Steps calories in TDEE breakdown** — Dashboard weight-goal projection and Workouts dashboard today-card now include steps calories in TDEE; formula description shows step contribution when non-zero. `1dcae3d`
- **Today's Blurb shows step count** — Today's Blurb section on the dashboard now includes a steps line when steps have been logged for the day. `e5dadcc`
- **Daily insight banner removed** — Removed the AI insight banner from the top of the dashboard, including the `InsightBanner` component, insight state, and `assistantApi.getInsight()` call. `4a17512`
- **Planning schedule edit** — Workout, meal, and nutrition schedules in the DayModal now have Edit buttons; clicking Edit pre-fills the form with existing data and calls the update endpoint instead of create; `parseRec` helper reconstructs form state from stored `recurrenceConfig` JSON. `1e6f9ae`
- **Links category dropdown icons removed** — Removed emoji icons from the category dropdown in the Links header when adding a new link, displaying only the category label. `d60cc47`
- **Routine cover image edit** — Routine detail page now displays the cover image in the right column (top of exercises section) with an "Add Photo" / "Change Photo" hover overlay; clicking the overlay opens a file picker to upload or replace the image; uploaded images display immediately via preview and persist after reload. `9c578c4`
- **Routines sorted by next scheduled occurrence** — Workouts page Routines section now sorts routines by their next scheduled date from the planning interface; routines with upcoming schedules appear first (ordered by soonest date), followed by routines without schedules; supports both direct routine schedules and routines within custom-cycle recurring schedules. `2f6e0f9`

## May 24, 2026

### Mobile

- **Dashboard promoted to primary** — `dashboard-v4.tsx` content moved to `dashboard.tsx`; old dashboard and v4 file removed; `_layout.tsx` cleaned up. Settings color scheme selector now scrolls horizontally. Recipe filter chips reduced in size (padding/font) so all fit on one line. `7904528`

- **Sessions tab** — Two-line row layout per session preserving all web columns: date + session name + vs-prior delta (▲/▼%) on line 1; metric value + calories + highlights on line 2. `a30c70e`
- **Food log sort fix** — `foodLogHistory` now sorted ascending on load so `slice(-14)`/`slice(-30)` correctly target the most-recent days (server returns newest-first). `a30c70e`
- **Macro bar color fix** — Fuel Today macro bar stays gold when over goal; only the value number turns warn, matching web behavior. Exercise volume week-over-week Best week stat removed. `a30c70e`

- **Trends tab** — Replaced History tab with four cards matching the web: Calories consumed vs burned (14-day line chart, consumed=gold, TDEE=gray, avg stats + net); Exercise volume week-over-week (12-week bar chart, current=gold, best=dimmed gold); Exercise volume 12-week heatmap (opacity-scaled gold cells, M–S day labels, legend swatches); Weekly averages table (Cal, Prot/gold, Carbs/blue, Fat/brown, Net/colored; 13px number size; 5 most-recent weeks + current). `2cff22f`

- **Goals tab chart colors + TDEE projection** — Trend projection line changed to indigo (`#818cf8`) and TDEE projection added as a second orange (`#f97316`) line on the weight card, matching the web; weight card actual line changed to gold; all legend labels updated to reflect line colors; GoalStatusChip layout fixed on all four goal cards (CardHeader wrapped in `flex:1` so chips stay on-screen); `getExerciseGoals` corrected to call `/api/goals/exercise`. `45f8ccf`

- **Routine detail overview + progress** — Added Overview stat band (Sessions, Best Volume/Distance/Duration/Steps, Last Performed, Avg/Week) and Progress section (bar chart replacing line chart, Now value, vs-30-days-ago delta with color and %) above the exercise list on the routine detail screen. `2c9523f`
- **Active workout last-session bar** — Sub-bar below the workout header shows last session's total volume and a live colored delta % (▲/▼) comparing current running volume against that target; only visible on active workouts where prior session data exists. `2c9523f`
- **Planning tab redesigned** — Settings now includes a Planning tab with a 14-day agenda view (vertical list, colored event dots per category) replacing the horizontal card strip; single "Add to schedule" button opens a DayModal with a day-picker strip defaulting to today; DayModal contains Workout, Meals, Goals, and Nutrition tabs; workout add supports routine/exercise/rest day with once-or-recurring; meal add supports food search, recipe search, or custom label; goal checkpoints support metric dropdown, target, date, and notes; nutrition add supports macros and water in glasses; Day Type Presets and Import Program features removed. `71bf8e3`
- **Today's Blurb** — Dashboard Today tab now includes a summary card as the last section, displaying today's workout (name + volume in lbs), nutrition (calories, protein, carbs, fats), and water intake (in glasses) as a plain-text blurb with a share button. `c80cb44`

- **Custom cycle recurrence for meal schedules** — Meal schedule /upcoming endpoint now supports custom_cycle recurrence type with modulo-based day-of-week filtering; displays macros without description label. `fb78de2`
- **Custom cycle recurrence for nutrition schedules** — Nutrition schedule /upcoming endpoint now supports custom_cycle recurrence type; calendar displays macros (calories, protein, carbs, fat) on separate lines with full names instead of abbreviations (P/C/F); removed generic "?-item cycle" description. `fb78de2`
- **Timezone bug fix in /upcoming endpoints** — `/api/schedules/upcoming`, `/api/meal-schedules/upcoming`, and `/api/nutrition-schedules/upcoming` now use local dates instead of UTC, fixing date range mismatch where schedules starting tomorrow were filtered out when mobile requested current day. `fb78de2`
- **Planning calendar font sizes and macro display** — Nutrition macro display on calendar increased from text-xs to text-sm and colored with dram-accent orange to match routine/exercise names; section headers increased from text-xs to text-sm; calendar date range fixed to remove yesterday and add one future day (now shows 14 days forward). `fb78de2`
- **Nutrition schedule display fix** — Removed "Custom targets" label from nutrition schedule events in Planning tab; now displays only the macros without a type header when no day type is set. `00de964`
- **Day event indicator nutrition label fix** — Removed "Custom targets" fallback label from the colored event dots in the calendar; nutrition schedules without day types now show each macro (calories, protein, carbs, fat) on its own line with individual dots. `2ccbe74`

### Web

- **Nutrition macro display improvements** — Nutrition schedule events on the calendar now display macros (calories, protein, carbs, fat) on separate lines with full names instead of abbreviations; removed generic "?-item cycle cycle on [days]" description for custom_cycle type. `fb78de2`
- **Planning calendar date range fix** — Calendar now shows 14 days forward (removed yesterday, added one day to future); resolves off-by-one display issue. `fb78de2`
- **Timezone bug fix** — Planning calendar and recipe history pages fixed `todayStr()` function to use local dates instead of UTC, matching backend /upcoming endpoints. `fb78de2`

### API

- **Custom cycle recurrence** — Nutrition schedules and meal schedules now support `custom_cycle` recurrence type; recurrence config stores `cycleDays` array and `days` array for day-of-week filtering; `matchesRecurrence()` checks day-of-week membership then counts elapsed days for position. Migration 035 added `custom_cycle` ENUM value. `fb78de2`
- **Timezone bug fix in /upcoming endpoints** — All three schedule /upcoming endpoints now compute `todayStr` using local date (year/month/day) instead of `new Date().toISOString().slice(0, 10)` which was returning UTC time, causing schedules to shift by one day on mobile. `fb78de2`

## May 23, 2026

### Web

- **Dashboard Goal Progress polish** — Rest day text in Exercise Today bumped from 13 to 18px; TDEE projection in Weight Goal card now stable (TEF computed from 30-day avg calories instead of today's food log, so days with no food logged yet no longer collapse the projection to flat); Waist/Bicep goal regression limited to last 90 days so historical steep declines no longer skew the current-pace projection. `76e1546`
- **Dashboard Today's Blurb** — New section at the bottom of the dashboard renders today's workout, nutrition, and water as a plain-text blurb (matching the format: workout name + volume, calories + macros, water glasses) with a copy-to-clipboard button. `8acd5bf`
- **Dashboard v4 promoted to primary** — `/dashboard` now serves the v4 page; old WorkoutsDashboardPage retired; "Dashboard v4" nav entry removed; "v4 preview" footer label cleaned up; bundle ~88KB smaller. `908cd18`

## May 22, 2026

### Web

- **Dashboard v4 Sessions tab overhaul** — Replaced old sessions grid with a redesigned table matching the v3 Recent Workouts card; columns are Date, Session, Metric, Calories, Highlight, vs Prior; Metric shows type-aware primary value (lbs for strength, stairs/min for steps, mi/min for cardio distance, min for cardio duration) with right-alignment; vs Prior delta compares the same metric type; all highlights shown per row; session name falls back to exercise list for non-routine workouts; fixed column widths eliminate per-row grid shift that caused misalignment. `813c7dc`
- **Dashboard Calories vs Burned date range fix** — Tooltips were showing dates from ~60–30 days ago instead of the most recent 30 days; server returns history newest-first so `slice(-30)` was taking the oldest entries; fixed by sorting ascending on arrival. `b0749eb`
- **Dashboard Exercise Today + Fuel Today polish** — AI insight period now included in cached responses (was showing "Yesterday" for afternoon/evening insights); Fuel Today content padded below title; macro bars turn green at 95–105% of goal, gold otherwise; Exercise Today removes duration row and Open button, workout name now links to detail page; meta stats removed from Exercise Today panel header; recovery hint font bumped and constrained to one line with ellipsis. `db6e035`
- **Dashboard Goal Progress overhaul** — Replaced old goal panels (FlagshipGoal, WeightTrend, BodyGoalRow, ProjectionsSection) with five dedicated half-width cards in a 2-column grid: Weight (90-day line chart, 28-day dual projection tails via linear regression and TDEE math, interactive hover tooltip, on-track chip); Waist and Bicep (line chart + 30-day trend projection, progress bar, ETA); Weekly Volume (13-week bar chart, 4-week avg, streak); Workout Frequency (per-routine 8-week completion grid). Panel titles bumped to 12px. `53559cc`
- **Set completion checkbox fix** — Checking a set complete no longer unchecks itself when an input field had focus; blur event was firing before the click handler and sending the stale `completed=false` value to the API, overwriting the toggle; fixed by tracking completion state in a ref so `handleBlur` always reads the current value. `12ac7cb`
- **Dashboard Trends section overhaul** — New exercise volume week-over-week bar chart with hover tooltips; CalVsBurned TDEE calculation fixed (was showing exercise calories only, now uses BMR+NEAT+TEF+exercise); weight trend graph moved into Goals section; Trends now appears before Goal Progress; hover tooltips added to CalVsBurned and heatmap charts showing date, macros, routines done; weekly averages table updated to last 5 weeks with full macro columns (calories, protein, carbs, fat, TDEE, net); font sizes bumped throughout; AI insight morning period end shifted from noon to 11am. `57249df`
- **Dashboard Today section redesign** — Today band now contains Fuel Today, Exercise Today (with inline recovery strip), and Weekly Goal Progress; Upcoming and Personal Bests removed from Today; Exercise Today shows today's scheduled routine with per-exercise last-time reference data instead of last-session ghost; rest day and no-schedule states added; Net vs TDEE promoted to hero stat in Fuel Today; Remaining replaced by Calories In; macro % shows actual value when over 100% and highlights in warn color; Weekly Goal Progress (renamed from This Week) renders in a 3-column grid with vertical dividers, colored pill pace badges, taller bars, and wider pace tick; Goal Progress band now has FlagshipGoal full-width; font sizes bumped throughout for legibility. `66ff2e0`
- **Recovery score** — Dashboard recovery card now shows a real 0–100 score computed from acute load (last 3 days) vs chronic load (28-day avg workout minutes); color-coded high/medium/low badge, filled progress bar, and contextual hint; server route GET /api/recovery added; recoveryApi added to shared api-client. `d6cdd82`
- **Dashboard section header polish** — Band component kicker restyled as h2 matching other page headers; gold line centering fixed; "What you fueled, lifted, and what's next" subtitle removed; Fuel Today panel meta text removed. `d6cdd82`
- **Weekly Volume goal card removed** — Removed from Goal Progress section; VolumeGoalCard component deleted. `12173bc`
- **Waist/Bicep goal cards overhauled** — Now match Weight card visual style: area gradient fill, horizontal gridlines, interactive hover tooltip, ACCENT-colored "ETA · trend" label, indigo projection line, bottom legend; progress bar removed; chart height bumped to 170. `12173bc`

## May 21, 2026

### Web

- **Time-aware AI daily insight** — Dashboard insight banner generates a personalized 1-sentence insight using Claude Haiku; morning shows yesterday's recap, afternoon shows today's progress so far, evening wraps up the day; client sends local hour to server so period is correct regardless of UTC offset; cached per user per period slot; banner label updates to Yesterday / Today so far / Today. `527dbc8`
- **Goals system unified** — Settings Goals tab now writes to legacy goalsApi (user_goals/exercise_goals tables) instead of custom_goals, fixing disconnect where edits didn't flow to dashboard displays; planning board calendar moved to new Planning tab in Settings; custom user-defined goals (bench press 200 lbs, etc.) moved to Settings Goals section. `a53df41`
- **Planning page streamlined** — Removed Schedules section (WorkoutScheduleSection, MealPlanningSection) and moved Projections section to Dashboard v4; Planning Board now renders as section header above calendar card matching Goals header style; deleted unused modal functions (AddScheduleModal, EditScheduleModal, ImportProgramModal) and cleaned up imports/state variables. `a47f785`

## May 20, 2026

### Web

- **90s rest timer on workout tracking** — Marking a set complete during an active workout automatically starts a 90s countdown timer with a progress bar, displayed as a fixed banner at bottom; includes +30s and Skip buttons; plays a synthesized ding sound when timer expires; resets to fresh 90s if another set is marked complete during rest. `bfa5f48`
- **Additional weight on bodyweight exercises** — Bodyweight exercises (lunges, push-ups, etc.) now show a +lbs field in the set row; entered weight adds to body weight for volume calculation (e.g. 130 lb body + 20 lb vest = 150 lb × reps); fixes unit mismatch where 'lb' body weight entries were treated as kg, inflating volume. `10af3bd`
- **Workout volume calculation fix** — Detail screen volume calculation now matches backend/API logic: checks weight_kg first, then uses bodyweight for bodyweight exercises; fixes discrepancy where detail showed different volumes than dashboard/history. `f92fb0e`
- **Resistance exercise type** — New exercise type for reps-only movements (e.g. Deadbug) that don't use added weight or bodyweight volume; contributes 0 to total workout volume; available in exercise type picker and defaults to tracking reps only. `f92fb0e`
- **Meal scheduling with food/recipe selection** — Planning board AddMealScheduleForm now allows selecting existing foods, recipes, or custom labels; macros auto-populate from nutrition database when food/recipe selected, can be manually edited before save; custom labels allow manual macro entry. `d78d1b8`
- **Goals system refactor** — Removed redundant old-style goal editing UI from PlanningPage and WorkoutsPage; SettingsPage migrated to new userGoalsApi for nutrition and exercise goal management; old goalsApi routes remain for backward compatibility with dashboard displays. `4b63709`
- **Planning goals overhaul** — Goals section moved above calendar; redesigned as 4-column layout (Body Composition, Daily Nutrition, Weekly Nutrition, Weekly Exercise); clicking any stat row or goal name opens edit modal; empty system goal rows hidden; removed separate Edit buttons. `ae50402`
- **Custom user-defined goals** — New goal system: name any goal, pick metric type (max weight, volume, reps, steps, distance, duration, sessions, body measurement, nutrition avg), choose source exercise or routine, set target value and optional date; goals appear on the matching card (body/nutrition/exercise). `ae50402`
- **Weekly nutrition goals** — Weekly targets editable independently; default is daily × 7 (shown as "Based on daily × 7"); user can override; stored as nullable columns on user_goals table. `ae50402`
- **Planning calendar improvements** — Larger font sizes throughout; gridlines added using `border-slate-600`; nutrition schedule recurrence (once/daily/days-of-week/etc.) added to calendar day modal Nutrition tab. `ae50402`
- **Routine history sessions clickable** — Clicking a workout session in the routine detail page history section now navigates to the full workout detail view for editing/reviewing; matches existing dashboard and history log behavior. `8f8b9e0`

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
- **Planning page** — new `/planning` route in the sidebar centralizes all goal management: nutrition targets, weekly exercise targets with volume, and body measurement goals with pace badges and projected dates. Inline goal editors removed from Today and Dashboard pages. `8de0807`

### API

- **Cleanup** — removed debug `console.log` from recipes, scrape, and aiProvider; upgraded Anthropic fallback notices to `console.warn`. `e0d7d39`

### Web

- **Log custom food (AI inline)** — added "✦ Log custom food" flow to the food log modal: describe what you ate, estimate macros with AI, log without creating a permanent food record. `d876ece`

### Mobile

- **"I Made This" logs to food log** — button now opens a meal/servings modal and logs the recipe to the nutrition food log in addition to make history. `d876ece`
- **Rest timer stays accurate when backgrounded** — replaced interval-based countdown with a start-timestamp approach; timer now resyncs from `Date.now()` on each tick. `d876ece`
- **Rest timer ding at zero** — haptic + audio alert fires when rest expires; requires EAS build (graceful no-op in Expo Go). `d876ece`
- **Routine: import last session** — exercises with no template sets now show an "Import as template sets" button that copies last-performed weights/reps as editable template rows. `d876ece`
- **New color schemes** — Midnight, Tide, and Graphite added to settings color picker. `f708cab`
- **Nav bar redesign** — replaced emoji icons with Ionicons, added Planning tab, renamed labels (Home/Plan/Log/Train/Recipes), fixed More button alignment and styling. `d1598f5`
- **Metro config** — added explicit `extraNodeModules` mapping for `@pulse/theme` to fix workspace resolution. `d1598f5`
- **Font size minimum** — replaced all `fontSize.xs` and hardcoded sub-13 sizes across all screens; chart/heatmap labels floored at 11. `af2f36d`
- **Plan tab** — fully implemented: nutrition goals with inline editing, exercise targets (workouts/minutes/volume) with progress bars, and body measurement goals with pace tracking and add/edit/delete. `8de0807`


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
