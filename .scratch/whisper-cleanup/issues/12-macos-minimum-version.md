# macOS minimum version

Status: resolved
Type: grilling
Blocked by: 10

## Question

[Target versions for the upgrade](10-upgrade-target-versions.md) found that Electron 44 and later no longer run on macOS 11 and 12, so the upgrade raises `minimumSystemVersion` from 11 to 13. Do we accept dropping those users (and what do they see: the last build that still runs, an in-app notice before the update), or hold Electron at the last version that supports them? Check what usage data exists on macOS versions before deciding.

## Answer

Resolved 2026-11-23 with the owner: follow the industry.

- **Minimum macOS becomes 13** (`minimumSystemVersion: '13.0'` in `electron-builder.yml`, from `'11.0'`). macOS 11 and 12 get no Apple security updates; Chrome, Slack and Discord have dropped them.
- Users on 11 or 12 keep the last build that runs. While doing the work, check that auto-update does not hand them a build that will not open (whether `electron-updater` honours the `minimumSystemVersion` in `latest-mac.yml`; if not, gate the update).
- The WhisperAPP download page says "macOS 13 or later" (today it wrongly says 10.15 in every locale, `WhisperAPP/src/lib/locales/*.json`).
- **The app records what it should:** today nothing records which macOS or app version users run. The desktop sends its app version and OS version with its requests to WhisperAPP, and WhisperAPP keeps the last seen per user. This is the standard client-version header; it also tells when old builds are gone, so Railway can be switched off ([Direct-to-Soniox design](14-direct-to-soniox-design.md)). Behavior the user sees does not change.
