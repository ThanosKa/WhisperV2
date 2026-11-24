# DESIGN.md scope

Status: resolved
Type: grilling
Blocked by: 07

## Question

For step 5 of [Order of the work](07-work-order.md): one DESIGN.md or two (Electron UI and `whisper_web/`), where it lives, and which tokens it records (colors, type, spacing, radius, motion) taken from today's Lit CSS so they become Tailwind tokens in the React UI. Format: `../DESIGN.skeleton.md`.

## Comments

From [React UI structure](16-react-ui-structure.md): the React UI takes its components from the owner's Kosmos registry, which reads its look from CSS variables (`tokens` item in `~/Desktop/Cursor/design-system/registry.json`). DESIGN.md should record Whisper's values under Kosmos's variable names. The owner said "we don't know yet which colors we'll use": decide here whether the values are today's Lit CSS exactly (the map's destination: the user sees no change, screenshots must match) or a restyle, which would move the destination.

## Answer

Resolved 2026-11-24 with the owner.

**Fact:** today's Lit CSS has 114 distinct colors, 13 font sizes, 15 radii and 37 box-shadows, with almost no tokens (1 CSS variable). `whisper_web` uses shadcn's default neutral variables; the Electron UI is a dark translucent overlay. Two different looks.

**The owner's requirement:** the colors are not settled; what matters is that they are **easy to change**.

1. **One place for every value.** Colors, shadows, radii, type and motion live only in Kosmos's CSS variables ([React UI structure](16-react-ui-structure.md)), in one theme file per app. Components never write a value themselves; a lint rule fails on hard-coded values such as `bg-[#1a1a1a]`. Changing the look means editing that one file.
2. **Two DESIGN.md files, each next to its code:** `src/renderer/DESIGN.md` (Electron UI) and `whisper_web/DESIGN.md` (dashboard). Merge them later only if the two looks converge.
3. **Format:** the structure of `~/Desktop/Cursor/DESIGN.skeleton.md` (YAML tokens on top, then the prose sections), written the way `~/Desktop/Cursor/DESIGN.example-paws-and-paths.md` fills it in.
4. **Content:** colors, typography, spacing, radius, shadows (elevation), motion, and component tokens for the components actually used.
5. **Starting values:** the Electron UI's 114 values consolidated into a small palette (about 10-15 color tokens), merging values the eye cannot tell apart; the user sees no change, and the step-6 screenshot comparison uses a small tolerance. `whisper_web` keeps its current values.
6. **When:** both written in step 5 of [Order of the work](07-work-order.md).

New colors or a new look are not part of this map: a separate effort after the cleanup, which point 1 makes a change of values only.
