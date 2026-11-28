# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`. The folder is committed to git: commit after every change to a map or ticket.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- State is recorded as a `Status:` line near the top of each issue file: `open`, `claimed` or `resolved`
- Comments and conversation history append to the bottom of the file under a `## Comments` heading
- Every implementation ticket has a `**Model:**` line near the top naming the model that implements it, `Opus` or `Sonnet`, with one short reason. `/to-tickets` picks it and shows it in the breakdown for the owner to approve:
  - **Sonnet** when the ticket is mechanical and fully specified: deleting files, bumping versions, renames and moves, config, following an exact list.
  - **Opus** when it needs judgment: new code structure, new tests at a new seam, tricky logic, debugging an unknown failure. When unsure, Opus.
- The `**Model:**` line is followed when the ticket runs: with `/implement`, the owner switches with `/model <name>` first; with `/implement-spec`, each implementer subagent is started on that ticket's model.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `open`/`claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
