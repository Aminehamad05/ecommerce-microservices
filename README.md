# E-commerce Platform

Monorepo for an e-commerce backend built as Express + TypeScript microservices (ESM), with an API Gateway as the single entry point.

## Architecture

```
                          ┌─────────────────────────────┐
        HTTP (client) ───►│  API Gateway        :3000   │
                          │  JWT verify → x-user-id /   │
                          │  x-user-role → http-proxy   │
                          └──────┬──────┬──────┬──────┬───┘
                                 │      │      │      │  REST proxy
                                 ▼      ▼      ▼      ▼
                          ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
                          │auth │ │prod │ │order│ │pay  │
                          │:3001│ │:3002│ │:3003│ │:3004│
                          └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘
                             │       │       │       │
                    ┌────────▼───────▼───────▼───────▼─────────┐
                    │ RabbitMQ :5672  (async events)            │
                    │ Redis     :6379  (cache / sessions)       │
                    └───────────────────────────────────────────┘
```

```
ecommerce/
└── backend/
    ├── tsconfig.base.json   # shared strict TS config (extended by every workspace)
    ├── docker-compose.yml   # infra: 4× PostgreSQL, RabbitMQ, Redis
    ├── gateway/             # API Gateway :3000 — JWT verification, proxying
    ├── shared/              # @ecommerce/shared — types, error handler, event registry
    └── services/
        ├── auth/            # :3001 — users, login, JWT issuing (auth_db :5433, Prisma ORM)
        ├── products/        # :3002 — catalog, categories, search (products_db :5434)
        ├── orders/          # :3003 — cart checkout, order lifecycle (orders_db :5435)
        └── payments/        # :3004 — payment processing, idempotent (payments_db :5436)
```

Infra: PostgreSQL (one DB per service), RabbitMQ (5672, UI :15672), Redis (6379) — all via `docker compose up -d`.

### Database-per-service

Each service owns its own PostgreSQL database and Prisma schema; no service ever reads another service's DB. Data that lives elsewhere is reached via API calls or events, never via shared tables.

| Service | DB | Port |
|---------|----|------|
| auth | auth_db | 5433 |
| products | products_db | 5434 |
| orders | orders_db | 5435 |
| payments | payments_db | 5436 |

## Service communication

Communication follows two rules:

1. **Synchronous, needs an answer now → REST** through the gateway (or service-to-service HTTP when a service must fetch data it doesn't own).
2. **Asynchronous, "this happened" → RabbitMQ events** — fire-and-forget domain events that other services react to.

### Request flow (sync)

```
Client ──► Gateway :3000 ──► /api/auth/*      ──► auth      :3001
                            ──► /api/products/* ──► products  :3002
                            ──► /api/orders/*   ──► orders    :3003
                            ──► /api/payments/* ──► payments  :3004
```

- The gateway verifies the **Bearer JWT**, extracts `x-user-id` / `x-user-role` headers, and proxies the request. Downstream services trust those headers (they never re-verify the JWT).
- Example: `POST /api/orders/checkout` is handled by the orders service, which may call the products service over HTTP to validate stock, then proceed.

### Event flow (async, RabbitMQ)

Events are published as typed domain events. Names and payloads are compile-time checked against the `Events` const + `EventPayloads` registry in `@ecommerce/shared` (`shared/src/events/index.ts`), and every event carries a `correlationId` propagated across services.

```
auth     ──publish──► user.created
orders   ──publish──► order.placed      ──► payments consumes → processes payment
payments ──publish──► payment.succeeded ──► orders consumes   → confirm order
payments ──publish──► payment.failed    ──► orders consumes   → mark order failed
```

Why events instead of REST here:
- **Payments must not be coupled to orders availability** — if orders is down, payments still publishes `payment.succeeded` and orders consumes it when it comes back.
- One event can have multiple consumers later (e.g. `order.placed` → email service, analytics) without touching the publisher.
- Checkout flow: `order.placed` → payments → `payment.succeeded`/`payment.failed` → orders updates state. No service blocks waiting for another.

### Communication summary

| Interaction | Mechanism | Example |
|-------------|-----------|---------|
| Client → any service | REST via gateway (JWT) | `POST /api/orders` |
| Service → service, needs answer now | REST direct | orders → products (stock check) |
| "Something happened", one-to-many | RabbitMQ publish | orders → `order.placed` |
| React to another service's state change | RabbitMQ consume | payments ← `order.placed` |

## Caching (Redis)

Redis (:6379) is used for **read-heavy, tolerant-of-slight-staleness data** — not for anything that must be immediately consistent:

- **Product catalog caching** — `GET /api/products/:id` and category listings are the hottest reads; products service caches responses in Redis (key: `product:{id}`, short TTL). Writes/invalidate happen on product update.
- **Search results** — popular search queries cached briefly to absorb repeated catalog queries.
- **JWT / session denylist** — the gateway can cache token revocation state so every request doesn't hit the auth DB.
- **Rate limiting** — request counters per user/IP at the gateway (e.g. `INCR rate:{userId}` with expiry).

Redis is **not** used for: order state, payments, or anything authoritative — the databases remain the source of truth; Redis is always safe to flush.

## RabbitMQ usage

RabbitMQ is used exclusively for **domain events between services**:

- Publish on state changes that other services care about (`user.created`, `order.placed`, `payment.succeeded`, `payment.failed`).
- Consumers are idempotent — events may be redelivered.
- The `correlationId` on each event ties a checkout flow together across services.
- Not used for: request/response between services (that's REST), or anything the client is waiting on synchronously.

## Quick start

```bash
cd backend
cp .env.example .env                       # plus each service's .env.example → .env
docker compose up -d                       # databases, rabbitmq, redis
npm install                                # installs all workspaces

npm run dev:gateway & npm run dev:auth & npm run dev:products &
npm run dev:orders & npm run dev:payments

npm run typecheck                          # strict TS check across all workspaces
npm test                                   # unit tests (vitest) across all workspaces
```

RabbitMQ management UI: http://localhost:15672 (guest/guest)

## Conventions

- **TypeScript strict everywhere**, ESM only (`"type": "module"`), NodeNext resolution (`.js` extension in relative imports)
- Dev runner: `tsx watch` — no build step needed in dev
- Typed errors: throw `HttpError` from `@ecommerce/shared`; the shared error handler maps it to a status code
- Typed events: `Events` const + `EventPayloads` registry in `@ecommerce/shared` keep publishers and listeners compile-time checked
- Each service owns its DB — no cross-service access; services communicate via REST and RabbitMQ events
- The gateway verifies JWTs and forwards `x-user-id` / `x-user-role` headers; downstream services trust those headers

## API

| Route | Auth | Notes |
|-------|------|-------|
| `GET /health` | — | Gateway health |
| `POST /api/auth/register` | public | `{ email, password }` → user + JWT |
| `POST /api/auth/login` | public | `{ email, password }` → user + JWT |
| `GET /api/products[?page&limit&categoryId&status&featured&search]` | Bearer JWT | Product listing, `{ data, page, limit, total }` (Redis-cached, `X-Cache` header) |
| `GET /api/products/:id` | Bearer JWT | Product detail with images + category (cached) |
| `POST /api/products` | Bearer JWT, **admin** | Zod-validated create → `201` |
| `PATCH /api/products/:id` | Bearer JWT, **admin** | Partial update |
| `DELETE /api/products/:id` | Bearer JWT, **admin** | → `204` |
| `GET /api/products/categories[/:id]` | Bearer JWT | Category list / detail (cached) |
| `POST /api/products/categories` | Bearer JWT, **admin** | Create category → `201` |
| `PATCH /api/products/categories/:id` | Bearer JWT, **admin** | Partial update |
| `DELETE /api/products/categories/:id` | Bearer JWT, **admin** | → `204` (`409` if products reference it) |
| `/api/orders/*` | Bearer JWT | Proxied to orders service |
| `/api/payments/*` | Bearer JWT | Proxied to payments service |

See [backend/README.md](backend/README.md) for full service documentation.
