# /push — Push to main and monitor deploy

Pushes the current branch to `main`, monitors the GitHub Actions CI/deploy run live, and automatically diagnoses and fixes any failures.

Run `/commit` first to ensure tests pass and the commit is ready.

## Flags

| Flag | What it does |
|---|---|
| `--apk-local` | After a successful deploy, build an Android APK on this machine via `eas build --platform android --local` |
| `--apk-cloud` | After a successful deploy, trigger an EAS cloud APK build via `eas build --platform android` (uses an EAS build slot) |

Flags can be combined: `/push --apk-local`

---

## Steps

### 1. Pre-flight check
Run `git status` to confirm there is exactly one unpushed commit on `main` and the working tree is clean. If there are uncommitted changes, stop and tell the user to run `/commit` first.

### 2. Push
```bash
git push origin main
```

### 3. Monitor the deploy
```bash
gh run watch --exit-status
```
This streams the GitHub Actions output live. Wait for it to complete.

### 4a. If the run succeeds
Report: "Pushed to main. Deploy succeeded."
- If `--apk-local` was passed, run: `eas build --platform android --local` (from `apps/mobile/`) and report the output APK path when complete
- If `--apk-cloud` was passed, run: `eas build --platform android` (from `apps/mobile/`) and report the build URL

### 4b. If the run fails
- Fetch the full failure log: `gh run view --log-failed`
- Show the relevant error output (not the full log — just what's needed to understand the failure)
- Diagnose the root cause and fix the code
- Run `/commit` to re-test and commit the fix, then push again with `git push origin main`
- Monitor again with `gh run watch --exit-status`
- If the same failure recurs after two fix attempts, stop and explain the situation to the user

---

## Rules
- Never push if there are uncommitted changes — tell the user to run `/commit` first
- APK builds always happen after a successful deploy, never before
- Never amend a commit that has already been pushed
