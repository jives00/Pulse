# Pulse — Full Code Review
*Reviewed: 2026-04-17*

---

## 🔴 Critical Security

**1. ~~Production server over HTTP in mobile binary~~ — REJECTED (no domain)**
`apps/mobile/src/api/config.ts` — Hardcoded `http://18.223.201.191/pulse` as the default. Requires a domain name to get a TLS cert (Let's Encrypt doesn't issue certs for bare IPs). Revisit if a domain is acquired.

**2. No ownership checks on exercise mutations**
`apps/server/src/routes/exercises.ts` — `PUT /:id` and `DELETE /:id` don't check `user_id = req.userId`. Any authenticated user can edit or delete any exercise, including global built-ins other users depend on.

**3. JWT `sub` not coerced to integer**
`apps/server/src/middleware/auth.ts` — `req.userId = payload.sub` passed directly into SQL. `sub` per the JWT spec is a string. Coerce with `const uid = Number(payload.sub); if (!Number.isInteger(uid) || uid < 1) return 401;`. Also: no token revocation — changing passwords doesn't invalidate old 7-day tokens.

**4. JWT stored in localStorage on web**
`apps/web/src/store/authStore.ts` — Any XSS vulnerability steals the token. Mobile correctly uses SecureStore. Web should use httpOnly SameSite cookies or at minimum sessionStorage + short-lived tokens.

**5. Admin check is `userId === 1`**
`apps/server/src/routes/auth.ts` — If user 1 is ever deleted or re-allocated, the admin role silently disappears or transfers. Add a `role` column.

---

## 🔴 High Security

**6. SSRF on link scraper and recipe scraper**
`apps/server/src/routes/links.ts` and `apps/server/src/routes/scrape.ts` — Both fetch user-supplied URLs without the SSRF IP-range checks that the photo upload route applies (`isSafePhotoUrl`). Move that guard into a shared `safeFetch()` service and use it everywhere.

**7. S3 config bypasses env validation**
`apps/server/src/services/s3.ts` — Reads `process.env.S3_BUCKET` directly, bypassing the Zod-validated `env` object. Missing bucket silently fails at runtime instead of at startup.

**8. CORS split doesn't trim whitespace**
`apps/server/src/index.ts` — `CORS_ORIGIN.split(',')` without `.map(s => s.trim())`. A trailing space after a comma in the env var silently blocks all browser requests.

**9. Zod body validation missing on mutating endpoints**
Auth, foods, goals, log routes all cast `req.body as { … }` with no runtime check. Non-object bodies produce 500s; wrong types coerce silently into SQL (e.g. `heightCm: "hi"` → `0` in MySQL).

---

## 🟡 Performance

**10. N+1 query patterns**
- `apps/server/src/routes/foods.ts` — `/foods/custom` loops rows and queries `serving_sizes` per food. Use one `WHERE food_id IN (…)` + group in JS.
- `apps/server/src/routes/templates.ts` — `Promise.all(rows.map(r => getTemplate(r.id)))` = 1 + N queries. Replace with a join.
- `apps/server/src/routes/routines.ts` — `getLastPerformedSets` runs a correlated subquery per exercise per routine in the list endpoint.

**11. `ORDER BY RAND()` in recipes**
`apps/server/src/routes/recipes.ts` — Full table scan every call. Use `OFFSET floor(rand() * count)` or pick randomly in JS from cached IDs.

**12. Hardcoded `America/Chicago` timezone**
`apps/server/src/routes/log.ts` — Any user outside Central Time logs food into the wrong day at midnight. Read from a user profile timezone column or resolve dates on the client.

**13. Race condition on `sort_order` / `set_number`**
`apps/server/src/routes/workouts.ts` — `SELECT COUNT(*) + 1` then `INSERT` is not atomic. Double-tap or retry produces duplicate sort orders. Use `INSERT … sort_order = (SELECT MAX(sort_order)+1 …)` inside a transaction.

**14. Multi-table deletes not in transactions**
`apps/server/src/routes/auth.ts` — `DELETE /data?scope=history` fires three DELETEs via `Promise.all`. Partial failure leaves inconsistent state. Wrap in `beginTransaction`.

**15. Presigned URL cache is unbounded**
`apps/server/src/services/s3.ts` — `presignedUrlCache` (Map) grows forever; expired entries never purged. Cap with an LRU or prune lazily.

**16. Sort inside render (mobile)**
`apps/mobile/app/(app)/(tabs)/links.tsx` and `workouts.tsx` — Arrays sorted inline in JSX on every render. Wrap in `useMemo`.

**17. `buildWeeklyData` called every render**
`apps/mobile/app/(app)/(tabs)/workouts.tsx` — Expensive computation in `ProgressTab` not memoized. Add `useMemo([workouts])`.

---

## 🟡 Code Quality / Duplication

**18. ~~Two database import paths~~ — DONE**
Deleted `apps/server/src/db.ts` re-export shim; all routes now import from `config/database`.

**19. ~~Dead env vars~~ — DONE**
Removed `AUTH_USERNAME` / `AUTH_PASSWORD` from `env.ts` and their usage in `migrate.ts`.

**20. ~~Duplicated date/format helpers~~ — DONE**
Replaced inline `todayStr` in `logStore.ts`, `toDateStr` in `nutrition.tsx`, and `fmtDate`/`localDateStr`/`getWeekStart` in `workouts.tsx` with shared versions from `@pulse/api-client`. Also removed dead `PALETTES` import from `workouts.tsx`.

**21. ~~Duplicated ingredient/step insertion logic~~ — DONE**
Extracted `upsertRecipeIngredients()` and `upsertRecipeSteps()` helpers in `recipes.ts`; eliminated ~50 lines of duplicated SQL from POST and PUT.

**22. `any` casts throughout**
Key offenders: `scrape.ts:32`, `exercises.ts:43`, `tags.ts:15,36,70` (also the auth gap — these should use the typed `req.userId`), `aiProvider.ts:121`, `database.ts`, both `client.ts` files. Enable `@typescript-eslint/no-explicit-any: error`.

**23. Stub tab file**
`apps/mobile/app/(app)/(tabs)/more.tsx` — Single `<View />`. Implement or remove the `_layout.tsx` registration.

**24. ~~Hardcoded defaults scattered~~ — DONE**
Added `DEFAULTS` object at top of `excelExport.ts` consolidating the `2000`, `64`, and `75` fallback values.

---

## 🟡 Error Handling

**25. Errors silently swallowed on mobile**
Many `catch { }` blocks in `index.tsx`, `history.tsx`, `links.tsx`, `settings.tsx`, `goals.tsx`. Users see stale UI with no feedback. Add a lightweight toast/banner for at minimum network failures.

**26. No React error boundary on web**
`apps/web/src/App.tsx` — A single render error blanks the entire screen. Wrap the router in an `<ErrorBoundary>` with a reload fallback.

**27. Log store has no error state**
`apps/web/src/store/logStore.ts` — `fetchDay` sets `loading = false` in `finally` but exposes no `error` field. Network failure looks identical to an empty day.

**28. AI Gemini fallback fragile**
`apps/server/src/services/aiProvider.ts` — Gemini response is stripped of markdown fences and `JSON.parse`d with no retry or Zod validation. An extra comment line before `{…}` (common) silently errors the entire AI call.

---

## 🟡 Mobile-specific

**29. Effects missing `token` in dep array**
`settings.tsx`, `goals.tsx`, `nutrition.tsx` — `useEffect(fn, [])` references `token` from the auth store but won't re-run if token changes after logout/re-login.

**30. No cancellation on unmount**
Effects in `index.tsx`, `history.tsx`, `goals.tsx`, `settings.tsx` call `setState` on resolved promises without checking if component is still mounted. Use a `cancelled` flag or `AbortController`.

**31. `scanningActive` set before permission check**
`apps/mobile/app/(app)/(tabs)/nutrition.tsx` — If camera permission is revoked mid-session, `scanningActive = true` with no camera access produces a black `CameraView`.

**32. Dead imports in settings and workouts**
`PALETTES` imported but never referenced in `settings.tsx` and `workouts.tsx`. Bloats the JS bundle loaded on startup.

---

## ⚪ Testing

No test files exist outside of the `testing/` directory. Priority additions:

1. Auth middleware — missing header, expired JWT, non-integer `sub`, malformed token
2. Exercise ownership — PUT/DELETE on another user's exercise should 403
3. SSRF guard — requests to `127.0.0.1`, `169.254.169.254` should be rejected
4. TDEE calculation — pure function, easy to snapshot
5. Date helpers — DST edge cases
6. `logStore.fetchDay` — mock fetch + assert state transitions
7. Excel export — snapshot XLSX output for a fixture user

---

## Top 5 fixes to tackle first

1. **HTTPS + build-time env validation** on the mobile API base URL
2. **Exercise ownership checks** — cross-tenant data write is the highest blast-radius bug
3. **JWT `sub` → integer coercion** in auth middleware
4. **Zod body validation** on all mutating server endpoints
5. **SSRF guard** reused across all outbound fetches (links, scrape, photos)
