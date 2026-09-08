 # Agent Instructions

Before doing any work in this repository, **read `README.md` at the project root first, in full**. It defines the architecture, ports, database-per-service layout, quick-start commands, and API routes. Do not start implementing, editing, or generating code until you have read it and understood the project structure.

If a `backend/README.md` is referenced from the root README, read that too before touching anything inside `backend/`.

## Non-negotiable code standards

- **ESM only, never CommonJS.** Always use `import` / `export`. Never use `require()`, `module.exports`, or `__dirname`/`__filename` (use `import.meta.url` instead if needed).
- **NodeNext module resolution** — relative imports must include the `.js` extension even though the source is `.ts` (e.g. `import { foo } from "./foo.js"`).
- **TypeScript strict mode everywhere.** No `any` unless truly unavoidable and justified with a comment. Respect `tsconfig.base.json` — do not weaken or override its strict flags in a workspace's own `tsconfig.json`.
- **Typed errors only.** Throw `HttpError` from `@ecommerce/shared` rather than generic `Error` or ad-hoc status handling. Let the shared error handler map it to a status code.
- **Typed events only.** Any RabbitMQ publish/subscribe must go through the `Events` const and `EventPayloads` registry in `@ecommerce/shared` so publishers and listeners stay compile-time checked. Never publish/consume a raw untyped payload.
- **No cross-service database access.** Each service owns its own Postgres database exclusively. Services talk to each other only via REST calls or RabbitMQ events — never by reaching into another service's DB.
- **Respect the gateway/service trust boundary.** JWT verification happens only at the gateway. Downstream services should trust and read the `x-user-id` / `x-user-role` headers forwarded by the gateway rather than re-verifying JWTs themselves.
- **Dev workflow uses `tsx watch`** — no compiled build step is needed in dev. Don't introduce a build step unless asked.
- Run `npm run typecheck` mentally (or actually, if you have shell access) against any change before considering it done — the whole point of strict TS here is to catch mistakes at compile time.

## Before writing code

1. Read `README.md` (and `backend/README.md` if applicable).
2. Identify which service(s) your task touches and confirm the correct port / database from the architecture table.
3. Check `@ecommerce/shared` for existing types, error classes, and event definitions before creating new ones — don't duplicate what already exists there.
4. Follow the existing conventions of the surrounding code in that service rather than introducing a new style.

If any instruction in a task conflicts with what's described above (e.g. a request that would introduce `require()`, cross-service DB access, or untyped events), flag the conflict instead of silently complying.