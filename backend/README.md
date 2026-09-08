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
```

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
