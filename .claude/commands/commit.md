# /commit — Test, commit, push to main, and update changelog

Runs the test suite, commits if everything passes, pushes to main (triggering EC2 auto-deploy via GitHub Actions), and appends an entry to `docs/changelog.md`.

## Flags

| Flag | What it does |
|---|---|
| `--e2e` | Also run Playwright end-to-end tests before committing (slower; use for significant UI changes) |
| `--apk-local` | After a successful commit and push, build an Android APK on this machine via `eas build --platform android --local` |
| `--apk-cloud` | After a successful commit and push, trigger an EAS cloud APK build via `eas build --platform android` (uses an EAS build slot) |

Flags can be combined: `/commit --e2e --apk-local`

---

## Steps

### 1. Show what will be committed
Run `git diff --stat` and `git status` so the user can see exactly what's changing before anything is committed.

### 2. Run the test suite
Always run (use absolute paths — relative `cd` fails if the shell isn't already at the repo root):
```bash
cd /c/Users/jbrom/SynologyDrive/Development/EverythingApp/testing/server && npm test
cd /c/Users/jbrom/SynologyDrive/Development/EverythingApp/testing/web && npm test
cd /c/Users/jbrom/SynologyDrive/Development/EverythingApp/testing/mobile && npm test
```

If `--e2e` was passed, also run:
```bash
cd /c/Users/jbrom/SynologyDrive/Development/EverythingApp/testing && npx playwright test
```

### 3a. If ALL tests pass
- Update `docs/changelog.md` (see step 4 below) — do this before committing so the changelog is included in the commit
- Generate a commit message from the diff (one concise sentence describing what changed and why)
- Stage all changed files (including the updated changelog), commit, and push to `main`
- Report: "Pushed to main. GitHub Actions will run CI and deploy to EC2 automatically."
- If `--apk-local` was passed, run: `eas build --platform android --local` and report the output path when complete
- If `--apk-cloud` was passed, run: `eas build --platform android` and report the build URL

### 3b. If ANY tests fail
- Show which tests failed and the relevant error output (not the full log — just what's needed to understand the failure)
- Diagnose the root cause and fix the failing code
- Re-run only the previously failing tests to confirm they pass
- Report that tests are passing and proceed to commit without asking for confirmation
- Return to step 3a

### 4. Update docs/changelog.md
After tests pass, before committing:
- Look at which apps were changed (`apps/mobile`, `apps/web`, `apps/server`, `packages/`) to determine the relevant platform sections
- Use today's date to find or create a matching `## Month DD, YYYY` header at the top of the changelog (below the file header). If today's date section already exists, append to it; otherwise insert a new one.
- Under the date, add a `### Mobile`, `### Web`, or `### API` subsection as appropriate (reuse an existing one if already present under today's date)
- Add one bullet point per logical change, ending each with the short commit hash (e.g. `\`abc1234\``)
- Match the existing changelog style exactly — no extra blank lines, no trailing punctuation on hashes

---

## Rules
- Never commit or push if any test is failing
- Never skip tests (`--no-verify` is not allowed)
- Always show `git diff --stat` before committing so the user knows what's going out
- Never amend a commit that has already been pushed
- APK builds always happen after push, never before — the build uses the committed code
- Changelog update always happens after tests pass but before committing — it gets staged and included in the same commit as the code changes
- If the same test keeps failing after two fix attempts, stop and explain the situation to the user rather than continuing to loop
