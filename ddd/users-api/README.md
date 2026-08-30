# @nestjs-pipeline/ddd-users-api

Disposable reference application demonstrating the `@nestjs-pipeline/*` packages with NestJS CQRS, MikroORM, CASL, Zod, caching, tracing, rate limiting, audit, idempotency, feature flags, resilience, correlation IDs, and dead-letter handling.

This directory is a **demo**, not a migration-compatibility target. Its database history may be reset whenever the sample schema changes. Do not use its migration files as an upgrade path for a real application.

## Fresh setup

Start from an empty database/schema:

```bash
cd ddd/users-api
pnpm install
pnpm build
cp .env.example .env
pnpm db:migrate
pnpm dev
```

`db:migrate` applies the single current initial migration. That migration creates the complete schema and inserts the demo seed in one pass.

If the demo schema changes, delete the local demo database (or drop/recreate the PostgreSQL tenant schema) and run `pnpm db:migrate` again. There is intentionally no compatibility migration chain for older versions of this sample.

## Persistence modes

### libSQL / SQLite

Default local configuration:

```env
DB_ENGINE=libsql
DATABASE_URL=file:src/persistence/local.db
DB_DEFAULT_SCHEMA=tenant
```

A single tenant uses `DATABASE_URL` unchanged. For multiple local tenants, set `SQLITE_TENANTS`; derived files get a tenant suffix. Multiple remote libSQL tenants require `SQLITE_DATABASE_TEMPLATE` containing `{tenant}`.

### PostgreSQL

Set `DB_ENGINE=postgres` and configure the PostgreSQL environment variables. Each tenant uses a separate schema. `TENANT_SCHEMAS` controls which schemas are migrated by the CLI.

Both engines use the `x-tenant-schema` request header to select the active tenant.

## Current schema

The fresh initial migration creates:

- `users`
- `auth`
- `roles`
- `capabilities`
- `role_capabilities`
- `user_roles`
- `user_additional_capabilities`
- `user_denied_capabilities`
- `cache`

`capabilities.inverted` is created as a boolean from the beginning. There is no smallint-to-boolean compatibility conversion.

The MikroORM entity metadata and migration schema are expected to describe the same current database contract. In particular, user email is unique in both paths.

## Seed data

The initial migration inserts **8 users, 5 roles, and 14 capabilities**. Seed names/emails include the tenant token so separate tenant databases/schemas stay easy to inspect.

| User | Roles | Purpose |
|---|---|---|
| Alice | `admin` | Unrestricted `all/manage` example |
| Bob | `user-manager` | Department-scoped management with role-level denials |
| Carol | `self` | Self-read and username-only self-update |
| Dave | `viewer` | Plain read-only viewer; **no create override** |
| Eve | `viewer` + `self` | Multi-role ability merge |
| Frank | `support-agent` | Department-scoped support permissions |
| Grace | `user-manager` | Demonstrates a **per-user denial** overriding role permissions |
| Vince | `viewer` | Demonstrates a **per-user additional grant** (`User/create`) |

CASL condition placeholders in the seed use only the supported flat user context forms:

```text
${user.id}
${user.department}
```

The seed intentionally demonstrates both override directions:

- `user_additional_capabilities`: Vince receives `User/create` in addition to `viewer`.
- `user_denied_capabilities`: Grace receives an explicit `User/read` denial; the CASL package forces capabilities from the denied collection to inverted rules.

## Running requests

The sample supports Express by default and Fastify with `ADAPTER=fastify`.

Every routed request needs `x-tenant-schema`. Protected routes additionally need a bearer JWT, API credentials, or (Fastify only) the secure-session cookie.

Example shape:

```bash
curl http://localhost:3000/users \
  -H 'x-tenant-schema: tenant' \
  -H 'Authorization: Bearer <token>'
```

`POST /auth/login` returns a bearer token. With Fastify + `SESSION_SECRET`, it also populates `@fastify/secure-session`. Express intentionally uses bearer/API credentials only.

## Pipeline composition demonstrated

Global and per-handler examples exercise:

- `@nestjs-pipeline/core` — pipeline execution and logging
- `@nestjs-pipeline/correlation` — HTTP and async correlation propagation
- `@nestjs-pipeline/zod` — request parsing/validation
- `@nestjs-pipeline/opentelemetry` — trace and metrics behaviors
- `@nestjs-pipeline/casl` — ABAC authorization
- `@nestjs-pipeline/resilience` — retry/circuit-breaker/timeout policies
- `@nestjs-pipeline/cache` — cache behavior infrastructure
- `@nestjs-pipeline/feature-flags` — OpenFeature gating
- `@nestjs-pipeline/deadletter` — failed-request capture
- `@nestjs-pipeline/rate-limit` — `rate-limiter-flexible` integration
- `@nestjs-pipeline/audit` — redacted audit records
- `@nestjs-pipeline/idempotency` — atomic duplicate exclusion and replay
- `@nestjs-pipeline/ddd-core` — entities, outcomes, events, and repository helpers

The application also has its own tenant-aware DDD repository cache so user/role write invalidation has a single clear target.

## Tests

```bash
pnpm test
pnpm test:e2e
```

The e2e harness creates disposable tenant databases directly from the current MikroORM metadata. Migration tests separately verify that the fresh migration creates the intended current schema and seed. The sample does not test upgrades from historical migration states.
