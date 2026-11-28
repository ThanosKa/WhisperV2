# 05: CI on Node 26 and pnpm

**What to build:** every pull request to `dev` or `main` is checked by CI on Node 26 with pnpm, and the release workflow uses the same toolchain for step 9. Follows [Spec: Steps 2 and 3](../spec.md), "Step 3: toolchain", CI.

**Blocked by:** 04

**Status:** resolved

**Label:** ready-for-agent

**Model:** Sonnet (run `/model sonnet` before `/implement`). Mechanical YAML changes with an exact list.

- [x] `ci.yml` uses Node 26 and `pnpm/action-setup`, runs one `pnpm install --frozen-lockfile`, both Jest suites, `whisper_web` lint and type-check
- [x] `ci.yml` is triggered on pull requests to `dev` and `main`
- [x] CI passes on this ticket's own pull request into `dev`
- [x] `build.yml` uses Node 26 and pnpm, same commands otherwise. It is not run, because it publishes a release
- [x] Root lint is not added to CI (it stays broken until step 4b-1)
- [x] Work on its own branch, merged into `dev` through a pull request (PR #11; review fixes in the closing PR)

## Comments

- Both workflows use `actions/checkout@v7`, `pnpm/action-setup@v6` (reads `packageManager`, pnpm 12.23.0), `actions/setup-node@v7` with `node-version-file: .nvmrc` (26) and `cache: pnpm`, then one `pnpm install --frozen-lockfile`. Majors are the latest releases on 2026-11-28.
- `ci.yml` runs `pnpm test`, `pnpm --filter whisper-frontend test`, `pnpm run web:lint`, `pnpm run web:type-check`. It still also runs on push to `main`; pull requests trigger on `dev` and `main`. No Electron suite, no root lint.
- `build.yml` keeps its triggers and publish commands, now with `pnpm run build:all` and `pnpm exec electron-builder`. Not run.
- The same commands pass locally on Node 26 / pnpm 12: install, 49 web tests, web lint, web type-check.
- CI run on PR #11: https://github.com/ThanosKa/WhisperV2/actions/runs/46142309497 passed (root Jest 124 tests, whisper_web Jest 49 tests).
