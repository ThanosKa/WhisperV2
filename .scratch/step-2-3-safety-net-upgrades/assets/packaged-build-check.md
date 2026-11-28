# Packaged build and macOS 13 floor: static checks (ticket 07, 2026-11-28)

Mac: Apple Silicon (arm64), Darwin 24.6.0. Node 26.13.1, pnpm 12.23.0, electron-builder 26.18.1, Electron 45.5.0.
Every build ran with the signing, notarizing and publishing variables unset (`CSC_LINK`, `CSC_KEY_PASSWORD`, `CSC_NAME`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `APPLE_API_KEY*`, `GH_TOKEN`, `GITHUB_TOKEN`), `CSC_IDENTITY_AUTO_DISCOVERY=false`, and `--publish never`. No app was launched.

## Release build without publishing (the `dist:mac` steps, signing off)

```sh
pnpm run build:all
pnpm exec electron-builder --mac --publish never -c.mac.identity=null
node scripts/add-mac-feed-minimum-system-version.js
```

`-c.mac.identity=null` replaces the owner's Developer ID from `electron-builder.yml`; `dist:mac` itself keeps it.

- Before the fix the universal merge failed: `Detected file ".../@img/sharp-darwin-arm64/lib/sharp-darwin-arm64-0.35.5.node" that's the same in both x64 and arm64 builds and not covered by the x64ArchFiles rule`. Fixed with `mac.x64ArchFiles`.
- Output: `Whisper-1.7.0-universal.dmg`, `Whisper-1.7.0-universal-mac.zip`, both `.blockmap` files, `latest-mac.yml`.
- `dist/mac-universal/Whisper.app/Contents/Info.plist`: `LSMinimumSystemVersion` = `13.0`.
- Code signature: `Signature=adhoc`, `TeamIdentifier=not set` (only the linker's ad-hoc signature from the Electron binary).
- notarize.js printed `Skipping notarization: APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not set.`

`latest-mac.yml` straight from electron-builder had no `minimumSystemVersion`. After the release step it is [latest-mac.yml](latest-mac.yml). [mac-feed-check.js](mac-feed-check.js) reads it with electron-updater's own parser and applies electron-updater's rule (`semver.lt(os.release(), minimumSystemVersion)` refuses the update):

| | electron-builder's feed | after the release step |
|---|---|---|
| `minimumSystemVersion` | not set | `"22.0.0"` |
| macOS 11.7 (Darwin 20.6.0) | updates | no update |
| macOS 12.7 (Darwin 21.6.0) | updates | no update |
| macOS 13.0 (Darwin 22.1.0) | updates | updates |
| macOS 15 (Darwin 24.6.0) | updates | updates |
| macOS 26 (Darwin 25.0.0) | updates | updates |

## Packaged app for the suite (`pnpm run package:e2e`)

`electron-builder --config tests/e2e/electron-builder.e2e.yml --mac --dir --publish never`: the release config, arm64 only, `identity: null`, `afterSign: null`, output `dist-e2e/mac-arm64/Whisper.app`.

- Log: `skipped dependencies rebuild reason=npmRebuild is set to false`, `skipped macOS code signing reason=identity explicitly is set to null`. Exit 0.
- `Info.plist`: `LSMinimumSystemVersion` = `13.0`, `CFBundleIdentifier` = `com.whisper.app`.
- `app.asar` `package.json` `main` = `tests/e2e/support/packaged-main.js`; the asar holds `tests/e2e/support/packaged-main.js` and `main-preload.js` and no other test file.
- Code signature: `Signature=adhoc`, `TeamIdentifier=not set`.
- Electron fuses (read from the sentinel in `Electron Framework`): RunAsNode on, EnableNodeOptionsEnvironmentVariable on, **EnableNodeCliInspectArguments on** (Playwright connects through `--inspect=0`), OnlyLoadAppFromAsar off, EnableEmbeddedAsarIntegrityValidation off. No fuse is flipped by the build.
- No `app-update.yml` in a `--dir` build; the preload stops the update check anyway.

### `better-sqlite3` in the packaged app

`Resources/app.asar.unpacked/node_modules/better-sqlite3/prebuilds/darwin-arm64.node` (the file `lib/darwin-arm64.js` loads; no `build/Release` copy is packaged):

- `Mach-O 64-bit bundle arm64`, byte-identical (SHA-256) to the prebuild in `node_modules`.
- Exports `_napi_register_module_v1` and `_node_api_module_get_api_version_v1`, which returns `0xa`: a Node-API module that needs Node-API 10. It has no `node_register_module_v<ABI>` export and imports no V8 or Node C++ symbols (0), so it is not tied to a Node or Electron ABI number. Electron 45.5.0 runs Node 24.22.3, which has Node-API 10.
- Links only `/usr/lib/libc++.1.dylib` and `/usr/lib/libSystem.B.dylib`.
