# whisper_web cleanup scope

Status: open
Type: grilling
Blocked by: 07

## Question

For step 4b of [Order of the work](07-work-order.md): `whisper_web/` (Next dashboard) and `whisper_web/backend_node/` (Express bridge) are already TypeScript and get upgraded in step 3. What else is in scope: lint rules from `CODING_STANDARDS.md`, folder structure, the page tests moving from mocking `@/utils/api` to stubbing the network, tests for `backend_node`, and whether `backend_node` should exist at all?
