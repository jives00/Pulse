# /commit — Test, commit, and update changelog

Runs the test suite, commits if everything passes, and appends an entry to `docs/changelog.md`. Does **not** push — run `/push` afterward to push to main and monitor the deploy.

## Flags

| Flag | What it does |
|---|---|
| `--e2e` | Also run Playwright end-to-end tests before committing (slower; use for significant UI changes) |

---

## Steps

### 1. Show what will be committed
Run `git diff --stat` and `git status` so the user can see exactly what's changing before anything is committed.

### 2. Run the test suite
Always run (use absolute paths — relative `cd` fails if the shell isn't already at the repo root):
```bash
cd /c/Users/jbrom/SynologyDrive/Development/Pulse/testing/server && npm test
cd /c/Users/jbrom/SynologyDrive/Development/Pulse/testing/web && npm test
cd /c/Users/jbrom/SynologyDrive/Development/Pulse/testing/mobile && npm test
```

> **Note:** The `testing/` directory is listed in `.gitignore` and is never committed. New test files written there will not appear in `git status` and must not be staged. Do not attempt to add or commit anything under `testing/`.

If `--e2e` was passed, also run:
```bash
cd /c/Users/jbrom/SynologyDrive/Development/Pulse/testing && npx playwright test
```

### 3a. If ALL tests pass
1. Stage all changed files **except** `docs/changelog.md`, then commit (do not push yet)
2. Capture the short commit hash: `git rev-parse --short HEAD`
3. Update `docs/changelog.md` with that hash (see step 4 below)
4. Stage the changelog: `git add docs/changelog.md`
5. Amend the commit to fold in the changelog (amending before push is safe): `git commit --amend --no-edit`
6. Report: "Committed. Run `/push` to deploy."

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
- Changelog update happens after the initial commit (so the hash is known), then the commit is amended before pushing — one push total
- If the same test keeps failing after two fix attempts, stop and explain the situation to the user rather than continuing to loop
- Never stage or commit anything under `testing/` — that directory is gitignored
