# DESIGN.md scope

Status: open
Type: grilling
Blocked by: 07

## Question

For step 5 of [Order of the work](07-work-order.md): one DESIGN.md or two (Electron UI and `whisper_web/`), where it lives, and which tokens it records (colors, type, spacing, radius, motion) taken from today's Lit CSS so they become Tailwind tokens in the React UI. Format: `../DESIGN.skeleton.md`.

## Comments

From [React UI structure](16-react-ui-structure.md): the React UI takes its components from the owner's Kosmos registry, which reads its look from CSS variables (`tokens` item in `~/Desktop/Cursor/design-system/registry.json`). DESIGN.md should record Whisper's values under Kosmos's variable names. The owner said "we don't know yet which colors we'll use": decide here whether the values are today's Lit CSS exactly (the map's destination: the user sees no change, screenshots must match) or a restyle, which would move the destination.
