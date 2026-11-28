# 02: Ask, Listen and settings smoke tests, and the six window screenshots

**What to build:** the Electron suite guards the main features and the look of every window: Ask streams an answer, Listen records and saves a session, a setting survives a restart, and each of the six windows matches a screenshot. Its results become the baseline step 3 is judged against. Follows [Spec: Steps 2 and 3](../spec.md), "Step 2: the Electron suite".

**Blocked by:** 01

**Status:** open

**Label:** ready-for-agent

**Model:** Opus (run `/model opus` before `/implement`). Listen needs a fake microphone and a fake STT relay in the relay's protocol, and the screenshots must be made stable: new tests at a new seam.

- [ ] The fake server also streams LLM answers and speaks the STT relay's WebSocket protocol with a fixed transcript
- [ ] Smoke 2 passes: a typed question in Ask gets an answer streamed from the fake server
- [ ] Smoke 3 passes: Listen starts on Chromium's fake media device, the fake transcript shows, Listen stops, and the session is in the database read from the throwaway profile after the app closes. If Listen cannot start without system audio capture, the smallest boundary is stubbed and recorded here
- [ ] Smoke 4 passes: a setting changed in Settings is still set after a restart with the same profile
- [ ] Six screenshots pass with an exact match: header, Ask, Listen, Settings, Plan, Screenshot, each in its normal state, fixed window size, animations off, changing text masked
- [ ] The suite passes three runs in a row with no change, so it is not flaky
- [ ] No app code changes, except a hook already recorded in ticket 01
- [ ] The baseline (Electron suite, root Jest, `whisper_web` Jest, lint and type-check counts) is saved to this spec's `assets/` folder
- [ ] Work on its own branch, merged into `dev` through a pull request
