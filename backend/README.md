# E-commerce Backend (Microservices, TypeScript)

Express + TypeScript microservices with ESM, one PostgreSQL DB per service, RabbitMQ for events, Redis for cache/cart, and an API Gateway as the single entry point.

## Services & Ports

| Service    | Port | Database       |
|------------|------|----------------|
| Gateway    | 3000 | — (proxy only) |
| Auth       | 3001 | auth_db :5433  |
| Products   | 3002 | products_db :5434 |
| Orders     | 3003 | orders_db :5435 |
| Payments   | 3004 | payments_db :5436 |

Infra: RabbitMQ (5672, UI :15672), Redis (6379).

## Run

```bash
cp .env.example .env            # and each service's .env.example → .env
docker compose up -d            # databases, rabbitmq, redis
npm install                     # installs all workspaces
npm run dev:gateway             # in separate terminals:
npm run dev:auth
npm run dev:products
npm run dev:orders
npm run dev:payments

npm run typecheck               # strict TS check across all workspaces
npm test                      # unit tests (vitest) across all workspaces
```

## Testing

```bash
npm test                      # every workspace that has tests
npm test -w services/auth     # auth service only
```

- Auth unit tests live next to the code (`services/auth/src/**/*.test.ts`) so the strict `tsc --noEmit` check covers them too.
- They are unit-only: Prisma, `bcrypt` and `jsonwebtoken` are mocked with `vi.mock`, so **no database or running server is needed**.
- `services/auth/vitest.config.ts` injects a dummy `JWT_SECRET` for tests (the controller throws at import time if it is unset), keeping tests independent of any `.env` file.
- To add tests for another service: install `vitest` as a devDependency in that workspace, copy the `vitest.config.ts` pattern, colocate `*.test.ts` files under its `src/`, and add a `"test": "vitest run"` script — the root `npm test` picks it up automatically.

## Conventions

- **TypeScript everywhere**, strict mode (`tsconfig.base.json` shared by all workspaces)
- **ESM only** (`"type": "module"`) — `import`/`export`, `.js` extension in relative imports (NodeNext)
- Dev runner is `tsx watch` (no build step needed in dev); `npm run build` → `dist/`
- Typed errors: throw `HttpError` (from `@ecommerce/shared`) — the shared error handler maps it to a status code
- Typed events: `Events` const + `EventPayloads` registry in `@ecommerce/shared` so publishers/listeners are compile-time checked
- Each service owns its DB — no cross-service DB access. Services talk via REST and RabbitMQ events.

## Structure

```
backend/
├── tsconfig.base.json  # shared strict TS config
├── gateway/            # API Gateway: routing, JWT verification, proxying
├── shared/             # @ecommerce/shared: types, middleware, event registry
└── services/
    ├── auth/           # users, login, JWT issuing
    ├── products/       # catalog, categories, search
    ├── orders/         # cart checkout, order lifecycle (Saga)
    └── payments/       # payment processing (Stripe), idempotent
```
