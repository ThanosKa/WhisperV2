# Which tests to delete

Status: open
Type: grilling
Blocked by: 01

## Question

Which existing tests are low-value ("slop": they mostly assert on mocks, duplicate each other, or test implementation details) and get deleted, and which stay? Because tests are the safety net for a behavior-preserving migration, decide also what must exist before deleting: which user-facing flows need a real test (Playwright e2e or an in-memory integration test) first, and whether deletion happens before or after the TypeScript move.
