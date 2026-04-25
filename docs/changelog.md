# Pulse Changelog — Next APK Build

Tracking changes since April 19, 2026 @ 8:39 PM.

---

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
