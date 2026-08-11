# Pulse Changelog — Next APK Build

Tracking changes since April 19, 2026 @ 8:39 PM.

---

## August 10, 2026

### Backend
- **Goal direction comes from the metric, not the current value** — `goalDirection` fell back to comparing `currentValue` against `targetValue` when a goal had no usable `startValue`, which reads "below target" as "climbing toward it" — true only until you arrive. The inference inverted precisely for goals that were already met, so they could never report achieved. Two of four pinned goals hit it: Waist (`start_value` 30.5 equal to target, so that step was skipped; current 29.8 inferred `up`) and Chest (`start_value` NULL; current 34.8 above target 34 inferred `down`). `GoalCatalogEntry` gains `defaultDirection` on all 19 entries, and the chain is now `cardConfig.direction` → `startValue` vs target → catalog default → `down`. An explicit `startValue` still wins, so ambiguous metrics like weight and calories keep deferring to actual intent. Shared logic, so mobile gets it too `0ce46dd`

### Frontend – Web
- **Blurb cards square off** — the two blurb cards are the only dashboard cards that don't go through `Panel`; they render their own container and hardcoded `borderRadius: 10` while `Panel` uses `0`, leaving them the only rounded cards on the page. Weekly changed alongside Today's since it shares the style `de2e11a`
- **Dashboard panels fill their grid cell** — each widget sits in a grid item the grid already stretches to the tallest item in the row, but `Panel` sized itself to its own content and sat at the top of that cell, so Fuel Today and Exercise Today rarely matched. `height: 100%` fills the cell; the content area already had `flex: 1`, so the extra space goes to the body, not the header. Applies to every panelled widget, so the Trends row equalizes too. Customize mode is unchanged — the editor-bar wrapper has auto height, so the percentage resolves to auto `2cf449f`
- **Dashboard sub-feature toggles are actually honored** — both dashboards gated their fetches on the parent module only, so unchecking Recovery, Routines, Workout schedules, or Water left `exercise`/`nutrition` on, the request still fired, and the section kept rendering; `features.recovery` was never read anywhere in either app. Each fetch now gates on `parent && child`, matching the existing `activity && healthConnect` pattern, and the disabled branch resolves to the same empty value the error path used so every consumer already handles it. Web's recovery setter no longer skips `null`, so a disabled feature clears a previously loaded value instead of leaving it stale `5a96e6b`
- **Dashboard blurb copy buttons work on the NAS** — `navigator.clipboard` only exists in a secure context (https or localhost), and Pulse is served at `http://synology:3004/pulse/`, so the property was undefined and the click handler threw with nothing catching it — the button looked dead. Local dev never hit it because localhost counts as secure. New `utils/clipboard.ts` tries the async Clipboard API then falls back to a hidden textarea + `document.execCommand('copy')`, and `useCopy` now tracks a failed state so the button reports the outcome `e7ee518`

### Frontend – Mobile
- **Finishing a workout kills the rest timer** — `handleFinish` already cancelled the alarm, but the rest period outlived it two ways. It cleared `timerRef` (the workout clock) and never touched `restStartedAt`, which drives a separate interval, so the countdown kept running until the screen unmounted and a rest expiring in that gap still fired haptics. And the cancel could be overtaken by the arm it was undoing: both functions are several `await`s long and every caller fires them without awaiting, so a set's schedule could still be in flight when finish ran its cancel to completion, arming an alarm with nothing left to cancel. Both now run through a FIFO queue so the last call wins, finishing clears the rest state outright and awaits its cancel before navigating away, and Cancel Session gets the same treatment `cdc1396`
- **Rest timer vibrates reliably from the background** — four defects made this a coin flip decided by whether Android froze the JS thread. (1) The rest alarm shared the `active-workout` identifier with the ongoing workout notification that re-posts every second, so the two collided in the tray and either one's dismissal cleared the other; it now uses `rest-end`. (A `trigger: null` post does *not* clear a stored alarm — `ExpoSchedulingDelegate.scheduleNotification` returns before touching the store — so the alarm survived the collision rather than being overwritten.) (2) On hitting zero the tick unconditionally cancelled the alarm and buzzed via expo-haptics, which does nothing from the background; that cancel is now foreground-only, and a catch-up tick more than 2s late clears the tray without buzzing twice. (3) The channel was set as `content.android.channelId`, which nothing reads — `BaseNotificationBuilder` resolves it from `trigger.getNotificationChannel()`, so the alarm would have landed on expo's fallback channel and lost `rest-complete`'s vibration pattern, ALARM audio usage, and DND bypass. (4) Neither `USE_EXACT_ALARM` nor `SCHEDULE_EXACT_ALARM` was declared, so on Android 12+ `ExpoSchedulingDelegate` fell back to an inexact alarm, rate-limited to roughly one per 9–15 min in Doze. The alarm is also no longer sticky and drops the `workout-running` category, whose Pause button would have appeared on "rest is over" `6461351`
- **Same sub-feature gating on the mobile dashboard** — Recovery, Routines, Workout schedules, and Water now gate on `parent && child` like web. One behavior note: the routines list was also what resolved a workout's display name, so with Routines off a routine-derived workout falls back to its own name `5a96e6b`
- **Food log no longer jumps down after logging water** — `handleAddWater` saved the scroll offset and restored it after the reload, but the offset lived in a ref nothing ever reset. Changing the date flips `loading` true, which unmounts the ScrollView; the remounted one starts at y=0 while the ref still held the previous day's offset, so the next water tap "restored" to a stale, larger y. The reload is silent and never unmounts the ScrollView, so the offset was already preserved — the save/restore and its now-unused `scrollRef`/`scrollYRef`/`onScroll` are gone `b4714e7`

## August 8, 2026

### Frontend – Mobile
- **Mobile typechecks clean again** — cleared all 11 pre-existing errors. `src/api/client.ts` exported `setRoutineGoal`/`deleteRoutineGoal`/`setMeasurementGoal`/`deleteMeasurementGoal` calling API methods dropped in migrations 037-040 (nothing called them, so they're removed), and was missing `createSchedule`/`updateSchedule`/`deleteSchedule`/`saveNutritionGoals` that `SettingsPlanningTab` and `AIAssistant` import. `@react-navigation/native` is now a declared dependency instead of resolving transitively through expo-router. `sceneContainerStyle` → the `sceneStyle` screen option (react-navigation 7 rename) — as a stray prop it was ignored, so this also restores a background color that had stopped applying `b57895c`
- **Deleted two dead dashboards** — `apps/web/src/pages/WorkoutsDashboardPage.tsx` (2,409 lines, imported nowhere) and mobile's unreachable `ProgressTab` plus the six helpers only it used (346 lines); the visible `/progress` route renders a different component `b57895c`

- **Feature modules on mobile** — new `pulse-features` store (expo-secure-store, kept out of `pulse-settings` because SecureStore values cap near 2KB) hydrated from `/api/preferences` after auth. Tabs gate via `href: null`, the More menu filters, the app opens to the first enabled tab, and the AI assistant only mounts when `ai` is on. Health Connect init, the foreground steps sync, and every write call site are gated on `activity` + `healthConnect`; in-screen gating covers steps, body measurements, water, recipe search, history tabs, and planning feeds. New Settings › Features tab `f225d67`
- **Swipe navigation fixed and made feature-aware** — `useSwipeNav` moved from positional indices to a `TabRouteKey` union, resolving the enabled route list from the store at swipe time so a swipe never lands on a hidden tab. This fixes a pre-existing bug where index 4 was passed by recipes, links *and* progress, index 6 was unused, and settings passed 7 against an 8-route list `f225d67`
- **Layout-driven dashboard + Settings › Dashboard** — the dashboard renders from the resolved per-platform layout through a widget registry, with tabs derived from it and fetches gated on features rather than layout visibility. The new Dashboard settings tab reorders widgets within a tab, toggles visibility, and moves widgets between tabs, saved debounced and merged per platform so a mobile save never wipes the web layout `f225d67`
- **Goal cards share one implementation with web** — ported to the same shell + four variants, fixing four mobile-only bugs: weight/waist/bicep cards were keyed off `activeGoals.find` so they rendered even when hidden, the TDEE projection omitted `stepsKcal` so the same goal projected a different date than web, achievement assumed downward goals, and `sortOrder` was ignored `f225d67`

### Backend
- **Shared goal-card logic** — `packages/api-client/src/goalCardLogic.ts` now owns direction, achievement, the three status functions, unit/value/deadline formatting, regression slope, ETA, and the TDEE pace as pure platform-agnostic functions. Web re-exports from it and mobile imports it directly, so the platforms can differ in layout and color but not in arithmetic `f225d67`

### Backend
- **Feature modules + preferences API** — migration 042 adds `users.enabled_features`, `users.dashboard_layout`, and `goals.card_config` (nullable JSON; `NULL` means catalog defaults). New `GET`/`PUT /api/preferences` partial-merges both maps, merging the dashboard layout per platform so a web-only save never wipes mobile. New `loadFeatures` middleware resolves the map per request (no cross-request cache) so a toggle applies immediately `3d7f003`
- **Aggregates degrade, CRUD never gates** — disabled modules keep their endpoints live; only cross-feature aggregates change. `calcTDEE` gains `include` flags and a `components[]` field so clients can label the figure "Expenditure" when TEF is excluded; goals-v2 list/nudges filter (never delete) goals whose category is disabled; the Excel export builds its sheet list from enabled modules; the AI insight prompt only pulls data for tracked domains and keys its 24h cache on the feature set `3d7f003`
- **WeightGurus sync respects the toggle** — the hourly cron and the manual sync both skip and log when `body` or `weightGurusSync` is off. This is the one place a toggle stops *writing* data, which is intended `3d7f003`

### Frontend – Web
- **Settings › Features** — new first tab toggling 7 modules and 13 sub-modules; sub-modules indent under their parent and grey out when it is off. Nav items, routes, Settings tabs, history tabs, goal categories, planning feeds, and the AI assistant all respect the enabled set. Deep links to a disabled area bounce to the dashboard. Data is kept and returns intact on re-enable `3d7f003`
- **Customizable dashboard** — the dashboard renders from a stored layout instead of hardcoded sections. Customize mode adds drag / ↑↓ reorder, ⅓·½·⅔·Full width chips, hide, and an add-widget tray, saved with a debounced write. With no stored layout the page is unchanged from before `3d7f003`
- **Goal cards normalized** — the five ad-hoc renderers collapse into one shell with four variants (trend / daily / streak / progress), fixing 14 inconsistencies. Real bugs among them: an upward goal (e.g. muscle mass) could never reach "achieved", a goal with exactly one data point rendered an invisible chart, a goal whose catalog key was unmapped rendered nothing at all, and `sortOrder` was ignored so card order could not be changed `3d7f003`
- **Goal presentation moved into customize mode** — pinning, ordering, card width, and per-goal display options (variant, window, projection, direction, metric line, show/hide of status·target·deadline·legend) are edited on the dashboard itself. `sortOrder` and `cardConfig` had no editor anywhere before this `3d7f003`

## July 7, 2026

### Backend
- **Passwordless network auto-login** — new `POST /api/auth/session` returns the login JWT for the admin (user id 1) when the request comes from a trusted network (no Cloudflare tunnel headers + private/Tailscale socket IP); untrusted requests get 401 and fall back to password login. Optional `TRUSTED_CIDRS` env extends the built-in private + Tailscale defaults `8dd2641`

### Frontend – Web
- **Skip the login screen on trusted networks** — on load with no stored token the web app auto-logs-in via `/api/auth/session` (LAN/Tailscale), showing a brief splash; falls back to the password form when untrusted `bebcd62`

### Backend
- **Allow LAN/Tailscale origins in CORS** — the API no longer 500s when reached by LAN IP or `*.local` (e.g. Tailscale-down on the home network); `isTrustedOrigin` accepts `CORS_ORIGIN` entries plus `localhost`, `synology`, `*.local`, and private/Tailscale IP hosts `018b885`

### Frontend – Mobile
- **Passwordless auto-login + LAN base fallback** — on launch (no stored token) the app auto-logs-in via `/api/auth/session` on a trusted network; and resolves the API base by probing `/health` across the Tailscale IP and home-LAN IP, so it works on the LAN when Tailscale is down. Shared api-client gains `setApiBase` + a network-error re-resolve hook (web unchanged) `fe0739c`
- **Fix minute-long hang off-network / with a stored token** — the base is now resolved inside the shared client's request interceptor (await the cached `/health` probe before each request) and fails fast when nothing is reachable, instead of hanging on the dead Tailscale base `213726c`
- **Show login (not an empty dashboard) when off-network** — the launch gate validates the session via `/auth/verify` (or network auto-login) before showing the app; if the server is unreachable it shows the login screen like Quest/Trakt, without clearing the stored token so a reconnect goes straight back in `985b54b`

## June 20, 2026

### Backend
- **Surface recipes with no nutrition data on "I made this"** — `POST /api/recipes/:id/log` now returns `{ nutritionLogged, nutritionSkipped }`; when a recipe has `NULL` calories it still records made-history but reports that it was not added to the food log instead of silently committing `e90b93c`

### Frontend – Web
- **Warn when logging a recipe without nutrition** — Cook modal shows a proactive warning when the recipe has no nutrition data, and an alert after logging confirms it went to made-history but not the food log `e90b93c`

### Frontend – Mobile
- **Fix "Could not log recipe" + duplicate made-history** — "I made this" now uses the single `/recipes/:id/log` endpoint (was firing a second `/log/recipe` call that errored after inserting a duplicate `recipe_log` row); shows an accurate alert based on whether nutrition was logged, plus a proactive in-modal warning for recipes with no nutrition data `e90b93c`

## June 17, 2026

### Backend
- **Fix workout update wiping calories_burned** — `PUT /api/workouts/:id` now only sets `calories_burned` if the caller explicitly provides it; previously any update (name, duration, date) silently NULLed out the stored estimate `5f49d44`

### Frontend – Web
- **Re-estimate calories on manual duration edit** — `WorkoutDetailPage` now triggers a background calorie re-estimate after the user manually changes the workout duration `5f49d44`

### Frontend – Mobile
- **Fix rest timer notification: absolute end time + single notification** — Replaced "Xs remaining" countdown text with "ready at HH:MM" so the notification body stays accurate when the app is backgrounded (JS timers pause but absolute time does not); rest-end alarm now uses `WORKOUT_NOTIF_ID` so it replaces the workout notification in-place instead of showing a second notification alongside it `a8d98f0`
- **Fix notification/timer persisting after finish workout** — Stop the interval timer before dismissing notifications in `handleFinish` so in-flight ticks can't re-create the notification after it is cleared; move notification cleanup before the API call so it runs even if save fails `a0b4a1c`

## June 16, 2026

### Frontend – Mobile
- **Rest timer countdown in workout notification + alarm alert on completion** — Notification body shows "Rest · Xs remaining" during rest, counting down each second; schedules a local alarm-channel notification when rest starts so the phone beeps/vibrates when rest ends even if the app is backgrounded or in silent mode (Android USAGE_ALARM audio attributes bypass DND/silent); +30s reschedules the alert; Skip and finish/cancel clean it up `fe5fff1`
- **Truncate long exercise names in dashboard Exercise Today card** — Added `numberOfLines={1}` + `ellipsizeMode="tail"` to the scheduled workout title and per-exercise names in the list; added `marginRight` spacing between title and Start button `13a55f0`

## June 15, 2026

### Frontend – Mobile
- **Restore tab bar during active workout** — Moved `workout/[id]` screen from `(app)/workout/` into `(app)/(tabs)/workout/` (registered with `href: null`) so the bottom nav stays visible; updated all navigation references and notification deep-link URL `bf5f3cb`

### Backend
- **Fix "last session" bar showing data from wrong session** — `getRoutineDetail` now pins all per-exercise `getLastPerformedSets` calls to a single `lastWorkoutId` (most recent completed workout for the routine) so the top bar and "Beat last" chips always reflect the same session rather than mixing data from different dates `bf5f3cb`

## June 14, 2026

### Backend
- **Ponytail refactor — server routes** — Extract `parseId`, `localDateStr`, `isSafePhotoUrl`, `resolveMediaUrl`, and recurrence utilities (`getDow`, `dateStr`, `utcDate`, `matchesRecurrence`, etc.) into `utils/routes.ts`, `utils/media.ts`, `utils/recurrence.ts`; eliminate 175 net lines across 15 route/service files `2197636`

### Frontend – Web
- **Ponytail refactor — full web module** — Extract `useEscapeKey` hook, `utils/exercises.ts`, `utils/meals.ts`, `components/goals/goalConstants.ts`, and `longDate` to `@pulse/api-client`; eliminate 170 lines of duplicate constants/helpers spread across 18 files `7240701`
- **Ponytail refactor on DashboardPage** — Extract `useCopy` hook (removes duplicate `copy()` in TodaySnapshot + WeeklyBlurb), collapse `NutritionGoalCard` + `StepsGoalCard` into shared `SimpleGoalLineCard`, replace two local `fmtNum` declarations with top-level `fmt`; 2129 → 2079 lines `ee54591`

## June 12, 2026

### Frontend – Mobile
- **Keyboard no longer hides modals** — Added `KeyboardAvoidingView` to measurement, rename, new-routine, and goal-edit modals; fixed `behavior="padding"` → platform-aware `padding`/`height` in goal log/close sheets so Android lifts correctly `5d2061b`
- **Date pickers replace manual text entry** — All YYYY-MM-DD `TextInput` fields (measurement date, goal log date, goal deadline, goal entry edit date, planning start/end/once dates, milestone target date) now open the system date picker via `@react-native-community/datetimepicker` `5d2061b`

### Backend
- **Fix recipe save with empty quantity** — Coerce empty string `quantity`/`unit` to `null` before INSERT to avoid MySQL `ER_TRUNCATED_WRONG_VALUE_FOR_FIELD` on DECIMAL columns `483a791`

## June 8, 2026

### Frontend – Web
- **Fix rest timer +30s reverts** — Timer `useEffect` was capturing `restDurationRef.current` in a stale local variable at effect start; changed tick function to read the ref directly so +30s updates persist `d279304`
- **Add set starts rest timer** — Clicking "+ Add set" during an active workout now triggers the rest timer (same as toggling a set complete) `d279304`
- **Set renumbering after delete** — Deleting a set now renumbers remaining sets sequentially in local state so gaps like 1,3 no longer appear `d279304`

### Frontend – Mobile
- **Fix HelloFresh QR scan** — Scanned URLs are now scraped and queued as inline log entries (per-serving macros, no saved recipe); scanner hint updated to mention QR codes `b32ec32`
- **Fix rest timer +30s reverts** — Same stale-capture fix applied to mobile timer `useEffect` `d279304`
- **Add set starts rest timer** — Adding a set on mobile now starts the rest timer `d279304`
- **Set renumbering after delete** — Remaining sets renumbered in local state after deletion `d279304`

### Backend
- **Renumber sets after delete** — `DELETE /workouts/:id/exercises/:weId/sets/:setId` now runs a follow-up `UPDATE` using `ROW_NUMBER()` to keep `set_number` sequential in the database `d279304`

## June 7, 2026

### Frontend – Web
- **Dashboard Weekly Blurb** — New section below Today's Blurb showing Mon–Sun summary: macro totals and daily averages (calories, protein, carbs, fat), each routine/exercise with its volume, total weekly volume, total water glasses, total steps, and latest body measurements (weight, chest, bicep, waist) with the prior-week value in parenthesis `aae83aa`

### Frontend – Mobile
- **Dashboard Weekly Blurb** — Same Weekly Blurb block added to the Today tab, with share button; fetches steps history (14 days) and water history for the current week in background alongside existing phase-2 data `aae83aa`

### Backend
- **Fix `express-rate-limit` trust proxy error** — Added `app.set('trust proxy', 1)` so rate limiting correctly identifies clients behind Docker/reverse-proxy via `X-Forwarded-For` `8244c66`

## June 6, 2026

### Frontend – Mobile
- **In-app update check and self-install** — App checks `/api/app/version` on startup and shows a banner when a newer release exists; tapping downloads the APK with progress tracking and hands it to Android's system installer. APK builds now publish as GitHub Releases instead of artifacts for direct download `ae7738e`
- **Update UX improvements** — Banner now sits below the notification bar (safe area fix), has a ✕ dismiss button, and rechecks automatically when app comes to foreground without a restart; Settings > About tab added showing installed build tag, update status, and a Download & Install button; pull-to-refresh on About tab also triggers an update check `bbcd05c`

### Backend
- **`GET /api/app/version` endpoint** — Returns latest GitHub Release tag and APK download URL; used by the mobile update banner `ae7738e`
- **Fix app-version GitHub repo name** — Route had `jives00/pulse-health` hardcoded; repo was renamed to `jives00/Pulse`, causing GitHub API 404s and silently breaking the update check `83c8c72`

### Backend
- **Fix WeightGurus sync bloating body_measurements to 185k rows** — `String(dateObject).slice(0,10)` produced "Thu Jan…" instead of "2026-01-15" when mysql2 returned DATE columns as Date objects, breaking in-memory dedup on every hourly sync run; fixed to handle both Date and string; also switched to `INSERT IGNORE`; migration 041 deduplicates existing rows and adds `UNIQUE (user_id, metric, measured_at)` as a hard backstop `49bea09`

### Frontend – Web
- **Dashboard goal cards clear independently** — Weight/waist/bicep goal cards now clear as soon as measurements arrive rather than waiting for workouts + food history to also finish; measurements fetch limited to last 365 days so the query stays fast `49bea09`
- **Dashboard Trends/Sessions loading indicators** — CalVsBurned, VolumeByWeek, and Recent Sessions panels now show "Loading…" instead of alarming empty states while phase-2 data is in flight; NutritionGoalCard and StepsGoalCard also get `isLoading` guards `34aa41d`
- **Dashboard phase-2 loading indicators** — Weight, waist, and bicep goal cards now show "Loading…" instead of a misleading "No entries yet" empty state while background data is in flight; Exercise Today panel also shows a loading placeholder until workout history arrives `9ec6fd7`
- **Dashboard loads immediately** — Split monolithic `Promise.all(13)` into a fast phase (summary, TDEE, water, steps, goals → unblocks render) and a background phase (workout history, measurements, food/step history → fills in after page is visible) `64a8020`
- **Copy-from-yesterday: global select/deselect all** — Added "Select all / Deselect all" toggle to the modal header; per-meal toggles remain unchanged `ed02e7e`
- **Copy food defaults to today** — The copy-to picker now initialises the date to today instead of the viewed date, matching mobile behaviour; move-to is unchanged `ed02e7e`

### Frontend – Mobile
- **Fix Goals tab 6-second freeze** — Replaced unmount-on-tab-switch pattern with keep-alive (`mountedTabs` Set + `display: 'none'`); Goals tab now stays mounted after first visit so its 3 heavy goal charts (360 timezone conversions + SVG renders) never recompute on return `34aa41d`
- **Dashboard phase-2 loading indicators** — Weight goal card in Goals tab shows an ActivityIndicator instead of the "no data" chip while measurements load; Exercise Today shows a spinner instead of "No workouts yet" during load; `phase2Ready` resets on every focus so indicators reappear correctly on re-entry `9ec6fd7`
- **Dashboard loads immediately** — Same two-phase loading as web: essential data (nutrition, TDEE, water, steps, goals) unblocks render first; workout charts and trends fill in after `64a8020`
- **WeightGurus sync visible for all body goals** — Broadened the "Sync from Scale" menu item in the Goals `···` sheet to appear on any body-category goal, not just `body_weight`; previously the option was invisible if no weight goal existed `12b77f5`
- **Fix keyboard covering goal log modal** — Restructured `LogProgressSheet` and `CloseGoalSheet` so `KeyboardAvoidingView` wraps the full modal content; keyboard now pushes the sheet up correctly on Android instead of covering it `da5d1ec`

### Backend
- **Fix scheduled WeightGurus sync in Docker** — Added `tzdata` to the Alpine server image so `node-cron`'s `America/Chicago` timezone resolves correctly; without it the hourly cron was silently skipped entirely `12b77f5`
- **Fix dashboard slowness** — `GET /api/workouts` was running two correlated subqueries per exercise set row to look up body weight for bodyweight volume; pre-fetch once and pass as a bound parameter, eliminating O(rows) redundant queries `64580c0`

---

## June 4, 2026

### Frontend – Web
- **Public repo cleanup** — removed hardcoded Tailscale IP, internal `synology` hostname, and personal email from committed files; `EXPO_PUBLIC_API_BASE` now sourced from GitHub secret, `NOTIFY_EMAIL` secret replaces inline address, `vite.config` and `config.ts` fallback to `localhost`, CORS synology exception removed (add host to `CORS_ORIGIN` env instead) `922884d`
- **WeightGurus sync in weight goal menu** — "Sync from Scale" option added to the `···` menu on active `body_weight` goals on the Goals page; triggers `POST /api/measurements/sync` and shows a brief inline status message `eca2134`
- **Trakt color scheme** — Added "Trakt" theme to the color scheme picker based on the Trakt dark blue palette (`#24262E` bg, `#323440` cards); also fixed `generateCssVars.ts` to update only the generated theme block instead of overwriting the full CSS file `5013844`

### Frontend – Mobile
- **WeightGurus sync in weight goal menu** — "Sync from Scale" option added to the `···` bottom-sheet menu on active `body_weight` goals; triggers `POST /api/measurements/sync` and shows an Alert with the result `eca2134`

---

## June 4, 2026

### Backend
- **WeightGurus sync ported to TypeScript** — Replaced the Synology-scheduled Python Docker container (which was failing with Docker socket permission errors) with a native TypeScript service (`weightGurusSync.ts`) running inside the Express server; added node-cron scheduled at `0 6-12 * * *` America/Chicago, `POST /api/measurements/sync` endpoint for on-demand triggers `5313e19`

### Frontend – Web
- **Sync button in Body Composition card** — Added "Sync" button to the BodyCompositionCardV3 header; spins while running, shows "+N entries" or "Up to date" for 4s, then refreshes measurements `5313e19`

---

## June 4, 2026

### Frontend – Mobile
- **Fix duplicate body goal cards on dashboard Goals tab** — `body_weight`, `body_waist`, and `body_bicep` goals were appearing both in their dedicated projection cards and again in the pinned goals section; added `DEDICATED_BODY_CARDS` exclusion set to match the web's deduplication logic `94bef13`
- **Steps sync on every app resume** — Added `AppState` listener in root layout so Health Connect steps are read and synced to the backend whenever the app comes to foreground, not just at login; removed duplicate HC read from LogTab pull-to-refresh; `useEffect([liveSteps])` keeps the steps input field reactive to store updates `93e5f07`

---

## June 3, 2026

### Backend
- **Fix 304 blank dashboard** — Disabled Express ETags (`app.disable('etag')`) to prevent Android's HTTP stack from sending `If-None-Match` and receiving `304 Not Modified` responses; Axios rejects 304s, causing `getWorkouts` (no `.catch()`) to silently fail the entire `Promise.all` and leave all dashboard state empty `caa5414`

### Frontend – Mobile
- **Defensive `.catch()` on `getWorkouts`** — All bare `getWorkouts` calls in `dashboard.tsx` and `workouts.tsx` now catch errors so a single failing request cannot wipe the entire screen's data `caa5414`
- **Fix dashboard blank cards** — Restored missing `getUpcomingSchedule` export in `apps/mobile/src/api/client.ts`; the undefined function threw synchronously before `Promise.all` could resolve, silently wiping all dashboard state `a9e918c`
- **Fix Goals tab goal card headers** — Stale `goal` variable references in weight/waist/bicep goal cards corrected to `weightGoalEntry`/`waistGoalEntry`/`bicepGoalEntry` `a9e918c`

---

## June 3, 2026

### Goals – Phase 3 Cleanup (Web + Mobile + Server)

- **Remove legacy goal tables and routes** — Dropped `exercise_goals`, `body_measurement_goals`, `routine_goals`, `custom_goals`, `goal_checkpoints`, and `_migration_review` tables; all data was migrated to the unified `goals` system in Phase 1
- **New `/api/nutrition-targets` route** — Operational nutrition settings (daily/weekly calorie/macro targets, TDEE, summary) moved out of `/api/goals` into a dedicated route that reads only from `user_goals`, which is never dropped
- **Settings Targets tab simplified** — Removed the exercise goals, body measurement goals, routine goals, and custom goals sections; the tab now contains only daily and weekly nutrition targets
- **Dashboard migrated off legacy APIs** — Web dashboard and workouts dashboard now derive exercise goal values from goals-v2; workout frequency card visibility and routine goals derived from active goals instead of `routine_goals` table
- **Planning calendar migrated to milestones** — `goal_checkpoints` replaced with goal milestones on both web (PlanningCalendarCard) and mobile (SettingsPlanningTab); adding a milestone now requires selecting a parent goal
- **Mobile dashboard and workouts migrated** — `getExerciseGoals`, `getMeasurementGoals`, `getRoutineGoals` removed; body measurement targets and exercise goals now derived from goals-v2 active goals
- **Fix AI assistant nutrition goal updates** — `updateNutritionGoals` replaced with `nutritionTargetsApi.save()` so AI-suggested nutrition changes correctly write to `user_goals` (the table that drives food log rings) instead of the now-dropped `custom_goals`
- **Fix delete-account data wipe** — `custom_goals`, `body_measurement_goals`, `routine_goals`, and `goal_checkpoints` rows were never cleaned up on account deletion; now included in the goals scope wipe
- **Add `/api/goals-v2/milestones` endpoint** — Returns all active-goal milestones for a user in one call, used by the planning calendar

---

## June 1, 2026

### Frontend – Web

- **Remove meal card photo headers** — Replaced food photo / emoji headers in meal cards with a flat panel-style header (micro label + calorie count) consistent with other cards on the page `fab53c4`
- **Fix macro % display when over goal** — Protein/carbs/fat percentage now shows the true value (e.g. 104%) instead of capping at 100% while the progress bar still caps at full width `fab53c4`
- **Add selective copy-from-yesterday modal** — "Copy from yesterday" now opens a modal showing all logged items grouped by meal with checkboxes; user picks which items to copy before confirming `fab53c4`
- **Make dev proxy API target configurable** — `vite.config.ts` reads `API_TARGET` from `.env.local` so local dev can proxy to the NAS API without a local server `fab53c4`
- **Fix weekly avg net vs TDEE mismatch** — WeeklyAvgTable now uses `todayTDEE.total` directly for today's row instead of reconstructing from parts, so it matches FuelToday exactly `cf70f83`
- **Dashboard goal visibility toggles** — Each body measurement goal, workout goal, and custom goal now has a "Show on dashboard" toggle in Settings; Goal Progress band renders only flagged cards and hides entirely when none are selected; all body metrics (chest, hips, body fat, etc.) can now show cards, not just weight/waist/bicep; custom goals appear as target cards with countdown `7d2f016`
- **Fix custom goal invalid date display** — `target_date` from MySQL was returned as a Date object and serialized incorrectly; fixed with instanceof check matching the pattern used in the measurements route `7d2f016`

---

## May 31, 2026

### Backend

- **Add Steps Log to Excel export** — Sheet 8 "Steps Log" added to the settings data export, querying `steps_log` over the selected date range with Date, Steps, and Source columns `6af0d8a`
- **Migrate npm → pnpm** — Added `pnpm-workspace.yaml`, generated `pnpm-lock.yaml`, removed `workspaces` field from root `package.json`, updated all workspace cross-references to `workspace:*` protocol, pinned `packageManager: pnpm@10.33.2` for corepack `4716b60`
- **Migrate Jest → Vitest (server tests)** — Replaced `jest`/`ts-jest` with `vitest` in `testing/server`; migrated all `jest.*` calls to `vi.*` in mock and service test files; added `vitest.config.ts`; cleaned leftover Jest/Babel deps from `testing/web` `4716b60`
- **Dockerize server and web** — Multi-stage `Dockerfile` for each: server uses `pnpm deploy` to produce a flat production `node_modules`; web uses Vite build + `nginx:alpine` serving the SPA at `/pulse/` `4716b60`
- **Add docker-compose.yml** — `pulse-server` on port 3000 (joins `shared-db` external network), `pulse-web` on port 3004; images from `ghcr.io` `4716b60`
- **Replace CI deploy workflow** — Removed EC2 SSH deploy; now builds and pushes `pulse-server` and `pulse-web` images to `ghcr.io` on merge to main; APK build job updated to use pnpm `4716b60`
- **Fix TS lib target** — `apps/web/tsconfig.json` bumped from ES2020 to ES2022 to resolve pre-existing `Array.at()` type error `4716b60`

---

## May 28, 2026

### Frontend – Mobile

- **Fix HC steps race condition on app open** — Added `useStepsStore` (Zustand) so the background HC sync in `_layout.tsx` immediately propagates the live step count to the dashboard and Log tab without waiting for a server re-fetch; both screens now re-render as soon as the sync completes. `4494cc3`
- **Add HC debug display in Log tab** — Steps card shows raw `COUNT_TOTAL`, contributing data origins (package names), and the query time window to help diagnose step count inflation from multiple Health Connect sources. `4494cc3`
- **Remove HC steps debug display** — Removed temporary diagnostic UI from Log tab steps card after confirming single source (Google Fit) with count difference attributed to Fit filtering active steps in its UI vs raw pedometer data in Health Connect. `826ad57`

---

## May 27, 2026

### Backend

- **Fix APK build (Node 24)** — APK CI was failing `npm ci` because the lock file was generated with npm 11 (Node 24) but the runner used Node 20 (npm 10); bumped `build-apk` job to Node 24. `683abdf`
- **Fix APK build (npm install)** — `npm ci` still failing due to lock file inconsistency where `babel-preset-expo`'s `react-refresh` dep has no resolvable top-level entry; replaced with `npm install` which self-heals on clean install. `c16dda4`
- **Docs audit** — Updated `database.md`, `backend.md`, `frontend.md`, and `eas-builds.md` to reflect tables, API routes, screens, and plugins added since last update; reorganized `changelog.md` into three canonical section headers throughout. `a0810db`

### Frontend – Web

- **Share recipe via email** — Share button in recipe header copies a full HTML email (photo, styled ingredient list, numbered steps, nutrition table) to the clipboard and opens the mail client with the subject pre-filled; a notice banner instructs the user to paste the HTML into the email body. `8df41cb`
- **Fix steps bleeding into historical TDEE** — Weekly averages table and CalVsBurned chart were stamping today's `stepsKcal` onto every historical day; now fetches 60-day steps history and applies each day's own recorded steps. Historical weeks with no steps are unaffected. `ad4252d`

### Frontend – Mobile

- **Share recipe via email** — Share button in recipe action row opens the mail client with subject pre-filled and a clean plain-text body (sections separated by rule lines, blank lines between steps, column-aligned nutrition). `8df41cb`
- **Use Health Connect aggregation to fix step double-counting** — Switched from `readRecords` (sums all sources, causing duplicates when both Samsung Health and Google Fit write to Health Connect) to `aggregateRecord` so the platform deduplicates by priority source. `ad4252d`
- **Sync steps on every app open** — Moved Health Connect steps auto-sync from Train tab focus to root `_layout.tsx` so steps are updated whenever the app is launched, not only when navigating to the Log tab. `ad4252d`
- **Fix HC steps sync never firing on app open** — The sync effect in `_layout.tsx` had an empty deps array but checked `token`; if the token wasn't loaded from secure storage yet at mount time it silently bailed and never re-ran. Split into two effects: HC init runs once on mount, step sync runs when `token` becomes available. `eba0fcc`
- **Fix white flash before dashboard loads** — React Navigation's default `colors.background: white` was bleeding through navigator containers during screen transitions; fixed by providing a custom `ThemeProvider` with `colors.background: c.bg` at the root layout. Also added wrapping `View` bg, `animation: none` on index screen during auth redirect, and `backgroundColor` on dashboard `ScrollView`. `a077576`
- **Edit entry modal lifts above keyboard** — Wrapped the food log edit bottom sheet in `KeyboardAvoidingView` (behavior: padding) so tapping the quantity field no longer hides the modal behind the soft keyboard; also added `keyboardShouldPersistTaps="handled"` to the sheet's ScrollView. `434e604`

---

## May 26, 2026

### Frontend – Web

- **Today's Blurb shows one bullet per workout with correct names** — Same fix as mobile; `TodaySnapshot` now accepts the full array of today's workouts and renders a line per entry. `a0497e6`

### Frontend – Mobile

- **Recipe action buttons moved above title for full-width title display** — Star, Modify, and Edit buttons now appear in a right-aligned row above the recipe name so the title is no longer squished. `d133b2f`
- **Surface voice recognition errors in AI assistant** — `useVoice` now exposes a `voiceError` string when `Voice.start()` throws or `onSpeechError` fires; `AIAssistant` displays it instead of silently failing. Root cause on current device: native module is `null` (APK predates Gradle 9 patch). `24be945`
- **Eliminated white screen flash during screen loads** — Added `contentStyle: { backgroundColor: c.bg }` to both root and app-level Stack navigators so the theme background fills immediately instead of flashing white between screens. `009207d`
- **Calorie ring and macro bars turn green at ±5% of goal** — Fixed macro bars to match web (removed `!over` guard so 100–105% range also goes green); added same logic to mobile calorie ring and web calorie ring SVG stroke. `737fcdb`
- **Fix voice mic, Health Connect permissions, and AI screen layout** — Disabled new arch (`newArchEnabled=false` via `expo-build-properties`) so `@react-native-voice/voice` native module loads and mic works; added `VIEW_PERMISSION_USAGE` intent filter via plugin so Pulse appears in Health Connect's app list and switched to `requestPermission()` with settings fallback; moved `KeyboardAvoidingView` to wrap full AI modal so input stays above keyboard; applied safe area top inset to AI header so it clears the status bar. `6e10b12`
- **Fix HC crash and voice new arch via dedicated plugin** — Reverted Health Connect button to `openHealthConnectSettings()` only (`requestPermission()` crashes Samsung Galaxy); replaced `expo-build-properties` new arch flag with a `withOldArch` config plugin that directly overwrites `newArchEnabled=false` in `gradle.properties` after `expo prebuild` generates it from the SDK 55 template. `b9eae85`
- **Replace voice recording with expo-av + Gemini transcription** — `@react-native-voice/voice` returns null under RN 0.83 new arch and `newArchEnabled=false` caused a CMake build failure; removed both in favour of `expo-av` (new arch compatible) for local recording and a new `POST /api/ai/assistant/transcribe` server endpoint that uses Gemini 1.5 Flash for transcription. Mic now records on tap, transcribes on second tap. `76087ab`
- **Remove in-app mic; use keyboard mic for voice input** — `expo-av@15.0.2` fails to compile against `expo-modules-core@55.0.25` (`resolveView` unresolved in `ViewUtils.kt`); no stable audio recording library is compatible with RN 0.83 new arch. Removed the mic button; Android keyboard's built-in microphone works in any focused TextInput. Hint text updated. `45cb015`
- **Restore in-app mic via expo-audio canary + Gemini transcription** — Switched to `expo-audio@55.0.9-canary` (SDK 55 first-party, audio-only, new arch native) which avoids the `ViewUtils.kt` issue. Tap mic to record, tap stop to transcribe via Gemini 1.5 Flash, transcript auto-populates input. Fixed AI modal double-render flicker on Android Back (`KeyboardAvoidingView behavior='padding'` + blur-before-close). `de2d32e`
- **Add RecognizerIntent-based voice input to AI assistant** — Custom Expo config plugin injects a `ReactContextBaseJavaModule` that uses Android's `RecognizerIntent` activity system, bypassing the `CallInvokerHolder::getCallInvoker` JNI removal in RN 0.83 new arch that broke all audio recording libraries. Mic button launches system speech dialog with native VAD; transcript auto-populates input on return; red stop button shown while listening. `3910705`
- **Fix SpeechRecognizerModule Kotlin compile errors** — `currentActivity` must be accessed via `reactCtx.currentActivity` (explicit ReactApplicationContext ref) in RN 0.83 new arch; also suppressed `startActivityForResult` deprecation warning. `c17e245`
- **Fix onNewIntent signature in SpeechRecognizerModule** — `ActivityEventListener.onNewIntent` in RN 0.83 takes non-nullable `Intent`; our `Intent?` didn't override it, leaving the abstract method unimplemented. `d2b9c83`
- **Fix SpeechRecognizerPackage never registering** — Expo SDK 55 / RN 0.83 generates a `MainApplication.kt` that uses `ExpoReactHostFactory` with a `PackageList.apply{}` block; the old regex targeting `return packages` never matched, so `NativeModules.SpeechRecognizer` was always undefined. Now targets the template comment line with a legacy fallback and throws on no match. `59e25b3`
- **Voice UX improvements and fix white launch background** — AI assistant now auto-submits transcript on return from speech dialog; TTS is on by default so responses are read aloud; `EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS=6000` extends the initial listening window; `AppTheme` now sets `android:windowBackground` to `@color/splashscreen_background` so the dark background shows immediately after splash instead of flashing white. `f7c223a`
- **Removed expo-av to fix startup crash on RN 0.83** — `expo-av 15.1.7` references `CallInvokerHolder::getCallInvoker` which was removed from RN 0.83's new architecture; `AVManager.<clinit>` threw `UnsatisfiedLinkError` at native module init before any JS loaded, crashing every build on open. Removed the package and its one dead usage (the `ding.wav` asset never existed). `adcc9fd`
- **Mobile UI fixes: AI summary removed, modal dismiss, pull-to-refresh, routine sorting** — Removed AI insight card from dashboard; fixed DayModal to dismiss on outside tap using Pressable overlay; added pull-to-refresh to all Settings tabs with 500ms spinner; fixed routine sorting to use `nextOccurrenceDate` from API (routines with schedules appear first, sorted by soonest date). `5db0b1a`
- **Health Connect write sync + APK startup crash fix** — Replaced `requestPermission()` at startup with `syncGrantedPermissions()` to prevent native Activity crash; rewrote `healthConnectWriter.ts` with correct v3 API (`insertRecords`, `deleteRecordsByUuids`, correct field shapes); added `withHealthConnectPermissions` config plugin for all six HC manifest permissions with dedup guard for the rationale intent-filter; fixed TS errors across `index.tsx`, `edit.tsx`, `useColors.ts`; upgraded expo SDK packages; aligned `@types/react`/`react` versions across workspaces; fixed `metro.config.js` `watchFolders`; updated `eas-builds.md` pre-build checklist. `c4fec5d`
- **Fixed Health Connect steps sync race condition and missing permission prompt** — `readTodaySteps` now calls `syncGrantedPermissions()` directly instead of the stale startup cache, fixing timing issues on app open; added `requestPermission` to `useHealthSteps` and a "Connect Health Connect" button in the steps card so the READ_STEPS permission dialog is actually shown; fixed label from "Samsung Health" to "Health Connect". `5e49f6b`
- **Fixed "Connect Health Connect" button crashing app on Samsung Galaxy** — `requestPermission()` launches an Android Activity for result which kills the RN process on Samsung devices; switched to `openHealthConnectSettings()` which opens Health Connect directly to Pulse's permissions page; `readTodaySteps` now calls `setPermissionGranted` so the button hides automatically when the user returns after granting. `d90f66a`
- **Quick Log for single exercises** — New ⚡ Quick Log button in the Log tab header opens a two-step modal: searchable exercise picker, then a set logger with last-session reference and columns that adapt to the exercise's trackedFields (weight/reps/duration/distance/steps). Auto-saves on field blur; Finish discards empty sets and marks the workout complete; back/close before finishing deletes the session so no partial data is saved. `edd4cb6`
- **Today's Blurb shows one bullet per workout with correct names** — Blurb now renders a line for every workout logged today (routine or quick-log) using `buildWorkoutLine`; quick-log entries show the exercise name, routine entries append "routine" to the routine name. `buildWorkoutLine` moved to shared api-client. `a0497e6`

### Backend

- **Add audio transcription endpoint** — `POST /api/ai/assistant/transcribe` accepts base64 audio and returns the transcript via Gemini 1.5 Flash; added `transcribeAudio()` to `aiProvider`. `76087ab`
- **APK artifact renamed with timestamp and email notification on success** — Build workflow now renames the artifact to `pulse-MMDDYYYY-HHMM.apk` and sends an email notification with a direct link to the Actions run on successful build. `aa339a5`
- **Switched APK builds from EAS to Linux Gradle on GitHub Actions** — EAS tokens are monthly-limited; local Windows Gradle builds fail due to cmake `C_/...` path mangling exceeding 260 chars with no practical workaround. `apk-*` tag trigger now runs `expo prebuild` + Gradle on `ubuntu-latest` (no MAX_PATH) and uploads the APK as a workflow artifact. Zero EAS tokens used. `725fe4a`
- **Fixed deploy workflow leaving EC2 in dirty state on failure** — Added `package.json` to the pre-pull `git checkout --` reset so a failed previous deploy can't block the next one. `803006d`
- **Reverted react/react-dom pinning that broke EC2 deploy** — Reverted `apps/web` to `^19.2.0` ranges and removed root `overrides` block; the exact-pin + overrides combination broke Vite's `react-dom/client` subpath resolution during EC2 deploy when mobile workspace is excluded. `e0927dd`

## May 25, 2026

### Frontend – Web

- **Updated `logApi.getHistory` callers** — Three pages updated to pass `{ limit: N }` object after shared client signature change. `69c0a29`
- **Dead code removal** — Removed ~1,550 lines of never-rendered components across `DashboardPage`, `WorkoutsPage`, `WorkoutsDashboardPage`, and `App.tsx` (`Spark`, `RecoveryCard`, `UpcomingCard`, `PersonalBestsTable`, `Ring`, `ProgressBar`, `StatTile`, `WeeklyChart`, `BodyMeasurementsCard`, `RoutinesTab`/`ExercisesTab` duplicates, `ComingSoon`, and associated dead helpers); stripped debug `console.log` from `RoutinesTab`. `944de45`
- **Per-routine workout goals now persist when set to 0** — Fixed logic error in Goals tab where setting a routine goal to 0 was not saved; reordered condition check to explicitly handle 0 as a delete operation. `a707a5e`
- **Weekly averages TDEE fix** — Weekly averages table on dashboard now correctly includes step calories in TDEE calculations, matching the formula used in the Today section. `1d791c5`
- **Steps calories in TDEE breakdown** — Dashboard weight-goal projection and Workouts dashboard today-card now include steps calories in TDEE; formula description shows step contribution when non-zero. `1dcae3d`
- **Today's Blurb shows step count** — Today's Blurb section on the dashboard now includes a steps line when steps have been logged for the day. `e5dadcc`
- **Daily insight banner removed** — Removed the AI insight banner from the top of the dashboard, including the `InsightBanner` component, insight state, and `assistantApi.getInsight()` call. `4a17512`
- **Planning schedule edit** — Workout, meal, and nutrition schedules in the DayModal now have Edit buttons; clicking Edit pre-fills the form with existing data and calls the update endpoint instead of create; `parseRec` helper reconstructs form state from stored `recurrenceConfig` JSON. `1e6f9ae`
- **Links category dropdown icons removed** — Removed emoji icons from the category dropdown in the Links header when adding a new link, displaying only the category label. `d60cc47`
- **Routine cover image edit** — Routine detail page now displays the cover image in the right column (top of exercises section) with an "Add Photo" / "Change Photo" hover overlay; clicking the overlay opens a file picker to upload or replace the image; uploaded images display immediately via preview and persist after reload. `9c578c4`
- **Routines sorted by next scheduled occurrence** — Workouts page Routines section now sorts routines by their next scheduled date from the planning interface; routines with upcoming schedules appear first (ordered by soonest date), followed by routines without schedules; supports both direct routine schedules and routines within custom-cycle recurring schedules. `2f6e0f9`

### Frontend – Mobile

- **Fixed Health Connect write sync API** — Corrected all react-native-health-connect v3 API mismatches: record type strings, `insertRecords`/`deleteRecordsByUuids` replace non-existent `writeRecords`/`deleteRecords`, `Energy`/`Mass`/`Volume` field shapes, numeric `mealType`, `WeightRecord` uses `time` not `startTime`/`endTime`, and api-client import paths. `006f749`
- **Fixed startup crash on devices where Health Connect is unavailable** — Added `getSdkStatus()` check before `initialize()` and `requestPermission()`; app now skips all Health Connect native calls if SDK is not present. `71b3949`
- **Defensive dedup for routine goals** — Added client-side `Map`-keyed deduplication of `routineGoals` before rendering to prevent duplicate React keys surviving until migration is deployed. `bd09e1c`
- **Consolidated API client** — Replaced 1,230-line mobile fetch client with a thin shim delegating to `@pulse/api-client`; no caller files changed. Deleted unused 397-line web fetch client. Expanded shared package endpoints to cover all mobile needs. `69c0a29`
- **Dead code and type cleanup** — Fixed mobile TypeScript errors: added `@expo/vector-icons` as explicit dependency, corrected `PersonalBests` field references (`bestVolumeByRoutine`, `pacePerMinute`), fixed `useHealthSteps` permission check and `readRecords` API shape, added `'resistance'` to `Exercise.exerciseType`; removed debug `console.log` from `SettingsPlanningTab`. `944de45`
- **Health Connect write sync** — Food logs, water logs, workouts, and weight measurements now sync to Health Connect with fire-and-forget error handling. Nutrition records include macro breakdown (kcal→joules conversion). Workouts use smart exercise type mapping (30+ types with category awareness); calories logged as separate record. Weight converts lbs→kg. Uses clientRecordId for auto-upsert on edits. Gracefully skips writes if permission denied (Pulse still saves). Requires APK rebuild with new WRITE_* permissions. `c754048`
- **Dashboard swipe navigation** — Dashboard tabs (Today, Goals, Trends, Sessions) now respond to left/right swipes to navigate between them; swiping right from the last tab navigates to the next navbar section (Food Log). Navbar swipe order: Home → Log → Train → Recipes → Links → History → Settings. `e5297a2`
- **Weekly averages TDEE fix** — Weekly averages table on dashboard now correctly includes step calories in TDEE calculations, matching the formula used in the Today section. `1d791c5`
- **Steps auto-sync from Samsung Health** — Steps now auto-sync from Samsung Health via Health Connect when the Workouts Log tab opens; shows 'Synced from Samsung Health' or 'Manually entered' label; manual entry remains available as an override. Requires APK rebuild with Health Connect native module. `df231a2`
- **Today's Blurb shows step count** — Today's Blurb section on the dashboard now includes a steps line when steps have been logged for the day. `e5dadcc`
- **Planning tab date indicator** — Changed today's date circle to a square in the planning calendar. `43f3a7d`
- **Planning schedule edit** — Workout, meal, and nutrition schedules now have Edit buttons in SettingsPlanningTab; clicking Edit pre-fills the form with existing data (type/routineId/exerciseId/recurrence/macros/etc) and calls the update endpoint instead of create; `parseRecConfig` helper reconstructs form state from stored `recurrenceConfig` JSON. `1e6f9ae`

### Backend

- **Eliminated duplicate React key warnings** — Fixed `GET /log/frequent` returning the same food multiple times when it had multiple `is_default=1` serving sizes (replaced `GROUP BY f.id, ss.id` with correlated subquery); added migration 036 to add `UNIQUE KEY` on `routine_goals(user_id, routine_id, effective_from)` and delete pre-existing duplicate rows. `bd09e1c`
- **Server cleanup** — Removed unused imports and locals from `log`, `nutrition-schedules`, `schedules`, and `user-goals` routes; stripped debug `console.log` statements from `routines` route; added duplicate-prefix guard to `migrate.ts` (throws on startup if two migration files share a numeric prefix). `944de45`
- **migrate.ts guard softened** — Changed duplicate migration prefix guard from `throw` to `console.warn` so existing 025_*/030_* files don't block `npm run migrate`; renamed `@dram/mobile` → `@pulse/mobile`; enabled `noUnusedLocals` in web tsconfig; removed remaining dead code (recharts import, `HowToTab`, `openCreate` duplicate, `MUTED`, `fmtDuration`, unused helpers); added root `check` script. `4c6d96b`
- **Nutrition schedule overrides daily macro goals** — Planning calendar nutrition schedule entries now override daily macro and water goals on `GET /log`, `GET /goals/summary`, and `GET /water`; weekly goals are unaffected. `8cc5052`
- **Steps calories in TDEE** — Today's synced steps now contribute to TDEE at 0.05 kcal/step as a dedicated `stepsKcal` field; included in the total but kept separate from NEAT so the activity-level multiplier is unchanged. `1dcae3d`

## May 24, 2026

### Frontend – Web

- **Nutrition macro display improvements** — Nutrition schedule events on the calendar now display macros (calories, protein, carbs, fat) on separate lines with full names instead of abbreviations; removed generic "?-item cycle cycle on [days]" description for custom_cycle type. `fb78de2`
- **Planning calendar date range fix** — Calendar now shows 14 days forward (removed yesterday, added one day to future); resolves off-by-one display issue. `fb78de2`
- **Timezone bug fix** — Planning calendar and recipe history pages fixed `todayStr()` function to use local dates instead of UTC, matching backend /upcoming endpoints. `fb78de2`

### Frontend – Mobile

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

### Backend

- **Custom cycle recurrence** — Nutrition schedules and meal schedules now support `custom_cycle` recurrence type; recurrence config stores `cycleDays` array and `days` array for day-of-week filtering; `matchesRecurrence()` checks day-of-week membership then counts elapsed days for position. Migration 035 added `custom_cycle` ENUM value. `fb78de2`
- **Timezone bug fix in /upcoming endpoints** — All three schedule /upcoming endpoints now compute `todayStr` using local date (year/month/day) instead of `new Date().toISOString().slice(0, 10)` which was returning UTC time, causing schedules to shift by one day on mobile. `fb78de2`

## May 23, 2026

### Frontend – Web

- **Dashboard Goal Progress polish** — Rest day text in Exercise Today bumped from 13 to 18px; TDEE projection in Weight Goal card now stable (TEF computed from 30-day avg calories instead of today's food log, so days with no food logged yet no longer collapse the projection to flat); Waist/Bicep goal regression limited to last 90 days so historical steep declines no longer skew the current-pace projection. `76e1546`
- **Dashboard Today's Blurb** — New section at the bottom of the dashboard renders today's workout, nutrition, and water as a plain-text blurb (matching the format: workout name + volume, calories + macros, water glasses) with a copy-to-clipboard button. `8acd5bf`
- **Dashboard v4 promoted to primary** — `/dashboard` now serves the v4 page; old WorkoutsDashboardPage retired; "Dashboard v4" nav entry removed; "v4 preview" footer label cleaned up; bundle ~88KB smaller. `908cd18`

## May 22, 2026

### Frontend – Web

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

### Frontend – Web

- **Time-aware AI daily insight** — Dashboard insight banner generates a personalized 1-sentence insight using Claude Haiku; morning shows yesterday's recap, afternoon shows today's progress so far, evening wraps up the day; client sends local hour to server so period is correct regardless of UTC offset; cached per user per period slot; banner label updates to Yesterday / Today so far / Today. `527dbc8`
- **Goals system unified** — Settings Goals tab now writes to legacy goalsApi (user_goals/exercise_goals tables) instead of custom_goals, fixing disconnect where edits didn't flow to dashboard displays; planning board calendar moved to new Planning tab in Settings; custom user-defined goals (bench press 200 lbs, etc.) moved to Settings Goals section. `a53df41`
- **Planning page streamlined** — Removed Schedules section (WorkoutScheduleSection, MealPlanningSection) and moved Projections section to Dashboard v4; Planning Board now renders as section header above calendar card matching Goals header style; deleted unused modal functions (AddScheduleModal, EditScheduleModal, ImportProgramModal) and cleaned up imports/state variables. `a47f785`

## May 20, 2026

### Frontend – Web

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

### Frontend – Mobile

- **Workout volume calculation fix** — Running volume display and notifications now match backend logic: checks weight_kg first, then uses bodyweight for bodyweight exercises; fixes mismatch with dashboard volume. `f92fb0e`
- **Resistance exercise type** — New exercise type for reps-only movements that don't contribute to volume; available in custom exercise creator and exercise type picker. `f92fb0e`
- **Goals system refactor** — Updated api/client.ts wrapper functions (getExerciseGoals, saveNutritionGoals, saveExerciseGoals) to use new /user-goals endpoints; nutrition goals split into 4 separate goal records (calories, carbs, protein, fat); all 6 mobile screens continue to work without changes. `4b63709`

### Backend

- **Additional weight on bodyweight exercises** — Migration 034 adds `additional_weight_kg` to `exercise_sets` and `routine_exercise_sets`; volume query adds carried weight to body weight for bodyweight sets; set endpoints accept `additionalWeightKg`. `10af3bd`
- **Resistance exercise type** — New ENUM value added to exercises.exercise_type; migration 033 updates the column definition. `f92fb0e`
- **Meal schedules food/recipe support** — POST and PUT endpoints now accept foodId, servingSizeId, quantity, recipeId, recipeServings, and macro fields (calories, proteinG, carbsG, fatG); macros auto-computed from food/recipe data when not manually provided; migration 030 adds columns to meal_schedules table. `d78d1b8`
- **Custom goals route** — New `GET/POST/PUT/DELETE /api/user-goals` backed by `custom_goals` table; category auto-derived from metric type server-side; JOINs exercises and workout_routines to resolve source name. `ae50402`
- **Nutrition schedules route** — New `GET/POST/PUT/DELETE /api/nutrition-schedules` with full recurrence expansion (`/upcoming?days=N`). `ae50402`
- **Weekly nutrition PATCH** — `PATCH /api/goals/weekly` updates only weekly nutrition columns on the current user_goals row without creating a new row. `ae50402`
- **Goals summary weekly fields** — `GET /api/goals/summary` now includes `weeklyCalories`, `weeklyProteinG`, `weeklyCarbsG`, `weeklyFatG`, `weeklyWaterGoalOz` inside `nutrition.goals`. `ae50402`
- **Migrations 026–032** — Schedule exercise, goal checkpoints, day types + nutrition overrides, meal schedules, nutrition schedules, custom goals, weekly nutrition columns. `ae50402`

## May 19, 2026

### Frontend – Web

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
- **Exercise detail redesign** — PB band with 4 tiles (heaviest weight, est. 1RM, best set vol, muscles); bar chart with Stats/History as gold-bar section headers; metric chips and Now/vs-30-days stats inside chart card; right column has How-To and Instructions as headers with per-line instruction spacing; all hardcoded slate colors replaced with theme tokens. `e090c74`
- **Food Log redesign** — Today page updated to match reference design: tabbed FoodSearchModal (Search / Add Recipe / Describe a Meal), Band-style section headers with gold accent line, NutritionSummaryCard with 2-column layout + large donut + glass water visualization, sharp-cornered meal cards, text-sm minimum font sizes, inline date nav in header, Copy from yesterday moved to Meals band. `fbbb525`
- **Library category filter** — food category (All, Main Dishes, Breakfast, etc.) is now a dropdown chip in the filter bar alongside Favorites/Made/Tags, replacing the old tab row. `2f53420`
- **Food log auto-refresh** — modal closes immediately after save; page updates silently in background with no loading spinner; frequent-food taps now guarded against double-log. `2f53420`
- **New recipe defaults to Food type** instead of Cocktail. `2f53420`

### Backend

- **log DELETE clears made-date** — deleting a food log entry that references a recipe now also removes the linked `recipe_log` row, keeping the recipe card's made-date accurate. `2f53420`
- **Exercise personal bests** — stats endpoint now returns workout name, date, and set details (weight × reps) for heaviest lift and best set volume. `e090c74`

## May 18, 2026

### Frontend – Web

- **Phase 10: Projections section in Planning page** — planned macros vs. weekly goals with 7-bar day chart, scheduled workout calorie burn estimate, weight projection (14-day trend + meal-plan implied rate + 30-day forward view), goal progress ETAs comparing current trajectory vs. meal plan trajectory, and What if mode for interactive daily intake adjustment. `79aa558`
- **Phase 10: Meal Planning section in Planning page** — day strip with week navigation, per-day macro totals, four meal slots with add/delete, food/recipe picker modal with debounced search and serving size/quantity picker, template save and apply controls. `57fefb7`
- **Phase 8: Steps card on Workouts page** — Routines tab now shows a steps card with today's count vs. 10,000 goal, progress bar, and manual input field. `5eb9ca9`
- **Phase 7: Frequent foods in search modal** — food search now loads top 10 frequent foods on open; shows as a tappable list when query is empty; clicking logs the food immediately at qty 1. `6311fbe`
- **Phase 7: Per-entry macros in food log** — each food entry in MealSection now shows P / C / F breakdown below the calorie count. `6311fbe`
- **Phase 7: Remove "Create Custom Food" header button** — button removed from TodayPage header; the flow remains accessible via the search modal footer. `6311fbe`
- **Phase 6: AI assistant** — floating ✦ FAB in Layout opens a slide-up chat panel; chat history with user/assistant bubbles, loading animation, and action execution via `logApi.logInline` and `goalsApi.saveNutrition`; screen context passed from `assistantStore`. `2dccb52`
- **Phase 5: Planning page scheduling** — Workout Schedule section with week strip, active schedule list, Add Schedule modal (all recurrence types), and Import Program modal. `dfe19b0`
- **Phase 5: Upcoming workouts card** — DashboardPage Upcoming card now shows real schedule data from the API instead of the routines placeholder. `dfe19b0`
- **Phase 5: Routine detail simplification** — removed template sets UI; routine detail now shows exercise list with last-session reference only. `dfe19b0`
- **Dashboard v4 preview** — new `/dashboard-v4` route with 4-band layout (Fuel, Body, Trends, Sessions) using custom SVG sparklines, display typography, and square-corner panels matching the reference design. `fda83ff`

### Frontend – Mobile

- **Phase 10: Meal Planning card in Planning tab** — day strip with week navigation, meal slots with add/delete, food/recipe picker modal, template save/apply via action sheet. `57fefb7`
- **Phase 9: Hello Fresh QR scan import** — added QR button next to the URL import field in the recipe edit screen; scanning a QR code populates the URL field so it feeds directly into the existing import flow. `7f6db3f`
- **Phase 8: Steps logger in Log tab** — daily steps card with manual input, save button, and progress toward 10,000 goal. `5eb9ca9`
- **Phase 8: Active workout banner on Routines tab** — resume banner surfaces when a workout is in progress. `5eb9ca9`
- **Phase 8: Exercise How To as default tab** — exercise detail screen opens on How To instead of Summary. `5eb9ca9`
- **Phase 8: Recent Sessions on Summary tab** — last 5 sessions shown with date, set count, top weight, and total volume. `5eb9ca9`
- **Phase 7: Frequent foods in search modal** — food search loads top 10 frequent foods when modal opens; shows tappable list when query is empty; tapping logs immediately at qty 1. `6311fbe`
- **Phase 7: Per-entry macros in food log** — each food entry now shows P · C · F macro line alongside calories. `6311fbe`
- **Phase 6: AI assistant** — floating ✦ FAB overlaid on tab layout opens a `pageSheet` modal chat; bubbles, loading indicator, error display; executes `log_food` and `update_nutrition_goal` actions; screen context from Zustand `assistantStore`. `2dccb52`
- **Phase 5: Planning tab scheduling** — Workout Schedule section with week strip, active schedule list, Add Schedule modal (all recurrence types), and Import Program modal. `dfe19b0`
- **Phase 5: Upcoming workouts card** — dashboard-v4 Now tab gains an Upcoming card showing the next 7 days from the schedule API. `dfe19b0`
- **Phase 5: Routine detail simplification** — removed template sets UI; routine detail now shows exercise list with last-session reference only. `dfe19b0`
- **Dashboard v4 preview** — new dashboard screen accessible via More menu (hidden from tab bar); matches the 4-band reference design. `fda83ff`

### Backend

- **Phase 10: Meal planning API** — migration 025 adds `meal_plan_entries`, `meal_plan_templates`, `meal_plan_template_items`; new `/api/meal-plan` route with CRUD for planned meals, template save/apply/delete; macros pre-computed at insert time from food or recipe data. `57fefb7`
- **Phase 9: Bidirectional "I Made This" sync via food log** — `POST /log` now inserts into `recipe_log` when `dramRecipeId` is present, so logging a recipe-based food entry from the food log screen also marks it as made in Recipes. `7f6db3f`
- **Phase 8: Daily steps logger** — migration 024 adds `steps_log` table; new `/api/steps` route with GET (by date), POST (upsert), and GET /history endpoints. `5eb9ca9`
- **Phase 7: Frequent foods endpoint** — new `GET /api/log/frequent` returns top 10 foods logged by the user in the past 90 days with macros per default serving; excludes quick-log entries. `6311fbe`
- **Phase 7: Bidirectional recipe log sync** — `POST /log/recipe` now also inserts into `recipe_log`, so logging a recipe from the food log screen marks it as "I Made This". `6311fbe`
- **Phase 6: AI assistant endpoint** — new `POST /api/ai/assistant` route; `runConversation` added to aiProvider for multi-turn history (Anthropic native messages, Gemini prompt-flattened); screen-aware system prompt maps recipe/food-log/routine/planning context to human-readable descriptions; structured JSON response with `log_food` and `update_nutrition_goal` action types. `2dccb52`
- **Phase 5: Workout scheduling** — new DB migration (023) adds `workout_schedules`, `workout_schedule_log`, `program_templates`, `program_template_days` tables; seeded with 3-Day Full Body, 4-Day Upper/Lower, 5-Day PPL, 6-Day PPL templates; full schedules route with recurrence expansion, override, and program import. `dfe19b0`

## May 17, 2026

### Frontend – Web

- **New color schemes** — added Midnight, Tide, and Graphite themes alongside existing Blue, Slate, Sand. `f708cab`
- **Font size minimum** — replaced all `text-xs` (11px) with `text-sm` (14px) across 23 files; bumped `--t-xs` CSS variable from 11px to 13px. `af2f36d`
- **Cleanup** — deleted unused `MacroBar` and `NutritionHistoryCharts` components. `e0d7d39`
- **Planning page** — new `/planning` route in the sidebar centralizes all goal management: nutrition targets, weekly exercise targets with volume, and body measurement goals with pace badges and projected dates. Inline goal editors removed from Today and Dashboard pages. `8de0807`
- **Log custom food (AI inline)** — added "✦ Log custom food" flow to the food log modal: describe what you ate, estimate macros with AI, log without creating a permanent food record. `d876ece`

### Frontend – Mobile

- **"I Made This" logs to food log** — button now opens a meal/servings modal and logs the recipe to the nutrition food log in addition to make history. `d876ece`
- **Rest timer stays accurate when backgrounded** — replaced interval-based countdown with a start-timestamp approach; timer now resyncs from `Date.now()` on each tick. `d876ece`
- **Rest timer ding at zero** — haptic + audio alert fires when rest expires; requires EAS build (graceful no-op in Expo Go). `d876ece`
- **Routine: import last session** — exercises with no template sets now show an "Import as template sets" button that copies last-performed weights/reps as editable template rows. `d876ece`
- **New color schemes** — Midnight, Tide, and Graphite added to settings color picker. `f708cab`
- **Nav bar redesign** — replaced emoji icons with Ionicons, added Planning tab, renamed labels (Home/Plan/Log/Train/Recipes), fixed More button alignment and styling. `d1598f5`
- **Metro config** — added explicit `extraNodeModules` mapping for `@pulse/theme` to fix workspace resolution. `d1598f5`
- **Font size minimum** — replaced all `fontSize.xs` and hardcoded sub-13 sizes across all screens; chart/heatmap labels floored at 11. `af2f36d`
- **Plan tab** — fully implemented: nutrition goals with inline editing, exercise targets (workouts/minutes/volume) with progress bars, and body measurement goals with pace tracking and add/edit/delete. `8de0807`

### Backend

- **Cleanup** — removed debug `console.log` from recipes, scrape, and aiProvider; upgraded Anthropic fallback notices to `console.warn`. `e0d7d39`

## May 14, 2026

### Frontend – Mobile

- **API base URL** — updated from bare IP to `https://berek.xyz/pulse` in both EAS build config and fallback default. `b1486ba`

### Backend

- **EC2 disk reduction** — deploy script now excludes mobile workspace from npm install and prunes devDeps after build, cutting node_modules from 606MB to ~130MB. `b1486ba`

## May 04, 2026

### Frontend – Mobile

- **Expo Go notification guard** — workout notifications now load lazily and skip unavailable notification APIs in Android Expo Go, preventing startup crashes while preserving pause/resume actions in notification-capable builds. `2c39d0c`
- **Active workout set edits** — lbs/reps inline edits now commit reliably when tapping away quickly, preventing active routine sets from reverting to their original values. `92aeb43`
- **Workout set edit row switching** — switching between set rows during an in-flight save no longer clears previous edits, preventing values from disappearing when moving to a new row before the API call completes. `3aed0a8`

## April 26, 2026

### Frontend – Web

- **Goal pace "Achieved" fix** — North Star goal cards now show "✓ Achieved" (green) with the date the goal was first met instead of "↓ Behind"; ETA label changes to "Achieved" on completion. `76bfa0f`
- **Measurement modal lag fix** — extracted modal inputs into a standalone component so typing only re-renders the modal, not the entire History page. `76bfa0f`

### Frontend – Mobile

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

### Backend

- **Log history date range** — `GET /api/log/history` now accepts `start`/`end` params; route ordering fixed so `/history` is no longer shadowed by `/:id`. `8ccb833`
- **Measurements PUT returns object** — `PUT /api/measurements/:id` now returns the full updated measurement instead of `{ success: true }`, enabling optimistic UI updates. `8ccb833`
- **Measurements route ordering fix** — `DELETE /api/measurements/:id` moved after `/goals` routes to prevent shadowing `DELETE /goals/:metric`. `8ccb833`
- **Workouts date range + bodyweight volume** — `GET /api/workouts` now accepts `start`/`end` filters; bodyweight-exercise volume now calculated using the user's most recent body-weight measurement. `8ccb833`

---

## April 25, 2026

### Frontend – Web

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

### Frontend – Mobile

- **Personal bests label fix** — "Most Calories Burned" is now a static label; the workout name moves to the subtitle line. `e7eb397`
- **Expanded highlights & personal bests (Phase 5)** — highlight column now shows all matching badges (each on its own line) instead of just the first; new highlights: all-time session volume record, best pace (stairs/min / cardio speed); fixed non-strength routines (steps, cardio_distance, cardio_duration) never getting a best-metric highlight; fixed missing first-time-exercise check; personal bests card adds "Most Calories" row, both calories and stair pace always shown. `a0d5085`
- **Insights & coaching cues (Phase 4)** — week-over-week volume/steps delta badge on dashboard; plateau detection callout on exercise detail; "beat your last" label in active workout exercise headers; week streak counter on dashboard. `563b846`

### Backend

- **Quick-log endpoint** — `POST /log/inline` logs a one-time food entry without saving it as a custom food (tagged `source='quick_log'`); migration 022 extends the `source` ENUM; custom foods list excludes quick-log entries. `e7eb397`
- **Personal bests** — `GET /api/workouts/personal-bests` now returns `mostCaloriesBurned` (calories, workout date, workout name). `a0d5085`

---

## April 24, 2026

### Frontend – Web

- **Pace as primary metric** — same pace-based display for steps and cardio_distance routines in the routine cards, today's stats blurb, recent workouts table, and Personal Bests card; `buildWorkoutLine` extracted to a testable utility. `94cfcd6`

### Frontend – Mobile

- **Pace as primary metric** — steps routines now show stairs/min (replacing raw step count) and cardio_distance routines show mi/min across the routine list, recent workouts card, and Personal Bests card (stair pace replaces stair time). `94cfcd6`
- **Workout notification updates every second** — notification body now refreshes every 1s so the elapsed timer always looks live. `66c401f`
- **Fix: notification pause/resume button stale closure** — pause/resume actions triggered from the notification now correctly read current workout state via a ref instead of a stale closure; added a 300ms delay before dismiss+reschedule on pause to prevent race conditions. `25b5ecd`
- **Fix: workout notification name and elapsed time** — routine name now appears correctly in the notification title (server JOIN fix); notification action buttons (Pause/Resume) now appear via `categoryIdentifier`; elapsed time updates via a ref so the timer stays in sync. `ff7d8e4`

### Backend

- **Pace metrics** — `GET /api/workouts/personal-bests` now returns `bestStairPace` (stairs/min, best session) instead of `bestStairTime`; `GET /api/routines` `lastPrimaryMetric` for steps returns stairs/min and for cardio_distance returns mi/min. `94cfcd6`
- **Add /commit slash command and initial changelog** — `/commit` skill added to `.claude/commands/`; `docs/changelog.md` initialized with history back to April 19. `28959fc`

---

## April 23, 2026

### Frontend – Web

- **Active workout banner on Routine Detail page** — when a workout is in progress, a banner now appears on the routine detail page with a Resume button. `5e93d77`
- **Active workout banner on Routines tab** — the banner was moved to the Routines tab on `/workouts` so it's visible while browsing routines. `bfa4586` `d12038b`
- **AI modifications of food logs** — same AI Modify feature available in the web Food Search modal and Recipe Detail page. `2e633d7`

### Frontend – Mobile

- **Workout timer pause/resume** — pause and resume buttons added to the active workout screen. Timer stops accumulating on pause. State is persisted server-side (`paused_at` + `total_paused_seconds` via migration 021). `f916cd6`
- **AI modifications of food logs** — new AI Modify option on food log entries in the Nutrition tab. Opens `AiModifyModal` where you describe a change ("I only ate half", "make it dairy-free") and AI adjusts the macros. Also available from Recipe Detail. `2e633d7`

---

## April 20, 2026

### Frontend – Web

- **Personal Bests card updated** — web workout dashboard card updated to match the new API shape from the PB redesign. `fd81bf4`
- **Fix: water bonus double-count** — water bonus is now cleared after a successful log so it can't be added twice. `a13198f`

### Frontend – Mobile

- **Personal Bests card redesign** — dashboard PB card now shows 5 metrics: best session volume per strength routine (top 3, compact grid), heaviest single lift (excluding bodyweight), fastest stair time, and all dates now show 4-digit years. `894e657`
- **Fix: crash opening Exercises tab `+` button** — `MuscleTagInput` was referencing out-of-scope variables; now calls `useColors`/`makeMStyles` internally. `b4ba0f7`
- **Fix: swipe navigation on Exercise Detail** — can now swipe left/right between Summary, History, and How To tabs. `b4ba0f7`
- **Fix: double-modal flash when editing a food log** — tapping Edit from the action sheet no longer briefly shows two modals. `b4ba0f7`
- **Fix: set row losing focus when switching fields** — tapping reps then weight (or vice versa) in the same set row no longer collapses the row; uses a ref + 50ms blur delay to distinguish same-row vs cross-row blur. `b4ba0f7`
- **Tappable exercise links in routine detail** — exercise names in the routine detail page now navigate to the exercise detail screen. `b4ba0f7`
- **Fix: Android keyboard focus jumping in routine templates** — removed `onSubmitEditing` from template set inputs so pressing Done no longer jumps focus to the next exercise block. `b4ba0f7`

---

## April 19, 2026 (post-build — infrastructure only)

### Frontend – Web

- Upgraded to React 19 to support reanimated/worklets in the monorepo. `779c77d`

### Backend

- EAS build cache disabled to clear stale Windows reanimated paths. `b8925f8`
- `react-native-reanimated` hoisted to root to fix Linux build path issue. `2a54a1d`
- `semver` v7 nested under reanimated to fix missing subpath export. `0baa878`
- CI: EC2 deploy skipped on `apk-*` tags to prevent concurrent deploys. `e2a7143`
- CI: SSH command timeout increased to 30 minutes for `npm ci`. `eda01d6`
