# TypeScript migration approach

Status: open
Type: grilling
Blocked by: 01, 02

## Question

How does the Electron app move from JavaScript to TypeScript? Decide: file-by-file with `allowJs` or another path; build tooling; strictness and lint rules (from `CODING_STANDARDS.md`); the schema library for parsing at boundaries (IPC, storage, server responses); how each step is verified not to change behavior; and what "done" means.
