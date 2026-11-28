# Error reporting from the desktop app

Status: open
Type: grilling
Blocked by: 15

## Question

The desktop app runs on each user's Mac and reports nothing back: errors go to `console.log` and are lost there. When something breaks for a user, the owner does not find out. The pino logger planned in [TypeScript migration approach](04-typescript-approach.md) stays local to the Mac. Step 2's suite already found one such error in normal use (`Object has been destroyed` in `windowManager.js` when the app quits during a window fade-out).

Industry practice for desktop apps is to send uncaught errors and native crashes to an error-tracking service. Decide:

- **Which service.** `@sentry/electron` is the common SDK for Electron: it catches errors in main and in the windows, plus native crashes, and maps them to source lines through source maps. It can send to Sentry, or to Better Stack's error tracking, which the owner already uses and which accepts Sentry SDKs.
- **What leaves the Mac.** Errors, stack traces, the app version, the OS version and an anonymous install id. Never transcripts, audio, screenshots, prompts or LLM answers. Decide whether the user id is attached, and how the privacy policy says it.
- **Opt-out.** Whether users can turn it off, and where.
- **When.** After step 4a-1 (main and preload in TypeScript), so stack traces point at the new code through source maps. The order is recorded in [Order of the work](07-work-order.md) once this ticket is resolved.
- **Logs.** Whether pino's error-level logs go to the same service as breadcrumbs (the steps that led to an error), or stay local.

## Comments

Opened 2026-11-28 at the owner's request, during steps 2 and 3.
