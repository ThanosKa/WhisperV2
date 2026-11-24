# Code structure for main and preload

Status: claimed
Type: grilling
Blocked by: 07

## Question

For step 4a of [Order of the work](07-work-order.md) (main + preload to TypeScript): which modules to deepen and where the seams go (services, `windowManager`, the IPC bridges and the shared typed channel contract, repositories over `sqliteClient`, `authService`), how the folders under `src/` are laid out, and how the two default domains (`app-whisper.com` and `www.app-whisper.com`) collapse to one config value. Breaking the 2 import cycles is already decided. Facts: [Electron app inventory](02-electron-inventory.md). Use the `codebase-design` skill.
