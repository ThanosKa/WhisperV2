# TypeScript migration approach

Status: claimed
Type: grilling
Blocked by: 01, 02

## Question

How does the Electron app move from JavaScript to TypeScript? Decide: file-by-file with `allowJs` or another path; build tooling; strictness and lint rules (from `CODING_STANDARDS.md`); the schema library for parsing at boundaries (IPC, storage, server responses); how each step is verified not to change behavior; and what "done" means.

## Comments

Grilling notes (2026-11-23), in progress:

- Q1 path: **big bang** (one branch converts everything), not file-by-file. Owner's choice.
- Libraries named by owner: `pino` + `pino-pretty` (logger), `zod` (schemas). Same as `WhisperAPP` (`zod ^4`, `pino ^10`).
- Owner wants **every dependency upgraded** (Node, Electron, Next, `better-sqlite3`, ...): graduates the "Dependency and toolchain health" fog. Facts today: Electron `^30.5`, `better-sqlite3 ^9.6`, Next `^14.2`, React 18, Tailwind 3 (only in `whisper_web`; the Electron UI is Lit with CSS in JS strings).
