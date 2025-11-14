# WhisperV2 Desktop App Agent (Electron)

## Use this file when
- Debugging anything that runs inside Electron: windows, IPC bridges, STT/summary services, or keyboard shortcuts.
- You need to know which file owns a UI view or background service.
- You want the exact command/tests to run before committing desktop work.

## Key entry points
| Area | Files to open |
| --- | --- |
| Electron bootstrap | `src/index.js`, `src/preload.js`, `src/window/windowManager.js` |
| Windows/UI | `src/ui/app/HeaderController.js`, `src/ui/listen/ListenView.js`, `src/ui/ask/AskView.js`, `src/ui/settings/SettingsView.js`, `src/ui/app/main-header.styles.css.js` |
| Listening pipeline | `src/features/listen/listenService.js`, `src/features/listen/stt/sttService.js`, `src/features/listen/summary/summaryService.js`, `src/features/listen/summary/repositories` |
| Auth/session | `src/features/common/services/authService.js`, `src/features/common/repositories/session/sqlite.repository.js` |
| Config | `src/features/common/config/config.js` (loads env overrides and defaults) |
| Shortcuts + recovery | `src/features/shortcuts/shortcutsService.js`, `src/ui/app/RecoveryToast.js`, `src/ui/app/recovery-toast.html` |

## Commands you actually run
| Command | When you need it |
| --- | --- |
| `npm run start` | Default dev flow. Rebuilds renderer, launches Electron, watches files. |
| `npm run watch:renderer` | Keep ESBuild running while iterating on UI only (launch Electron separately). |
| `npm run build:renderer` | Manual renderer build before packaging/publishing. |
| `npm run build` / `npm run build:win` | Create production artifacts via electron-builder. |
| `npm test`, `npm run test:unit`, `npm run test:integration` | Unit/integration suites (Jest). |
| `npm run test:e2e` (or `:headed`) | Playwright desktop UI checks. |

## Desktop-specific env hints
- `OPENAI_API_KEY`, `GEMINI_API_KEY` – optional LLM providers for `summaryService` + ask flows.
- `STT_RELAY_URL` – overrides the socket used by `sttService`.
- `DATABASE_PATH` – custom sqlite location if the default per-platform path is not desired.
- `whisper_API_URL` / `whisper_WEB_URL` – point the bundled web app + IPC bridge at remote hosts.
- Toggle debugging via `whisper_LOG_LEVEL` and `whisper_DEBUG` if you need verbose console output.

## Typical workflows
1. **Add or edit a service** → Update the relevant file under `src/features/**`, ensure `config.js` exposes any new env, then write/adjust tests under `tests/unit/services/*`.
2. **Change a window/UI** → Update the view component under `src/ui/**`, tweak CSS-in-JS alongside it, rebuild renderer (`npm run watch:renderer`), then run targeted E2E flow with Playwright selectors.
3. **Adjust IPC** → Touch `src/bridge/*` plus the consumer service; coordinate with `.cursor/agents/backend-api.md` if the web backend also listens for that channel.

## Tests to care about
- Smart summary triggers: `tests/unit/services/summaryService.smartTrigger.test.js`.
- STT pipeline: `tests/unit/services/sttService.test.js`.
- Crash recovery toast/UI: `tests/integration/crash-recovery/ui-recovery.test.js`.
- Playwright flows under `tests/e2e/` surface regressions in listen/ask windows.
- Need to add coverage? Follow `.cursor/tests/desktop-jest.md` for unit/integration conventions and `.cursor/tests/desktop-playwright.md` for E2E style.

## Troubleshooting reminders
- Renderer not updating? Confirm `npm run watch:renderer` is live or rerun `npm run build:renderer`.
- STT socket failures usually mean `STT_RELAY_URL` is unset or the relay is unavailable—check `docs/stt-pipeline.md`.
- IPC errors referencing the backend bridge typically originate from `config.js` returning a blank `apiUrl`.
- When windows refuse to show, inspect `windowManager.js` and `HeaderController.js` logs in the devtools console.
