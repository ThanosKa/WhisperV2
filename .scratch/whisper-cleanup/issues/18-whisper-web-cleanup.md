# whisper_web cleanup scope

Status: open
Type: grilling
Blocked by: 07

## Question

For step 4b of [Order of the work](07-work-order.md): `whisper_web/` (Next dashboard) and `whisper_web/backend_node/` (Express bridge) are already TypeScript and get upgraded in step 3. What else is in scope: lint rules from `CODING_STANDARDS.md`, folder structure, the page tests moving from mocking `@/utils/api` to stubbing the network, tests for `backend_node`, and whether `backend_node` should exist at all?

## Comments

From [Code structure for main and preload](15-main-code-structure.md): in step 4a-2 the Express app in `backend_node` receives main's typed repositories directly, and the `web-data-request` string messages go. The dashboard's hard-coded `https://www.app-whisper.com` links already match the one `API_BASE_URL` value.

From [React UI structure](16-react-ui-structure.md): the Electron UI takes its components from the owner's Kosmos registry (shadcn format). `whisper_web` already uses shadcn components (`components/ui/`); decide whether they move to Kosmos too.
