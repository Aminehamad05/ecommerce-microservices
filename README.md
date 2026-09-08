# E-commerce Platform

Monorepo for an e-commerce backend built as Express + TypeScript microservices (ESM), with an API Gateway as the single entry point.

## Architecture

```
ecommerce/
└── backend/
    ├── tsconfig.base.json   # shared strict TS config (extended by every workspace)
    ├── gateway/             # API Gateway :3000 — JWT verification, proxying
    ├── shared/              # @ecommerce/shared — types, error handler, event registry
    └── services/
        ├── auth/            # :3001 — users, login, JWT issuing (auth_db :5433, Prisma ORM)
        ├── products/        # :3002 — catalog, categories, search (products_db :5434)
        ├── orders/          # :3003 — cart checkout, order lifecycle (orders_db :5435)
        └── payments/        # :3004 — payment processing, idempotent (payments_db :5436)
```

Infra: PostgreSQL (one DB per service), RabbitMQ (5672, UI :15672), Redis (6379).

## Quick start

```bash
cd backend
cp .env.example .env                       # plus each service's .env.example → .env
docker compose up -d                       # databases, rabbitmq, redis
npm install                                # installs all workspaces

npm run dev:gateway & npm run dev:auth & npm run dev:products &
npm run dev:orders & npm run dev:payments

npm run typecheck                          # strict TS check across all workspaces
```

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
| `/api/products/*` | Bearer JWT | Proxied to products service |
| `/api/orders/*` | Bearer JWT | Proxied to orders service |
| `/api/payments/*` | Bearer JWT | Proxied to payments service |

See [backend/README.md](backend/README.md) for full service documentation.
