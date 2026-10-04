---
title: "A DDD example"
---

`packages/ddd-core` and the `api` example demonstrate Domain-Driven Design with `@nestjs-pipeline`.

## `packages/ddd-core` — framework-neutral DDD support

The `@cqrs-ddd/core` package has no NestJS dependency and provides four explicit entry points:

- `/domain` — aggregate/event/error primitives;
- `/application` — CQRS base classes and repository/cache ports;
- `/persistence` — persistence decorators/adapters/helpers;
- `/http` — HTTP status mapping for its own errors.

Domain and application code should use the narrow entry points rather than the compatibility root barrel.

| Export                | Layer          | Description                                                                           |
|-----------------------|----------------|-----------------------------------------------------------------------------------------|
| `RootEntity`          | `/domain`      | Abstract base entity with UUID v7 identity, `createdAt`/`updatedAt` lifecycle, accessor mappings, and mutation tracking |
| `RootEntitySnapshot`  | `/domain`      | Interface for serializing/rehydrating entities                                        |
| `DomainException`     | `/domain`      | Abstract base class for framework-agnostic domain invariant exceptions                  |
| `DomainEvent`         | `/domain`      | Abstract base class for domain events (carries a UUID v7 `id`)                        |
| `RootDomainEvent`     | `/domain`      | Domain event with detached immutable payload and event-time aggregate ID/version       |
| `@ApplyMutation()`    | `/domain`      | Completes a domain mutation: calls `onUpdate()` and records events from the result    |
| `@Mutable()`          | `/domain`      | Declares an aggregate field as patchable through `applyPatch(...)`                    |
| `CommandBaseHandler`  | `/application` | Base CQRS command handler that dispatches and clears uncommitted events                 |
| `ICommandRepository`  | `/application` | Port for write repositories                                                            |
| `IQueryRepository`    | `/application` | Port for read repositories                                                             |
| `ICache<T>`           | `/application` | Interface for cache providers (`get`, `set`, `delete`)                                |
| `@Cache()`            | `/persistence` | Decorator for `save()` — write-through cache on writes, evict on delete, explicit keys |
| `@FromCache()`        | `/persistence` | Decorator for `find()` — read-through cache with fail-closed semantics and hydration   |

MikroORM adapters, such as `AggregateRepository`, `MikroOrmCache` and `UnixTimestampType`,
live in [`@cqrs-ddd/mikro-orm`](/nestjs-pipeline/packages/cqrs-ddd/mikro-orm/).

Import domain primitives in your domain layer:

```typescript
import { ApplyMutation, DomainException, RootDomainEvent, RootEntity } from '@cqrs-ddd/core/domain';
```

## `api` — Full Working Application

The `api/` directory contains a complete working application:

```bash
cd api
pnpm install
pnpm build              # build workspace dependencies
cp .env.example .env    # create local environment file (edit as needed)
pnpm db:migrate         # apply schema + data migrations (idempotent)
pnpm dev                # build, then rebuild and restart on source changes
```

Configure the database via environment variables (defaults to a local file):

| Variable             | Default         | Description                          |
|----------------------|-----------------|--------------------------------------|
| `DATABASE_URL` | `file:src/persistence/local.db` | libSQL URL, used unchanged for one tenant |
| `SQLITE_TENANTS` | _(none)_ | Additional libSQL tenant names; local files get a tenant suffix |
| `SQLITE_DATABASE_TEMPLATE` | _(none)_ | URL containing `{tenant}`; required for multiple remote tenants |
| `AUTH_TOKEN`   | _(none)_        | Auth token for libSQL remote databases (e.g. Turso) |

`DB_ENGINE=postgres` switches to PostgreSQL with a schema per tenant; the
[api README](https://github.com/aristoteliss/nestjs-pipeline/blob/master/api/README.md) lists every variable.

Both persistence engines require `x-tenant-schema` on routed HTTP requests.
PostgreSQL selects a schema; libSQL selects the corresponding database.

**CRUD operations:**

```bash
# Log in as the seeded admin, then copy `accessToken` from the JSON response.
# The refresh token arrives as an HttpOnly cookie; POST /auths/refresh exchanges it.
curl -X POST http://localhost:3000/auths/login -c cookies.txt \
  -H 'Content-Type: application/json' \
  -H 'x-tenant-schema: tenant' \
  -d '{"email":"alice+tenant@seed.local","code":"secret-code"}'
export TOKEN='<accessToken from login response>'

# Create a user
curl -X POST http://localhost:3000/users \
  -H 'Content-Type: application/json' \
  -H 'x-tenant-schema: tenant' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'x-correlation-id: demo-123' \
  -d '{"name": "Aristotelis", "email": "aristotelis@example.com"}'

# Get all users
curl -X GET http://localhost:3000/users \
  -H 'x-tenant-schema: tenant' \
  -H "Authorization: Bearer $TOKEN"

# Get by ID
curl http://localhost:3000/users/<id> \
  -H 'x-tenant-schema: tenant' \
  -H "Authorization: Bearer $TOKEN"

# Update
curl -X PATCH http://localhost:3000/users/<id> \
  -H 'Content-Type: application/json' \
  -H 'x-tenant-schema: tenant' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "NewName"}'

# Delete a user
curl -X DELETE http://localhost:3000/users/<user-id> \
  -H 'x-tenant-schema: tenant' \
  -H "Authorization: Bearer $TOKEN"

# Run with Fastify adapter
ADAPTER=fastify pnpm start
```

**What it demonstrates:**

- Global + per-handler pipeline behaviors
- Decoupled domain invariants with framework-agnostic `DomainException` & presentation-boundary `DomainExceptionFilter` (mapping to 400, 409, 422)
- Clean Architecture persistence repository boundaries: CQRS handlers inject exclusively `ICommandRepository` and `IQueryRepository`, completely decoupled from ORM/database client classes (zero `MIKRO_ORM_CLIENT` leakage in handlers)
- Persistent token revocation on logout via `RevokeAuthCommand`, per-request permission loading in `CaslPermissionSource`, and explicit principal classification
- Optimistic concurrency with aggregate version tracking on `User` and `Role` entities. Persistence adapters translate driver/ORM conflict diagnostics into the transport-neutral `ConcurrencyConflictError`; the HTTP presentation filter maps that error to `409 Conflict`.
- Injectable `CaslAuthorizer` in CQRS command and query handlers: `authorize` before writes, `project` for read models and responses
- Per-handler CASL requirements declared with `requires(...)`
- MikroORM-backed CASL permission source (roles, per-user grants and denials)
- Official MikroORM `accessor: true` entity schemas bridging private aggregate fields to public accessors without TypeScript bypasses
- Decoupled CQRS caching architecture with collision-safe key derivation (`cacheKey`), fail-fast handler templates (`cacheKeyTemplate`), and static aggregate naming (`User.aggregateName`)
- Versioned database migrations with tracking (`mikro_orm_migrations` table)
- Zod-parsed/validated commands and queries via `createCommand()` and `createQuery()` exposing Standard Schema (`['~standard']`) metadata
- Controller-level schema validation through Nest's default `StandardSchemaValidationPipe`
- Zod transform mappers (DTO → Command mapping)
- OpenTelemetry tracing with `TraceBehavior` and metrics with `MetricsBehavior`
- Command- and event-scoped `DeadLetterBehavior` sending failed executions to a BullMQ `dead-letters` queue for inspection and replay (restricted to mutating command and event failures, excluding read queries and validation errors, with `UserCreatedHandler` opting into `{ rethrow: false }` only after successful delivery); transport failures are logged and preserve the original handler error
- Per-handler `RateLimitBehavior` throttling `CreateUserHandler` to 5 registrations / 60s per email (in-memory limiter), with `ErrorFilter` mapping breaches to HTTP 429 + `Retry-After`
- Per-handler `AuditBehavior` recording the sensitive `user.delete` action (actor, outcome, duration, redacted payload) to the default `LogAuditSink`, with the actor resolved from async session context
- Per-handler `IdempotencyBehavior` atomically excluding concurrent duplicates for `CreateUserHandler` per tenant + principal + email and replaying completed successful responses; with the default `releaseOnError: true`, a failed execution releases the key so a later retry may execute again. `ErrorFilter` maps in-flight duplicates to HTTP 409 and payload-mismatched key reuse to HTTP 422
- DDD-style `User` and `Role` entities built on `ddd-core` primitives (`RootEntity`, `RootDomainEvent`)
- MikroORM (libSQL and PostgreSQL drivers) persistence with multi-tenant database/schema isolation
- Pluggable `ICache<T>` — `MikroOrmCache` (MikroORM-backed, TTL-aware) or `MemoryCache` swapped via a single provider token
- Correlation ID propagation across HTTP middleware, handlers, processors, and events
- Express and Fastify adapter support with secure session cookie and Bearer/API-key authentication
