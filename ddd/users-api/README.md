# @nestjs-pipeline/ddd-users-api

A complete NestJS application demonstrating `@nestjs-pipeline` with Domain-Driven Design.

## Overview

This sample builds on `@nestjs-pipeline/ddd-core` to show a full CQRS + DDD stack:

- **Domain layer** — `User` and `Role` entities extending `CacheableEntity`, domain events, and outcomes.
- **CQRS layer** — Command/query handlers with `@UsePipeline` behaviors, validated via `createExecuteClass()` / `createQuery()` and Zod schemas.
- **Persistence** — Turso (libSQL) as the primary store; repositories extend `CommandRepository` / `QueryRepository` from `ddd-core`.
- **Caching** — Two `ICache<T>` implementations: `TursoCache` (Turso-backed, TTL-aware) and `MemoryCache` (in-process). Configured via `CACHE_TOKEN` in `PersistenceModule`.
- **Authorization** — ABAC via `@nestjs-pipeline/casl`. Per-handler `CaslBehavior` with Turso-backed role/capability providers, explicit `subjectContextPaths`, global `defaultFieldsFromRequest`, condition interpolation, and inline `rules` on `CaslBehaviorOptions`.
- **Event handlers** — React to domain events, enqueue background jobs via BullMQ.
- **Controllers** — REST endpoints with `ZodPipe` validation and correlation ID propagation.
- **Logging** — `nestjs-pino` logger wired into both `LoggingBehavior` and `TraceBehavior` via DI tokens.

## Getting Started

```bash
cd ddd/users-api
pnpm install
pnpm db:migrate   # create tables (idempotent)
pnpm db:seed      # populate demo data (runs migrate first)
pnpm start
```

### Environment variables

| Variable             | Default        | Description                          |
|----------------------|----------------|--------------------------------------|
| `TURSO_DATABASE_URL` | `file:local.db`| libSQL database URL (file or remote) |
| `TURSO_AUTH_TOKEN`   | _(none)_       | Auth token for Turso cloud databases |

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
│   │   └── createQuery.helper.ts     # Query-specific variant (extends QueryOptions)
│   └── mappers/
│       └── create-mapper.helper.ts   # DTO → Command mapper factory
│
├── persistence/               # Global persistence layer (aliased as @persistence/*)
│   ├── persistence.module.ts  # @Global() — provides TURSO_CLIENT, CACHE_TOKEN
│   ├── turso-store.ts         # libSQL client wrapper + migration runner
│   ├── migrate.ts             # Versioned migrations
│   ├── seed.ts                # Demo data seeder
│   ├── store.interface.ts
│   ├── memory-store.ts
│   └── cache/
│       ├── memory.cache.ts    # In-process ICache<T> (CACHE_TOKEN)
│       └── turso.cache.ts     # Turso-backed ICache<T> (default)
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

Database schema is managed by a simple versioned migration runner in `src/persistence/migrate.ts`.

- **`pnpm db:migrate`** — run standalone from the CLI. Creates a `_migrations` tracking table and applies only pending migrations.
- **On app startup** — `TursoStore.onModuleInit()` calls the same `migrate()` function, so the schema is always up to date before the first request.
- **`pnpm db:seed`** — runs pending migrations first, then inserts demo data (idempotent via `INSERT OR IGNORE`).

Migrations are defined in `migrate.ts` as an ordered array. To add a new migration, append a new entry with the next version number:

```ts
// migrate.ts
export const migrations: Migration[] = [
  { version: 1, name: 'create_users_and_cache', sql: [...] },
  { version: 2, name: 'create_casl_tables',     sql: [...] },
  // ↓ add new migrations here
  { version: 3, name: 'add_avatar_column',      sql: ['ALTER TABLE users ADD COLUMN avatar TEXT'] },
];
```

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
| `tenant_id`  | TEXT    | Tenant identifier (nullable)     |
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

## Authorization (CASL)

Uses `@nestjs-pipeline/casl` for attribute-based access control with roles.

### Architecture

All three CASL provider interfaces are implemented as proper `QueryRepository` subclasses with `@Cache` decorators, following the same DDD pattern as the rest of the application:

- **`GetRolesCapabilitiesQueryRepository`** (`roles/persistence/`) — implements `IRoleProvider`. Loads role → capability definitions from the `roles` / `role_capabilities` / `capabilities` tables. Extends `QueryRepository<GetRolesCapabilitiesQuery, RoleDefinition[]>`.
- **`GetUserContextQueryRepository`** (`users/persistence/`) — implements `IUserContextResolver`. Reads the current user from the configured CASL `subjectContextPaths` (in this app: `sessionUser`) and fetches tenant/department from the `users` table when capability data is not already embedded in the session/JWT. REQUEST-scoped. Extends `QueryRepository<GetUserContextQuery, CaslUserContext | undefined>`.
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

Other handlers remain unaffected. To extend authorization to more commands/queries, add `[CaslBehavior, { rules: [...] }]` to their `@UsePipeline`.

### Testing authorization

Authenticate with a Bearer JWT or a secure session cookie. The request user is
stored under `sessionUser`, which is also the configured CASL subject-context path.

```bash
# Seed the database first
pnpm db:seed

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

Run `pnpm db:seed` to populate the authorization tables with 7 users, 5 roles, 13 capabilities, and per-user overrides exercising:

| Scenario                    | User    | Role(s)                  | Notes                                           |
|-----------------------------|---------|--------------------------|--------------------------------------------------|
| Unrestricted admin          | Alice   | `admin`                  | `all|manage|*`                                    |
| Tenant-scoped manager       | Bob     | `user-manager`           | Can manage users in own tenant, cannot delete or update email |
| Self only           | Carol   | `self`           | Can read own profile and update only own username |
| Read-only viewer            | Dave    | `viewer`                 | Field-restricted read + per-user `User|create`; cannot self-update |
| Multi-role merge            | Eve     | `viewer` + `self`| Combined: read all + update own                   |
| Department-scoped agent     | Frank   | `support-agent`          | Scoped read + field-restricted update + no delete |
| Manager with denial         | Grace   | `user-manager`           | Same as Bob; email denial is now role-level       |

## Caching

### `TursoCache<T>` — Turso-backed cache (default)

Implements `ICache<T>` using the same libSQL client as the main store. Entries are stored in the `cache` table.

- **TTL**: pass `{ ttl: <ms> }` as the third argument to `set()`. Expired entries are filtered on `get()` (lazy eviction).
- **No expiry**: omit `options` or leave `ttl` undefined.

### `MemoryCache<T>` — In-process cache (alternative)

Simple `Map`-backed implementation, useful for local development or testing. Switch to it in `PersistenceModule` by swapping the provider:

```ts
// persistence.module.ts
{ provide: CACHE_TOKEN, useClass: MemoryCache }
```

### `@Cacheable()` — Command-side write-through

Applied to `save()` in command repositories. After a successful write it upserts the result into the cache; if the result is `null` (delete), it evicts the entry.

### `@Cache()` — Query-side read-through

Applied to `find()` in query repositories. Checks the cache first; on a miss it calls the database and populates the cache. Accepts a key function and an optional hydration function to reconstruct the domain entity from the cached value.

## What it demonstrates

- Two bounded contexts (`users/`, `roles/`) with independent modules, controllers, CQRS layers, and persistence
- Shared infrastructure via `@Global()` `PersistenceModule` and `common/` helpers with `@common/*` / `@persistence/*` path aliases
- Global + per-handler pipeline behaviors
- Per-handler CASL authorization with inline `rules` on `CaslBehaviorOptions` and `CaslBehavior`
- CASL providers (`IRoleProvider`, `IUserContextResolver`, `IUserCapabilityProvider`) implemented as `QueryRepository` subclasses with `@Cache` decorators
- Zod-validated commands, queries, and events via `createExecuteClass()` / `createQuery()`
- Controller-level `ZodPipe` validation
- OpenTelemetry tracing with `TraceBehavior`
- DDD-style entities built on `ddd-core` primitives (`CacheableEntity`, `RootDomainEvent`, `RootDomainOutcome`)
- Versioned database migrations with tracking (`_migrations` table)
- Turso (libSQL) persistence with a fully normalized schema
- Pluggable `ICache<T>` — swap `TursoCache` ↔ `MemoryCache` via a single provider token
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
- `nestjs-pino`
- `pino-http`
- `pino-pretty`
