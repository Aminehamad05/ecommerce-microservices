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

## Structure

```
backend/
├── tsconfig.base.json  # shared strict TS config
├── gateway/            # API Gateway: routing, JWT verification, proxying
├── shared/             # @ecommerce/shared: types, middleware, event registry
└── services/
    ├── auth/           # users, login, JWT issuing
    ├── products/       # catalog CRUD (Zod), categories, Redis cache
    ├── orders/         # cart checkout, order lifecycle (Saga)
    └── payments/       # payment processing (Stripe), idempotent
```
