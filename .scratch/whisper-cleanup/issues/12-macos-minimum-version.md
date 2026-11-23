# macOS minimum version

Status: open
Type: grilling
Blocked by: 10

## Question

[Target versions for the upgrade](10-upgrade-target-versions.md) found that Electron 44 and later no longer run on macOS 11 and 12, so the upgrade raises `minimumSystemVersion` from 11 to 13. Do we accept dropping those users (and what do they see: the last build that still runs, an in-app notice before the update), or hold Electron at the last version that supports them? Check what usage data exists on macOS versions before deciding.
