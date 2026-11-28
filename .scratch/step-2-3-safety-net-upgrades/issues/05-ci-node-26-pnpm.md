# 05: CI on Node 26 and pnpm

**What to build:** every pull request to `dev` or `main` is checked by CI on Node 26 with pnpm, and the release workflow uses the same toolchain for step 9. Follows [Spec: Steps 2 and 3](../spec.md), "Step 3: toolchain", CI.

**Blocked by:** 04

**Status:** open

**Label:** ready-for-agent

**Model:** Sonnet (run `/model sonnet` before `/implement`). Mechanical YAML changes with an exact list.

- [ ] `ci.yml` uses Node 26 and `pnpm/action-setup`, runs one `pnpm install --frozen-lockfile`, both Jest suites, `whisper_web` lint and type-check
- [ ] `ci.yml` is triggered on pull requests to `dev` and `main`
- [ ] CI passes on this ticket's own pull request into `dev`
- [ ] `build.yml` uses Node 26 and pnpm, same commands otherwise. It is not run, because it publishes a release
- [ ] Root lint is not added to CI (it stays broken until step 4b-1)
- [ ] Work on its own branch, merged into `dev` through a pull request
