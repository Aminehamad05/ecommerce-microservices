# E-commerce Backend (Microservices, TypeScript)

Express + TypeScript microservices with ESM, one PostgreSQL DB per service, RabbitMQ for events, Redis for cache/cart, and an API Gateway as the single entry point.

## Services & Ports

| Service    | Port | Database       |
|------------|------|----------------|
| Gateway    | 3000 | — (proxy only) |
| Auth       | 3001 | auth_db :5433  |
| Products   | 3002 | products_db :5434 |
| Orders     | 3003 | orders_db :5435  |
| Payments   | 3004 | payments_db :5436 |
| Notifications | 3005 | — (scaffold, not running) |

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
npm run dev -w services/notifications  # scaffold only, not started yet

npm run typecheck               # strict TS check across all workspaces
npm test                      # unit tests (vitest) across all workspaces
```

## Testing

```bash
npm test                      # every workspace that has tests
npm test -w services/auth     # auth service only
npm test -w services/products # products service only
npm test -w services/orders   # orders service only
```

- Auth unit tests live next to the code (`services/auth/src/**/*.test.ts`) so the strict `tsc --noEmit` check covers them too.
- They are unit-only: Prisma, `bcrypt` and `jsonwebtoken` are mocked with `vi.mock`, so **no database or running server is needed**.
- `services/auth/vitest.config.ts` injects a dummy `JWT_SECRET` for tests (the controller throws at import time if it is unset), keeping tests independent of any `.env` file.
- Products tests (`services/products/src/**/*.test.ts`) follow the same pattern: Zod schemas, controller helpers, `requireAdmin`, and both CRUD controllers with Prisma **and** the Redis cache layer mocked — 41 tests, runnable in CI with zero infra.
- Orders tests (`services/orders/src/**/*.test.ts`) mock Prisma, the products HTTP API (`fetch` stubbed) and the RabbitMQ bus — 22 tests covering checkout totals/publishing, ownership scoping, idempotent confirm and all failure mappings. Notifications has no unit tests yet.

## Running tests in CI

Prerequisites: Node 20+, no databases, no running services — every test mocks its I/O (Prisma, `fetch`, Redis, RabbitMQ), so the suite is hermetic. `npm ci` triggers each Prisma workspace's `postinstall` (`prisma generate`), which needs no DB connection.

```bash
cd backend
npm ci                  # reproducible install from package-lock.json
npm run typecheck       # strict TS across all workspaces (non-zero exit on error)
npm test                # vitest across all workspaces (non-zero exit on failure)
```

Jenkins declarative example (test stage needs no Docker/infra agents):

```groovy
pipeline {
  agent any
  tools { nodejs 'node-20' }
  stages {
    stage('Install')   { steps { dir('backend') { sh 'npm ci' } } }
    stage('Typecheck') { steps { dir('backend') { sh 'npm run typecheck' } } }
    stage('Unit tests') { steps { dir('backend') { sh 'npm test' } } }
    // later stages: build images, push, deploy to Kubernetes
  }
}
```

Conventions for new tests: colocate `*.test.ts` under the service's `src/` (strict typecheck covers them), mock at the boundary (DB client, HTTP, cache, bus — never spin up real infra), and add `"test": "vitest run"` so root `npm test` picks the workspace up with no further wiring.
- Manual end-to-end console: open `backend/test-all.html` in a browser (health, auth, products, categories, cache HIT/MISS badges).
- Seed demo catalog: `npm run db:seed -w services/products` (12 categories, 72 products, 143 images; TRUNCATEs catalog tables first).
- To add tests for another service: install `vitest` as a devDependency in that workspace, copy the `vitest.config.ts` pattern, colocate `*.test.ts` files under its `src/`, and add a `"test": "vitest run"` script — the root `npm test` picks it up automatically.

## Products API

Direct base URL `http://localhost:3002`, via gateway prefix `/api` (`http://localhost:3000/api/products…`, Bearer JWT required there).

| Method & path | Access | Notes |
|---|---|---|
| `GET /products` | public* | Pagination + filters: `page`, `limit` (≤100), `categoryId`, `status`, `featured=true\|false`, `search` (name/description/sku). Returns `{ data, page, limit, total }` |
| `GET /products/:id` | public* | Product with ordered images + category |
| `POST /products` | **admin** | Zod-validated (sku, name, slug, positive price, `categoryId` UUID, …) → `201` |
| `PATCH /products/:id` | **admin** | Partial update; `images` array replaces the gallery when provided |
| `DELETE /products/:id` | **admin** | → `204` (images cascade) |
| `GET /products/categories` | public* | Category list with product counts |
| `GET /products/categories/:id` | public* | Category with children + active products |
| `POST /products/categories` | **admin** | `{ name, slug, description?, imageUrl?, parentId? }` → `201` |
| `PATCH /products/categories/:id` | **admin** | Partial update |
| `DELETE /products/categories/:id` | **admin** | → `204`; `409` if products still reference it |

\* Public at the service; the gateway still requires a (any-role) JWT on `/api/products/*`. Admin checks read the `x-user-role` header forwarded by the gateway (`requireAdmin` middleware) — never re-verify JWTs downstream.

Validation failures return `400` with per-field details; duplicate sku/slug returns `409`; missing records return `404`.

## Orders API

Direct base URL `http://localhost:3003`, via gateway (`http://localhost:3000/api/orders…`, Bearer JWT required there; user identity comes from the forwarded `x-user-id` header).

| Method & path | Access | Notes |
|---|---|---|
| `POST /orders/checkout` | own JWT | `{ items: [{ productId, quantity }] }` → snapshots live catalog prices over REST (never reads the products DB), stores a `PENDING` order with a `correlationId`, publishes `order.placed` → `201` |
| `GET /orders` | own JWT | Caller's orders only, newest first |
| `GET /orders/:id` | own JWT | `404` unless the order belongs to the caller |

There is deliberately **no confirm route**: an order becomes `CONFIRMED` only inside the `payment.succeeded` consumer (`confirmOrderById`), never via HTTP — no manual/admin confirmation path exists.

## Events (RabbitMQ)

Transport: `publishEvent` / `consumeEvents` from `@ecommerce/shared` (`shared/src/lib/bus.ts`), typed against the `Events` / `EventPayloads` registry. Topology is one durable **topic exchange** (`ecommerce.events`), routing key = event name; each consumer owns a durable queue (`orders.payment.succeeded`, `notifications.order.confirmed`, …) so one event fans out to many services.

Current flow:

```
checkout ──publish──► order.placed ──► (payments, future)
payment.succeeded ──► orders consumes → CONFIRMED ──publish──► order.confirmed ──► notifications consumes → in-app inbox
```

Rules: publish only after the DB write commits; consumers are idempotent (`CONFIRMED` replay = no-op success, no duplicate publish); manual ack, failures are dropped + logged (no requeue — poison messages must not loop); every handler logs order/payment/correlation ids so one checkout is traceable across services. After topology changes, check the broker bindings — hot-reload can leave stale bindings behind.

## Notifications (scaffold, not running)

`services/notifications/` (`:3005` when started): subscribes to `order.confirmed` and logs an in-app notification for the buying user — no email involved. Still TODO: `notifications_db` in compose + Prisma `Notification` inbox model, `GET /notifications` for the app, and contact resolution via a `user.created` read-model (documented in `src/listeners/orderConfirmed.ts`; never read `auth_db` directly).

## Catalog cache (Redis)

Product reads are cached with Redis (`REDIS_URL`, default `redis://localhost:6379`), cache-aside with write-through invalidation:

| Key | TTL | Content |
|---|---|---|
| `product:{id}` | 300s | Product detail |
| `products:list:v{N}:{query-hash}` | 60s | Filtered listings (versioned — writers bump `products:list:version`, old keys expire) |
| `category:{id}` | 300s | Category detail |
| `categories:list` | 300s | Category list |

- Any product write deletes its detail key, the categories list, all `category:*` detail keys and bumps the listing version; category writes do the mirror.
- Responses carry `X-Cache: HIT/MISS` when Redis is reachable; the header is omitted on DB fallback.
- **Fail-open:** every cache helper swallows Redis errors — if Redis is down the service keeps serving from Postgres (verified: 200s with Redis stopped). `disableOfflineQueue` is set so commands fail fast instead of hanging.

## Conventions

- **TypeScript everywhere**, strict mode (`tsconfig.base.json` shared by all workspaces)
- **ESM only** (`"type": "module"`) — `import`/`export`, `.js` extension in relative imports (NodeNext)
- Dev runner is `tsx watch` (no build step needed in dev); `npm run build` → `dist/`
- Typed errors: throw `HttpError` (from `@ecommerce/shared`) — the shared error handler maps it to a status code
- Typed events: `Events` const + `EventPayloads` registry in `@ecommerce/shared` so publishers/listeners are compile-time checked
- Each service owns its DB — no cross-service DB access. Services talk via REST and RabbitMQ events.
- Each Prisma service must set its own generator `output` (e.g. `../src/generated/client`, gitignored) — otherwise services overwrite each other's client in the hoisted `node_modules/@prisma/client` and the last `prisma generate` wins. Import the client via the relative `../generated/client/index.js` path, never `@prisma/client`, once a second Prisma schema exists.
- Request validation uses Zod schemas (`*/src/schemas/`) returning `400` with per-field details; downstream admin checks trust the gateway's `x-user-role` header.
- Order confirmation is event-only: no HTTP route may confirm an order; state transitions from external events live in idempotent internal functions, not controllers.
- Event consumers must be safe to run twice (RabbitMQ redelivers); check domain state before acting (e.g. already-`CONFIRMED` → success).

## Structure

```
backend/
├── tsconfig.base.json  # shared strict TS config
├── gateway/            # API Gateway: routing, JWT verification, proxying
├── shared/             # @ecommerce/shared: types, middleware, event registry
└── services/
    ├── auth/           # users, login, JWT issuing
    ├── products/       # catalog CRUD (Zod), categories, Redis cache
    ├── orders/         # checkout, event-driven confirm (payment.succeeded → order.confirmed)
    ├── notifications/  # order.confirmed listener, in-app inbox (scaffold, not running)
    └── payments/       # TODO — consumes order.placed, publishes payment.succeeded (Stripe)
```
