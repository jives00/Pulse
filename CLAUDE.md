# Pulse — CLAUDE.md

## Rules

**Never commit or push without the user explicitly running `/commit` or `/push`.** Finishing a task, completing a phase, or running tests successfully is not authorization to commit. Wait for the explicit command every time.

## Project overview

Pulse is a personal health tracker: food/drink recipes, nutrition logging, workout tracking, and goal dashboards. It is a full-stack TypeScript monorepo deployed on Synology NAS (Docker) + S3. 

## Monorepo structure

```
apps/
  server/          Express API (Node + TypeScript)
  web/             React SPA (Vite + Tailwind)
  mobile/          Android app (Expo SDK 55, React Native)
packages/
  api-client/      Shared types, API client, and utility functions (used by web, mobile, and server)
  theme/           Color palette source of truth (used by web + mobile)
```

pnpm workspaces — install from the root: `pnpm install`
All packages including `apps/mobile` are in the root workspace. A single `pnpm install` from the root installs everything.

## Dev commands

Run both server and web in parallel:
```
pnpm dev
```

Or individually:
```
pnpm --filter @pulse/server dev
pnpm --filter @pulse/web dev
```

Mobile (Android emulator — start emulator in Android Studio first):
```
pnpm dev:mobile
# then press 'a' to open in emulator
```

Production build:
```
pnpm build
```

Run DB migrations:
```
pnpm migrate
```

## Test commands

Tests live in `testing/` — a standalone folder with its own packages. Each suite runs independently.

```
# Server (Vitest) — unit tests for services
cd testing/server && npm test

# Web (Vitest + jsdom) — component + store tests
cd testing/web && npm test

# Mobile (Jest + @react-native/jest-preset) — store + hook tests
cd testing/mobile && npm test
```

Note: `testing/mobile` has its own `node_modules` (isolated from root `testing/`). Run `npm install` inside it if cloning fresh. See `testing/README.md` for full setup details.

## Tech stack

| Layer | Stack |
|---|---|
| Frontend (web) | React 19, React Router v6, Zustand, Tailwind CSS v3, Recharts |
| Mobile | Expo SDK 55, React Native 0.83, expo-router, Zustand + expo-secure-store, StyleSheet (not NativeWind), react-native-health-connect (steps sync), @react-native-voice/voice + expo-speech (voice input) |
| Backend | Express 4, mysql2, bcryptjs, jsonwebtoken, Zod |
| Storage | MySQL, AWS S3 (recipe photos) |
| Auth | JWT — web: token in Zustand; mobile: token in expo-secure-store (key: `pulse-auth`) |
| Build | Vite (web), tsc (server), GitHub Actions → ghcr.io (Docker images on push to main), Gradle (mobile APK — push `apk-*` tag); EAS is legacy fallback only |

## Environment variables (apps/server/.env)

```
DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
JWT_SECRET          (min 32 chars)
PORT                (default 3000)
CORS_ORIGIN         (comma-separated, e.g. http://localhost:5173)
TRUSTED_CIDRS       (optional, comma-separated extra CIDRs for passwordless network auto-login; private + Tailscale ranges are trusted by default)
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET   (optional, for photo uploads)
ANTHROPIC_API_KEY   (optional, for AI features — tried first)
GEMINI_API_KEY      (optional, Gemini fallback when Anthropic fails/quota exhausted)
USDA_API_KEY        (optional, food database)
WG_EMAIL            (optional, WeightGurus account email — enables hourly weight sync)
WG_PASSWORD         (optional, WeightGurus account password)
WG_USER_ID          (optional, defaults to 1)
```

## Documentation Index

Detailed technical documentation is split into specialized files in the `docs/` directory:

- [Database Schema](docs/database.md) — Full MySQL table definitions and migrations.
- [Frontend Conventions](docs/frontend.md) — Routing, theming, and component responsibilities.
- [Backend Conventions](docs/backend.md) — API routes, services, and AI integration.
- [Engineering Patterns](docs/patterns.md) — Architectural decisions and implementation standards.
- [EAS Build Reference](docs/eas-builds.md) — Pre-build checklist, common failures, and fixes for EAS cloud APK builds.
- [Changelog](docs/changelog.md) — Release history and version notes.
