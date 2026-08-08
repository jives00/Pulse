# Engineering Patterns & Standards

This document outlines the standard patterns and architectural decisions for the Pulse codebase.

## General Engineering Standards

- **DRY (Don't Repeat Yourself)**: Always use shared utilities in `@pulse/api-client`. Never re-define conversion, date, time, or calculation logic locally in web or mobile apps.
- **Testing**: Maintain coverage using the standalone suites in `testing/`. Ensure new features include corresponding tests in the appropriate package.
- **Dependency Management**: All packages are managed via npm workspaces from the root. Run `npm install` at the root to install everything.

## Frontend Patterns (Web & Mobile)

- **State Management**: Use **Zustand** for all application state.
    - Auth state: `authStore`.
    - UI/Settings state: `settingsStore` (persisted to `localStorage` on web, `expo-secure-store` on mobile).
- **Theming**:
    - **Web**: Use CSS variables (`dram-*` palette) via Tailwind (`rgb(var(--color-X) / <alpha-value>)`).
    - **Mobile**: Use the `useColors()` hook to get the active palette. Pass the color object `c` to a `makeStyles(c: Colors)` factory function instead of using module-level `StyleSheet.create()`.
- **API Interaction**:
    - All API calls are handled via the `api-client`.
    - Functions **must** take the `token` as the first argument.
    - The client throws on non-2xx responses; handle errors at the UI boundary.
- **Navigation & Routing**:
    - **Web**: Use React Router v6. Prefer URL-driven state (e.g., `?sub=main`) for filtering and category selection.
    - **Mobile**: Use `expo-router`. Use `useSwipeNav` for horizontal swipe-left/right navigation across main tabs.
- **Data Presentation**:
    - **Weights**: All data is stored in **kg** in the database. Always convert to **lbs** at the UI boundary using `KG_TO_LBS`.

## Backend Patterns (Server)

- **Authentication**: Use the `requireAuth` middleware for all protected routes to ensure `req.userId` is populated.
- **Database Access**: Use the MySQL pool via `pool.execute()`.
- **Transactions**: Use database transactions for any operation involving multiple related writes (e.g., the "Shadow Food" pattern where a recipe log entry necessitates a `foods` row creation).
- **Migrations**: All schema changes must be handled via SQL migration files in `apps/server/src/db/migrations/`. Files must be named with a zero-padded prefix (e.g., `00N_description.sql`) and run in order.
- **AI Integration**: Use the `aiProvider.ts` service. Implement a fallback pattern: try Anthropic (Claude) first, then fall $\rightarrow$ Gemini if the primary fails or hits quota.

## Feature-Specific Patterns

- **Barcode Scanning**:
    1. Scan barcode via `expo-camera`.
    2. Check `recipe_barcodes` via API.
    3. If not found, check `barcode_cache` for `foods`.
    4. If unknown, prompt user for name $\rightarrow$ create recipe via AI macro estimation.
- **Shadow Food Pattern**: When logging a recipe to the nutrition log, automatically upsert a corresponding `foods` row (`source='custom'`) to track macros per-serving.
- **Workout Session Lifecycle**:
    1. **Start**: `POST /api/routines/:id/start` creates a workout log.
    2. **Active**: Use `started_at` for timers. Support inline editing of sets (reps/weight).
    3. **Finish**: Calculate total duration and calories burned, then mark `completed: true`.
- **Feature Modules — gate aggregates, never gate CRUD**: A disabled module keeps every CRUD endpoint live and functional; only cross-feature *aggregates* (TDEE, goal lists, exports, AI prompts, dashboard widgets) change what they report. This keeps re-enabling trivial, avoids breaking clients whose cached preference is stale, and means a toggle can never orphan data. The one deliberate exception is the WeightGurus sync, where a toggle stops data being *written*. Toggles never destroy rows.
    - Catalogs in `packages/api-client` (`featureCatalog`, `dashboardCatalog`, `goalCardConfig`) are the single source of truth for web, mobile, and server. Each exposes a `resolveX(stored, …)` that merges stored preferences over catalog defaults — so a module or widget added in a later release is automatically on, unknown keys are dropped, and values are clamped. Store `NULL` for "all defaults" rather than backfilling.
    - **Features control availability; layout controls presentation.** Resolution order matters: filter by feature *last*, and never mutate the stored layout when a module is disabled, so a widget's position and width survive being toggled off and back on.
