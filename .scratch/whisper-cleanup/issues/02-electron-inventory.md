# Electron app inventory

Status: open
Type: research
Blocked by: none

## Question

What does the Electron app in `src/` consist of, as input to the TypeScript migration? Cover: the build pipeline (`build.js`, electron-builder, how `whisper_web` is bundled), main vs preload vs renderer code, the UI technology in `src/ui/`, module system (CommonJS or ESM), native dependencies (`better-sqlite3`, `SystemAudioDump`), the `aec` submodule listed in `.gitmodules` but missing on disk, the existing ESLint/TS config, and the largest and most coupled files. Note anything that will make a TypeScript move hard.
