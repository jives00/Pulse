# /push — Push to main and monitor deploy

Pushes the current branch to `main`, monitors the GitHub Actions CI/deploy run live, and automatically diagnoses and fixes any failures.

Run `/commit` first to ensure tests pass and the commit is ready.

## Flags

| Flag | What it does |
|---|---|
| `--apk-local` | After a successful deploy, build an Android APK on this machine via Gradle (no EAS tokens needed) |
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

`gh` is installed at `C:\Program Files\GitHub CLI\gh.exe` but may not be in PATH inside the Bash tool. Use the PowerShell tool for all `gh` commands:

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch --exit-status
```

### 4a. If the run succeeds
Report: "Pushed to main. Deploy succeeded."
- If `--apk-local` was passed, build the APK via Gradle (requires Synology Drive to be paused and env vars set):
  ```powershell
  $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
  $env:ANDROID_HOME = "C:\Users\jbrom\AppData\Local\Android\Sdk"
  $env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"
  $env:CMAKE_VERSION = "3.30.3"
  cd "C:\Users\jbrom\SynologyDrive\Development\EverythingApp\apps\mobile\android"
  .\gradlew.bat app:assembleRelease -x lint -x test --% -PreactNativeArchitectures=arm64-v8a
  ```
  Report the APK path when complete: `apps\mobile\android\app\build\outputs\apk\release\app-release.apk`
  If CMake errors occur, delete stale caches first:
  ```powershell
  Remove-Item "C:\Users\jbrom\SynologyDrive\Development\EverythingApp\node_modules\react-native-reanimated\android\.cxx" -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item "C:\Users\jbrom\SynologyDrive\Development\EverythingApp\apps\mobile\android\app\.cxx" -Recurse -Force -ErrorAction SilentlyContinue
  ```
- If `--apk-cloud` was passed, run: `eas build --platform android` (from `apps/mobile/`) and report the build URL

### 4b. If the run fails
- Fetch the full failure log via PowerShell: `& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed`
- Show the relevant error output (not the full log — just what's needed to understand the failure)
- Diagnose the root cause and fix the code
- Run `/commit` to re-test and commit the fix, then push again with `git push origin main`
- Monitor again from step 3
- If the same failure recurs after two fix attempts, stop and explain the situation to the user

---

## Rules
- Never push if there are uncommitted changes — tell the user to run `/commit` first
- APK builds always happen after a successful deploy, never before
- Never amend a commit that has already been pushed
