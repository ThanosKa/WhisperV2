# Step 1 baseline

Run on `step-1-housekeeping` (from `main` at 2781028) with the committed `whisper_web/.eslintrc.json` (WIP set aside), against the installed `node_modules`. Nothing installed.

| Check | Command | Result |
|---|---|---|
| Root Jest | `npm test` | exit 0. 52 suites passed, 496 tests passed |
| `whisper_web` Jest | `npm test --prefix whisper_web` | exit 0. 5 suites passed, 49 tests passed |
| Root lint | `npm run lint` | exit 127: `eslint: command not found` (not installed in root `node_modules`) |
| `whisper_web` lint | `npm run lint --prefix whisper_web` | exit 0. No ESLint warnings or errors |
| `whisper_web` type-check | `npm run type-check --prefix whisper_web` | exit 0. No errors |

Note: the spec says 124 root tests; the installed suite runs 496.

## After (same commands, after the tidy commits)

| Check | Result |
|---|---|
| Root Jest | exit 0. 13 suites passed, 124 tests passed |
| `whisper_web` Jest | exit 0. 5 suites, 49 tests passed (same) |
| Root lint | exit 127 (same: `eslint` not installed) |
| `whisper_web` lint | exit 0, clean (same) |
| `whisper_web` type-check | exit 0 (same) |

Why root Jest dropped from 496 to 124: the baseline run also picked up copies of the tests inside the three research worktrees under `.claude/worktrees/`. Removing the worktrees leaves the repo's own 13 suites and 124 tests, which matches the spec. Nothing failed before or after.
