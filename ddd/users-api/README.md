# @nestjs-pipeline/ddd-users-api

A complete NestJS application demonstrating `@nestjs-pipeline` with Domain-Driven Design.


## Overview

This sample builds on `@nestjs-pipeline/ddd-core` to show a full CQRS + DDD stack, with **MikroORM as the persistence and cache layer**.

- **Domain layer** — `User` and `Role` entities extending `CacheableEntity`, domain events, and outcomes.
- **CQRS layer** — Command/query handlers with `@UsePipeline` behaviors, validated via `createExecuteClass()` / `createQuery()` and Zod schemas.
- **Persistence** — Dual-engine support: **libSQL** (SQLite) for local development and **PostgreSQL** for production multi-tenant deployments. Conditional routing via `MIKRO_ORM_CLIENT` provider.
- **Multi-tenant routing** — When `DB_ENGINE=postgres`, tenant schema is resolved per-request from the `x-tenant-schema` header and isolated via PostgreSQL schema-per-tenant pattern. Domain entities remain tenant-agnostic (no embedded `tenantId`).
- **Caching** — **MikroOrmCache** (MikroORM-backed, TTL-aware) configured via `CACHE_TOKEN` in `PersistenceModule`.
- **Authorization** — ABAC via `@nestjs-pipeline/casl`. Per-handler `CaslBehavior` with MikroORM-backed role/capability providers, explicit `subjectContextPaths`, global `defaultFieldsFromRequest`, condition interpolation, and inline `rules` on `CaslBehaviorOptions`.
- **Event handlers** — React to domain events, enqueue background jobs via BullMQ.
- **Controllers** — REST endpoints with `ZodPipe` validation and correlation ID propagation.
- **Logging** — `nestjs-pino` logger wired into both `LoggingBehavior` and `TraceBehavior` via DI tokens.

## Getting Started

```bash
cd ddd/users-api
pnpm install
pnpm db:migrate   # apply schema + data migrations (idempotent)
pnpm start
```

### Environment variables

| Variable             | Default        | Description                          |
|----------------------|----------------|--------------------------------------|
| `DB_ENGINE`          | `libsql`       | Persistence engine: `libsql` (SQLite) or `postgres` |
| `DATABASE_URL`       | `file:src/persistence/local-tenant_a.db` | SQLite database URL (only used when `DB_ENGINE=libsql`); supports local file or remote libSQL endpoint |
| `AUTH_TOKEN`         | _(none)_       | Auth token for remote libSQL databases (only used when `DB_ENGINE=libsql`) |
| `DATABASE_HOST`      | `127.0.0.1`    | PostgreSQL host (only used when `DB_ENGINE=postgres`) |
| `DATABASE_PORT`      | `5432`         | PostgreSQL port (only used when `DB_ENGINE=postgres`) |
| `DATABASE_NAME`      | `nestjs_pipeline` | PostgreSQL database name (only used when `DB_ENGINE=postgres`) |
| `DATABASE_USER`      | `postgres`     | PostgreSQL database user (only used when `DB_ENGINE=postgres`) |
| `DATABASE_PASSWORD`  | `postgres`     | PostgreSQL database password (only used when `DB_ENGINE=postgres`) |
| `DB_DEFAULT_SCHEMA`  | `tenant_default` | Default PostgreSQL schema for tenant (only used when `DB_ENGINE=postgres`) |
| `TENANT_SCHEMAS`     | _(none)_       | Comma-separated list of tenant schema names for migrations (e.g. `tenant_a,tenant_b`); if set, `migrate` and `revert` commands process all listed schemas |

### Dual-engine architecture

**libSQL (SQLite)** — Default for local development:
- Uses separate database files per tenant (`local-tenant_a.db`, `local-tenant_b.db`)
- No schema isolation; each file is independent
- Loaded by `MikroOrmStore` when `DB_ENGINE !== 'postgres'`

**PostgreSQL** — For production multi-tenant deployments:
- One database, multiple schemas (one per tenant)
- Request middleware extracts `x-tenant-schema` header and sets tenant context
- `AppModule` binds the DI-provided `TenantSchemaMiddleware` handler in `configure()`
- `PostgresMikroOrmStore` forks EntityManager with the tenant schema
- Domain entities remain tenant-agnostic; schema routing is transparent to business logic

## Project structure

```
src/
├── app.module.ts              # Root module — wires Pipeline, CASL, Persistence, Users, Roles
├── main.ts                    # Bootstrap (Express/Fastify)
├── tracing.ts                 # OpenTelemetry SDK setup
│
├── common/                    # Shared helpers (aliased as @common/*)
│   ├── cqrs/helpers/
│   │   ├── createExecute.helper.ts   # Zod-validated Command/Query class factory
│   └── mappers/
│       └── create-mapper.helper.ts   # DTO → Command mapper factory
│
├── persistence/               # Global persistence layer (aliased as @persistence/*)
│   ├── persistence.module.ts  # @Global() — provides MIKRO_ORM_CLIENT, CACHE_TOKEN; routes to libSQL or PostgreSQL
│   ├── libsql-options.ts      # MikroORM config factory for SQLite (libSQL)
│   ├── postgres-options.ts    # MikroORM config factory for PostgreSQL + schema validation
│   ├── mikro-orm.store.ts     # SQLite client wrapper (uses libsql-options.ts)
│   ├── postgres-mikro-orm.store.ts # PostgreSQL client wrapper with tenant schema routing
│   ├── tenant-schema.context.ts # AsyncLocalStorage for per-request tenant schema isolation
│   ├── migrations/            # Native MikroORM migration classes
│   ├── middlewares/
│   │   └── tenant-schema.middleware.ts # Express middleware to extract x-tenant-schema header
│   ├── migrate.ts             # CLI runner for schema + seed migrations
│   ├── revert.ts              # CLI runner to revert migrations
│   ├── store.interface.ts
│   ├── memory-store.ts
│   └── cache/
│       ├── memory.cache.ts    # In-process ICache<T> (CACHE_TOKEN)
│       └── mikro-orm.cache.ts # MikroORM-backed ICache<T> (default)
│
├── users/                     # Users bounded context
│   ├── users.module.ts
│   ├── controllers/           # REST endpoints
│   ├── cqrs/
│   │   ├── commands/          # CreateUser, UpdateUser, DeleteUser
│   │   ├── events/            # UserCreated, UserUpdated, UserDeleted
│   │   └── queries/           # GetUser, GetUsers, GetUserContext, GetUserCapabilities
│   ├── domain/                # User entity, events, outcomes
│   ├── dtos/                  # Zod-validated DTOs
│   ├── jobs/                  # BullMQ processors
│   ├── mappers/               # DTO → Command mappers
│   ├── persistence/           # Command + Query repositories
│   │   ├── get-user-context.query-repository.ts        # implements IUserContextResolver
│   │   └── get-user-capabilities.query-repository.ts   # implements IUserCapabilityProvider
│   └── repositories/         # Repository DI tokens
│
└── roles/                     # Roles bounded context
    ├── roles.module.ts
    ├── controllers/           # REST endpoints
    ├── cqrs/
    │   ├── commands/          # CreateRole, UpdateRole, DeleteRole
    │   ├── events/            # RoleCreated, RoleUpdated, RoleDeleted
    │   └── queries/           # GetRole, GetRoles, GetRolesCapabilities
    ├── domain/                # Role entity, events, outcomes
    ├── dtos/                  # Zod-validated DTOs
    ├── mappers/               # DTO → Command mappers
    └── persistence/           # Command + Query repositories + tokens
        └── get-roles-capabilities.query-repository.ts  # implements IRoleProvider
```

### Path aliases

TypeScript path aliases keep imports clean and decouple modules from relative path depth:

| Alias             | Maps to           |
|-------------------|-------------------|
| `@common/*`       | `./src/common/*`  |
| `@persistence/*`  | `./src/persistence/*` |

## Migrations

Database schema is managed by native MikroORM migrations in `src/persistence/migrations`.

### libSQL (SQLite) mode (default)

- **On app startup** — `MikroOrmStore.onModuleInit()` auto-runs `orm.migrator.up()` against the configured database file.
- **Multiple databases** — Update `DATABASE_URL` to point to different files, or run migrations separately for each file.
- **CLI** — Use `pnpm db:migrate` to apply pending migrations (runs against current `DATABASE_URL`).

### PostgreSQL mode

When `DB_ENGINE=postgres`, schema-per-tenant routing is enabled:

- **Per-request isolation** — `TenantSchemaMiddleware` extracts `x-tenant-schema` header and stores it in `TenantSchemaContext` (via `AsyncLocalStorage`).
- **EntityManager forking** — `PostgresMikroOrmStore.em` forks the connection with the tenant schema, so all queries are automatically scoped.
- **Domain entities** — Remain tenant-agnostic; no `tenantId` field (schema isolation is transparent).
- **Startup migrations** — On app boot, runs migrations **only against the default schema** (`DB_DEFAULT_SCHEMA`).
- **CLI multi-tenant** — Use `TENANT_SCHEMAS=tenant_a,tenant_b pnpm db:migrate` to run migrations across multiple schemas.

### Migration and seed files

- **New migrations** — Create migration classes in `src/persistence/migrations` (or generate via MikroORM CLI).
- **Seed data** — Stored as data migrations (e.g., `Migration20260501010000.ts`) and applied with `pnpm db:migrate`.
- **Idempotent** — All migrations use `if not exists` clauses and `upsert` logic to safely re-run.

## Logging

This sample uses `nestjs-pino` as the application logger and forwards it to pipeline libraries:

- `LOGGING_BEHAVIOR_LOGGER` → `Logger` from `nestjs-pino`

This gives one consistent logger for HTTP logs, pipeline request/response logs, and tracing startup diagnostics.

## Database schema

### `users` table

| Column       | Type    | Description                      |
|--------------|---------|----------------------------------|
| `id`         | TEXT PK | UUID v7 identifier               |
| `username`   | TEXT    | Normalized username              |
| `email`      | TEXT    | Email address                    |
| `department` | TEXT    | Department name (nullable)       |
| `created_at` | INTEGER | Creation timestamp (Unix ms)     |
| `updated_at` | INTEGER | Last-updated timestamp (Unix ms) |

### `cache` table

| Column       | Type    | Description                                          |
|--------------|---------|------------------------------------------------------|
| `key`        | TEXT PK | Cache key (e.g. `user:<id>`)                         |
| `value`      | TEXT    | JSON-serialized cached value                         |
| `expires_at` | INTEGER | Expiry timestamp (Unix ms); `NULL` means no expiry   |

### `roles` table

| Column       | Type    | Description                      |
|--------------|---------|----------------------------------|
| `id`         | TEXT PK | UUID v7 identifier               |
| `name`       | TEXT    | Unique role name                 |
| `created_at` | INTEGER | Creation timestamp (Unix ms)     |
| `updated_at` | INTEGER | Last-updated timestamp (Unix ms) |

### CASL authorization tables

| Table                            | Description                                    |
|----------------------------------|------------------------------------------------|
| `capabilities`                   | Permission definitions (subject, action, conditions, fields, inverted) |
| `roles`                          | Named roles (`admin`, `viewer`, …)             |
| `role_capabilities`              | Junction: role → capability                    |
| `user_roles`                     | Junction: user → role                          |
| `user_additional_capabilities`   | Per-user extra capabilities                    |
| `user_denied_capabilities`       | Per-user denied capabilities                   |

All tables are created via versioned migrations (see [Migrations](#migrations)).

### PostgreSQL Schema-per-tenant pattern

Tenant isolation is achieved via PostgreSQL schemas, not by embedding `tenantId` in tables. This keeps domain entities clean and simplifies backoffice queries.

```bash
# Create schemas for each tenant
psql -U postgres -d nestjs_pipeline -c "create schema if not exists tenant_acme;"
psql -U postgres -d nestjs_pipeline -c "create schema if not exists tenant_globex;"

# Migrate both tenants
TENANT_SCHEMAS=tenant_acme,tenant_globex pnpm db:migrate
```

**Request routing** — Client sends `x-tenant-schema` header:

```bash
# Route to tenant_acme
curl http://localhost:3000/users \
  -H 'x-tenant-schema: tenant_acme' \
  -H 'Authorization: Bearer <token>'

# Route to tenant_globex (same table structure, different schema)
curl http://localhost:3000/users \
  -H 'x-tenant-schema: tenant_globex' \
  -H 'Authorization: Bearer <token>'
```

**Backoffice cross-tenant reads** — Use a DB-level union view:

```sql
create or replace view backoffice_users as
select 'tenant_acme'::text as tenant_schema, id, username, email, department, created_at
from tenant_acme.users
union all
select 'tenant_globex'::text as tenant_schema, id, username, email, department, created_at
from tenant_globex.users;

-- Keyset paging example
select * from backoffice_users
where (created_at, id, tenant_schema) < ($1, $2, $3)
order by created_at desc, id desc, tenant_schema desc
limit 50;
```

## Authorization (CASL)

Uses `@nestjs-pipeline/casl` for attribute-based access control with roles.

### Architecture

All three CASL provider interfaces are implemented as proper `QueryRepository` subclasses with `@FromCache` decorators, following the same DDD pattern as the rest of the application:

- **`GetRolesCapabilitiesQueryRepository`** (`roles/persistence/`) — implements `IRoleProvider`. Loads role → capability definitions from the `roles` / `role_capabilities` / `capabilities` tables. Extends `QueryRepository<GetRolesCapabilitiesQuery, RoleDefinition[]>`.
- **`GetUserContextQueryRepository`** (`users/persistence/`) — implements `IUserContextResolver`. Reads the current user from the configured CASL `subjectContextPaths` (in this app: `sessionUser`) and fetches department from the `users` table when capability data is not already embedded in the session/JWT. REQUEST-scoped. Extends `QueryRepository<GetUserContextQuery, CaslUserContext | undefined>`.
- **`GetUserCapabilitiesQueryRepository`** (`users/persistence/`) — implements `IUserCapabilityProvider`. Returns the user's assigned roles plus any per-user additional/denied capabilities. Extends `QueryRepository<GetUserCapabilitiesQuery, UserCapabilities>`.

Each has a corresponding Zod-validated query class (via `createQuery()`) and a `@QueryHandler` in its module's `cqrs/queries/` directory.

### Per-handler (not global)

CASL is attached per-handler via `@UsePipeline`. The app also defines global CASL defaults in `AppModule`:

- `subjectContextPaths: ['sessionUser']`
- `defaultFieldsFromRequest: { User: ['username', 'department', 'email'] }`

These defaults mean handlers do not need to repeat nested user/session lookup or common field-level update checks unless they want to override them.

For example, `CreateRoleHandler` requires multiple capabilities declared inline via `rules`:

```ts
export class CreateRoleCommand extends createExecuteClass(...) {}

@CommandHandler(CreateRoleCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [CaslBehavior, {
    subjectFromRequest: 'Role',
    rules: [
      { action: 'create', subject: 'Role' },
      { action: 'read', subject: 'User' },
    ],
  }],
)
export class CreateRoleHandler extends CommandBaseHandler<...> { ... }
```

The `[LoggingBehavior, { requestResponseLogLevel: 'log' }]` entry here re-declares a behavior that is also registered globally in `AppModule`. Because the pipeline applies a **same-class override**, the handler's entry replaces the global `LoggingBehavior` for this handler (running once, at the `log` level) rather than running twice.

Other handlers remain unaffected. To extend authorization to more commands/queries, add `[CaslBehavior, { rules: [...] }]` to their `@UsePipeline`.

### Testing authorization

Authenticate with a Bearer JWT or a secure session cookie. The request user is
stored under `sessionUser`, which is also the configured CASL subject-context path.

```bash
# Apply migrations (schema + seed data)
pnpm db:migrate

# Obtain a token first (example login endpoint may vary by environment)
# Then call protected routes with Authorization: Bearer <token>

# Admin (alice) — allowed to create users
curl -X POST http://localhost:3000/users \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <alice-token>' \
  -d '{"name":"New User","email":"new@acme.io"}'

# Viewer (dave) — should be denied (no User|create capability)
curl -X POST http://localhost:3000/users \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <dave-token>' \
  -d '{"name":"New User","email":"new@acme.io"}'

# No credentials — ForbiddenException (authentication required)
curl -X POST http://localhost:3000/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"New User","email":"new@acme.io"}'
```

### Seed data

Run `pnpm db:migrate` to apply schema and seed data migrations. The demo data includes 7 users, 5 roles, 13 capabilities, and per-user overrides exercising:

| Scenario                    | User    | Role(s)                  | Notes                                           |
|-----------------------------|---------|--------------------------|--------------------------------------------------|
| Unrestricted admin          | Alice   | `admin`                  | `all|manage|*`                                    |
| Department-scoped manager   | Bob     | `user-manager`           | Can manage users in own department, cannot delete or update email |
| Self only           | Carol   | `self`           | Can read own profile and update only own username |
| Read-only viewer            | Dave    | `viewer`                 | Field-restricted read + per-user `User|create`; cannot self-update |
| Multi-role merge            | Eve     | `viewer` + `self`| Combined: read all + update own                   |
| Department-scoped agent     | Frank   | `support-agent`          | Scoped read + field-restricted update + no delete |
| Manager with denial         | Grace   | `user-manager`           | Same as Bob; email denial is now role-level       |

## Caching


### `MikroOrmCache<T>` — MikroORM-backed cache (default)

Implements `ICache<T>` using MikroORM as the primary cache store. Entries are stored in the `cache` table.

- **TTL**: pass `{ ttl: <ms> }` as the third argument to `set()`. Expired entries are filtered on `get()` (lazy eviction).
- **No expiry**: omit `options` or leave `ttl` undefined.

### `MemoryCache<T>` — In-process cache (alternative)

Simple `Map`-backed implementation, useful for local development or testing. Switch to it in `PersistenceModule` by swapping the provider:

```ts
// persistence.module.ts
{ provide: CACHE_TOKEN, useClass: MemoryCache }
```

### `@Cache()` — Command-side write-through

Applied to `save()` in command repositories. After a successful write it upserts the result into the cache; if the result is `null` (delete), it evicts the entry.

### `@FromCache()` — Query-side read-through

Applied to `find()` in query repositories. Checks the cache first; on a miss it calls the database and populates the cache. Accepts a key function and an optional hydration function to reconstruct the domain entity from the cached value.

## What it demonstrates

- Two bounded contexts (`users/`, `roles/`) with independent modules, controllers, CQRS layers, and persistence
- Shared infrastructure via `@Global()` `PersistenceModule` and `common/` helpers with `@common/*` / `@persistence/*` path aliases
- Global + per-handler pipeline behaviors
- Per-handler CASL authorization with inline `rules` on `CaslBehaviorOptions` and `CaslBehavior`
- CASL providers (`IRoleProvider`, `IUserContextResolver`, `IUserCapabilityProvider`) implemented as `QueryRepository` subclasses with `@FromCache` decorators
- Zod-validated commands, queries, and events via `createExecuteClass()` / `createQuery()`
- Controller-level `ZodPipe` validation
- OpenTelemetry tracing with `TraceBehavior`
- DDD-style entities built on `ddd-core` primitives (`CacheableEntity`, `RootDomainEvent`, `RootDomainOutcome`)
- Native MikroORM migrations executed at startup
- **Dual-engine persistence architecture**
  - libSQL (SQLite) by default — multi-database files per tenant
  - PostgreSQL with schema-per-tenant isolation — domain entities remain tenant-agnostic
  - Conditional routing via `MIKRO_ORM_CLIENT` DI token based on `DB_ENGINE` environment variable
- **Multi-tenant request isolation** — `TenantSchemaContext` + `AsyncLocalStorage` for per-request schema routing (PostgreSQL)
- Pluggable `ICache<T>` — swap `MikroOrmCache` ↔ `MemoryCache` via a single provider token
- Correlation ID propagation across handlers and events
- Express and Fastify adapter support
- BullMQ background job processing

## Dependencies

- `@nestjs-pipeline/core` (`workspace:*`)
- `@nestjs-pipeline/casl` (`workspace:*`)
- `@nestjs-pipeline/ddd-core` (`workspace:*`)
- `@nestjs-pipeline/correlation` (`workspace:*`)
- `@nestjs-pipeline/opentelemetry` (`workspace:*`)
- `@nestjs-pipeline/zod` (`workspace:*`)
- `@casl/ability`
- `@libsql/client`
- `@mikro-orm/libsql`
- `@mikro-orm/postgresql`
- `nestjs-pino`
- `pino-http`
- `pino-pretty`
