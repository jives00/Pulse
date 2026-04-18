# Pulse Dashboard Redesign — Implementation Plan

## Context

The user provided a Claude Design handoff (`test-handoff.zip`) with a full redesign of the web dashboard. The new design introduces an editorial single-column layout replacing the current 3-column grid, a new visual language (gold accent rules, `micro` uppercase labels, `Space Grotesk` display font, `JetBrains Mono` for numbers), and several new/reorganized sections. Mobile should have feature parity with the same visual language, keeping the existing 3-tab structure but restyled. A new Body Composition card requires new measurement types (BMI, body fat %, muscle mass, water %). The History page's Charts tab is removed (duplicated by dashboard).

---

## Scope of Changes

### Files to modify
- `apps/web/src/pages/WorkoutsDashboardPage.tsx` — full rewrite of `DashboardV2` and sub-components
- `apps/web/src/pages/RecipeHistory.tsx` — remove `charts` tab
- `apps/web/src/index.css` — add fonts + new CSS utility classes
- `apps/mobile/app/(app)/(tabs)/dashboard.tsx` — restyle all sections to match new design language
- `apps/web/src/pages/SettingsPage.tsx` — add 4 new body comp metrics to measurement goals section

### Files NOT changed
- Routing, `App.tsx`, `Layout.tsx`, API client, server routes
- `TodayPage.tsx`, `WorkoutsPage.tsx` — not redundant after this redesign
- DB / migrations — new measurement types use existing `body_measurements` table with new `metric` strings

---

## Phase 1: CSS Primitives (`apps/web/src/index.css`)

Add Google Fonts import: `Space Grotesk` (500/600/700) and `JetBrains Mono` (400/500/600).

Add CSS custom properties and utility classes mirroring the prototype:
```css
:root { --font-display: 'Space Grotesk', 'Inter', sans-serif; --font-mono: 'JetBrains Mono', ui-monospace, monospace; }
.font-display { font-family: var(--font-display); letter-spacing: -0.02em; }
.font-mono    { font-family: var(--font-mono); font-feature-settings: 'tnum'; }
.tnum         { font-variant-numeric: tabular-nums; }
.micro        { font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 600; }
.t-xs  { font-size: 11px; }
.t-sm  { font-size: 13px; }
.t-kpi { font-size: 34px; line-height: 1; }
```

---

## Phase 2: Body Composition Metrics (`WorkoutsDashboardPage.tsx` + `SettingsPage.tsx`)

Add 4 new metric keys to `METRIC_META` / `METRIC_CONFIG`:

| Key | Label | Unit | Dir | Color |
|---|---|---|---|---|
| `bmi` | BMI | (none) | down | `#D4A843` |
| `body_fat` | Body Fat | % | down | `#C5896E` |
| `muscle_mass` | Muscle Mass | lbs | up | `#86AA80` |
| `water_pct` | Hydration | % | up | `#7C9ECB` |

No DB migration needed — these are just new string values in the existing `body_measurements.metric` column.

In `SettingsPage.tsx`, add these 4 metrics to the measurement goals section so users can log targets for them (identical pattern to the existing weight/waist/bicep goal rows).

---

## Phase 3: Web Dashboard Layout (`WorkoutsDashboardPage.tsx`)

Replace `DashboardV2` render tree. Keep all existing data-fetching logic, state, and helper components — only the render tree changes.

### Section order (top to bottom)

```
1. SlimHeader
2. FuelTodayCard
3. ThisWeekCard
4. BodyCompositionCard
5. [section label: "Progress over time"]
6. CaloriesVsTDEECard     (50% width, side-by-side with VolumeHeatmapCard)
   VolumeHeatmapCard      (50% width)
7. WeightProteinRow       (2 × 50%)
8. WeeklyAveragesCard     (full width)
9. [section label: "Long game"]
10. NorthStarCard         (full width, 3-col inner)
11. CreatineCard + PersonalBestsCard (2-col)
12. TodayStatsCard        (full width — replaces old dashboard Nutrition tab concept)
13. RecentWorkoutsCard    (full width)
```

---

### Card-by-card spec

#### SlimHeader
- Greeting: `Good [morning/afternoon/evening], Jeff.`
- Subtext: sessions left this week to hit target + streak count
- Buttons: `+ Log food` (opens TodayPage) | `+ Start workout` (navigates to /workouts)

#### FuelTodayCard (3-col inner grid: `1.2fr 1fr 1.4fr`)

**Col 1 — Calories + Macros:**
- `CalorieRing` SVG (148px, sw=10): shows `actual / goal kcal` + % in center
- `MacroRow` × 3: Protein / Carbs / Fat — each shows `actual / goal g` + 4px progress bar

**Col 2 — Water + Net:**
- Water shown in **glasses** (8 oz each). Display: `X / Y glasses`. Water goal from `user_goals.water_goal_oz ÷ 8`.
- `WaterGlasses` grid of small rectangles (filled = gold, empty = border)
- Quick-log buttons: `+ 1 glass` (8 oz), `+ Large bottle` (20 oz → 2.5 glasses)
- Net vs TDEE at bottom (within col 2, compact — 2 lines max): `[net kcal] · [In deficit / In surplus]`

**Col 3 — Meals timeline:**
- Label: `Meals · (protein g)`  — clarifies the `g` column is protein
- Meals listed: Breakfast, Lunch, Dinner, Snack only (no Pre-lift category)
- Each row: `meal name | kcal | protein g`
- `+ Log food` link at top right → navigates to TodayPage

#### ThisWeekCard (2-col inner: `1fr 2.2fr`)

**Col 1 — Stats:**
- Workouts done / goal (large number + progress bar)
- Volume done / goal in lbs (large number + progress bar)

**Col 2 — Day volume bar chart (M–Su):**
- 7 bars, one per day of current week
- Today highlighted in gold, days with workouts filled, rest empty
- **Cardio sessions:** For cardio-type exercises (where `totalVolumeKg === 0`), convert `caloriesBurned` to a "volume equivalent" for the chart using `caloriesBurned × 10` as a proxy lbs value (i.e., 400 kcal burned ≈ 4000 lbs equivalent). This keeps cardio sessions visually present on the volume chart. Show a `≈` prefix on the tooltip for cardio bars to indicate the value is estimated. This approach reuses the existing `caloriesBurned` field (already estimated by the AI endpoint) without requiring new DB columns.
- Tooltip on hover: routine name + actual volume or `≈ X kcal (cardio)`

#### BodyCompositionCard (4-col)
Each column: metric label (micro) + colored status dot + large value + delta line
- Delta line format: `↑/↓/→ ±X.X unit this month` — colored by zone (sage=good, gold=warn, copper=bad)
- Metrics: BMI | Body Fat % | Muscle Mass lbs | Hydration %
- If no data logged for a metric: show `—` with a small "Log it →" link that navigates to History → Measurements

#### CaloriesVsTDEECard (50% width)
- Full-width SVG line chart, 30 days
- Gold line = calories in, dashed slate line = TDEE
- Area fill under calories line (gold, 22% opacity)
- Y-axis labels left, date labels bottom (every 5 days)
- Legend: Intake (gold) / TDEE (slate)

#### VolumeHeatmapCard (50% width, side-by-side with CaloriesVsTDEE)
- Organized **by routine** (rows) × weeks (columns), not by day-of-week
- Columns = weeks, fill horizontally until card is full (auto weeks count based on card width, typically 13+ weeks)
- Each cell = total volume for that routine in that week
- Color scale: **higher volume = darker gold** (reversed from current implementation — empty = `bg-bg`, max = `rgba(212,168,67,1)`)
- Legend: `less → more` with 5 swatches (low to high opacity gold)
- Footer stats: weekly avg | best week | active days

#### WeightProteinRow (2 × 50%)

**WeightTrendCard:**
- SVG line chart (gold line, area fill)
- **Time range selector**: 30d | 90d (default) | 1yr | All — tabs above the chart
- Y-axis labels, last point dot, current value + avg + Δ in footer

**ProteinTrendCard:**
- SVG line chart (steel-blue line)
- 30-day fixed window
- Goal line (dashed gold)
- Current value + 30-day avg + Δ in footer

#### WeeklyAveragesCard
- Table columns: Week | Calories | Protein | Carbs | Fat | TDEE | Net
- **Newest week at top** (reverse chronological)
- Current week row highlighted (gold micro label `current`)
- Net column colored: green = deficit, copper = large surplus, muted = maintenance

#### NorthStarCard (3-col)
Each cell reuses existing `GoalGaugeCard` logic, restyled:
- Current value (large display font) + target below
- Progress ring (pace-colored) with % inside
- `Sparkline` SVG (last 10 readings, area fill, gold)
- Pace badge + ETA in footer row (border-top)

#### TodayStatsCard (full width — new, replaces previous "other tab" content)
- Shows today's summary inline on the dashboard: same data as TodayPage's `NutritionSummaryCard` (calorie ring, macros, water, meals breakdown)
- This card effectively consolidates the "Nutrition" sub-tab that previously existed on the old dashboard
- The old separate "other" dashboard tab is removed with this card present on the main page

#### CreatineCard + PersonalBestsCard (2-col)

**CreatineCard:**
- Full-circle saturation gauge (purple, 120px)
- Phase badge
- KV rows: Days logged | Last 7 days (X/7) | Next milestone

**PersonalBestsCard (redesigned):**
- **Top 3 exercises by max weight** (heaviest single-lift weight, all time): Exercise name + weight + reps + date
- **Top routine by best session volume** (single session, all time): Routine name + volume lbs + date
- Total: 4 rows

#### RecentWorkoutsCard (table)
Columns: Date | Session | Volume | Calories | Highlight | Delta | →

- **Volume**: weight workouts show `X,XXX lbs`; pure cardio workouts (totalVolumeKg === 0) show duration (`MM min`) + calories burned (`X kcal`)
- **Highlight** (gold dot + text) — possible highlight types to detect:
  - `New PR` — a set in this workout exceeded previous best weight for that exercise
  - `+X lbs PR` — specific weight increase on a lift (e.g. `+10 lbs Bench`)
  - `X × Y PR` — new rep record at a given weight
  - `Est. 1RM PR` — new estimated 1-rep max (Epley formula)
  - `Best session volume` — highest total volume ever for this routine
  - `X-day streak` — milestone streaks (7, 14, 30, 60, 90)
  - *(Highlights are detected client-side by comparing this workout's sets against prior workout data already in `workouts` array)*
- **Delta column**: `▲ X%` / `▼ X%` vs last same-routine session volume (existing logic, reused). Show `first run` if no prior. Hidden for cardio-only sessions.

---

## Phase 4: History Page — Remove Charts Tab (`RecipeHistory.tsx`)

**Status: Not yet done.** Charts tab still exists in `RecipeHistory.tsx`.

Steps:
1. Remove `'charts'` from `type Tab`
2. Remove `chartRange`, `chartDaily`, `chartWeekly`, `chartGoals`, `chartsLoading` state
3. Remove the `useEffect` that fetches chart data when `activeTab === 'charts'`
4. Remove the derived chart values block
5. Remove the `charts` tab button from the tab bar
6. Remove the `activeTab === 'charts'` render branch (the entire charts panel JSX)
7. Remove unused imports: `DailyHistoryEntry`, `WeeklyHistoryEntry`, `UserGoals`; `LineChart`, `Line`, `BarChart`, `Bar`, `CartesianGrid`, `Legend` from recharts

Result: History page has 3 tabs — Workouts, Nutrition, Measurements.

---

## Phase 5: Mobile Dashboard Restyle (`apps/mobile/app/(app)/(tabs)/dashboard.tsx`)

**Status: Not yet done.** Current state:
- 3 tabs: `nutrition` | `exercise` | `other`
- Nutrition tab: simple progress bars for calories/protein/carbs/fat/water; MiniLineChart 30-day trends; creatine widget
- Exercise tab: This Week progress bar + 13-week line chart; Volume Heatmap (routine × week); Personal Bests (heaviest lift, best session, best stair pace); Recent Workouts (basic rows)
- Other tab: North Star Goals (weight/waist/bicep pace cards); TDEE table

Goal: feature parity with the web V3 dashboard, adapted for single-column mobile. Use existing `StyleSheet` patterns (no NativeWind), `useColors()` hook, `makeStyles(c)` factory.

### Target tab structure: 2 tabs — Nutrition | Exercise

**Nutrition tab (top → bottom):**
1. **Fuel Today** — add calorie ring using `react-native-svg` (gold stroke, actual/goal kcal + % in center); macro progress bars below; water in glasses; `+ 1 glass` and `+ Bottle (20 oz)` quick-log buttons (call `waterApi.add`, optimistic update with rollback); Net vs TDEE 2-line summary at bottom
2. **Body Composition** — 3-cell row: BMI / Body Fat % / Muscle Mass; each cell shows metric label + large value + delta vs 30 days ago + colored arrow; `—` with "Log it" if no data (water_pct removed, matching web)
3. **Calories vs TDEE** — existing MiniLineChart for calories + TDEE overlay; restyle header with gold accent bar
4. **Protein trend** — existing MiniLineChart; restyle header
5. **Weekly Averages** — horizontally scrollable table, newest week first; columns: Week | Cal | Prot | Carbs | Fat | Net; net column colored (green=deficit, copper=surplus)

**Exercise tab (top → bottom):**
1. **This Week** — workouts + volume progress bars; replace 13-week line chart with `DayVolumeBars` (7-bar M–Su current week, today gold, rest days hairline)
2. **Volume Heatmap** — existing `RoutineHeatmap`; filter stair routines (`/stair/i`); restyle header
3. **North Star Goals** — move here from Other tab; keep existing pace cards
4. **Creatine** — move here from Nutrition tab; keep existing content; restyle header
5. **Personal Bests** — replace `bestStairPace` row with 2nd-heaviest lift from a different exercise (matching web V3); show routine name for best session volume row (matching web V3)
6. **Recent Workouts** — show routine name; volume (lbs) or duration+calories for cardio; highlight text (PR detection via `computeWorkoutHighlight` logic)

**Other tab:** Remove entirely — creatine → Exercise tab, North Star → Exercise tab.

### New components to add

```tsx
// 7-bar day-of-week volume chart for current week
function DayVolumeBars({ workouts, c }: { workouts: WorkoutSummary[]; c: Colors }) {
  // M–Su bars, height proportional to volume; today = gold fill; rest = hairline
}

// Gold accent rule card header
function CardHeader({ title, meta, c }: { title: string; meta?: string; c: Colors }) {
  // 2px gold left-border View + micro uppercase title + optional muted meta
}
```

### Key implementation notes
- Use `react-native-svg` (`Svg`, `Circle`, `Path`) for calorie ring — already a dependency via Expo
- `fontVariant: ['tabular-nums']` on all numeric `Text` elements
- Water quick-log: same optimistic pattern as web (`useState` bonus + `waterApi.add` + rollback)
- Heatmap stair filter: `.filter(rId => !/stair/i.test(routineNameById[rId] ?? ''))`
- TDEE table (currently in Other tab) can be removed or absorbed into Weekly Averages card

---

## Phase 6: Verification

1. `npm run dev` — web dashboard loads without errors
2. **History page**: Charts tab removed; Workouts / Nutrition / Measurements tabs work
3. **Mobile Nutrition tab**: calorie ring renders; water glasses + quick-log buttons work; Net vs TDEE visible
4. **Mobile Body Comp**: 3 cells show; delta appears when 2+ readings exist; `—` for unlogged metrics
5. **Mobile Exercise tab**: DayVolumeBars shows current week; stair routine absent from heatmap; North Star + Creatine present
6. **Mobile Personal Bests**: row 2 shows routine name; row 3 is 2nd-heaviest lift (not stair pace)
7. **Mobile Recent Workouts**: routine name shown; PR highlights appear
8. **Mobile Other tab**: removed; 2-tab structure renders cleanly with swipe nav
9. `npm run build` — no TypeScript errors
