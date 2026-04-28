# @nestjs-pipeline/ddd-users-api

A complete NestJS application demonstrating `@nestjs-pipeline` with Domain-Driven Design.

## Overview

This sample builds on `@nestjs-pipeline/ddd-core` to show a full CQRS + DDD stack:

- **Domain layer** — `User` entity extending `CacheableEntity`, domain events (`UserCreatedEvent`, `UserUpdatedEvent`, `UserDeletedEvent`), and outcomes (`UserCreateOutcome`, `UserUpdateOutcome`).
- **CQRS layer** — Command/query handlers with `@UsePipeline` behaviors, validated via `createRequest()` and Zod schemas.
- **Persistence** — Turso (libSQL) as the primary store with a normalized `users` table; repositories extend `CommandRepository` / `QueryRepository` from `ddd-core`.
- **Caching** — Two `ICache<T>` implementations: `TursoCache` (Turso-backed, TTL-aware) and `MemoryCache` (in-process). Configured via `CACHE_TOKEN` in `UsersModule`.
- **Event handlers** — React to domain events, enqueue background jobs via BullMQ.
- **Controllers** — REST endpoints with `ZodPipe` validation and correlation ID propagation.
- **Logging** — `nestjs-pino` logger wired into both `LoggingBehavior` and `TraceBehavior` via DI tokens.

## Getting Started

```bash
cd ddd/users-api
pnpm install
pnpm start
```

### Environment variables

| Variable             | Default        | Description                          |
|----------------------|----------------|--------------------------------------|
| `TURSO_DATABASE_URL` | `file:local.db`| libSQL database URL (file or remote) |
| `TURSO_AUTH_TOKEN`   | _(none)_       | Auth token for Turso cloud databases |

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
| `created_at` | INTEGER | Creation timestamp (Unix ms)     |
| `updated_at` | INTEGER | Last-updated timestamp (Unix ms) |

### `cache` table

| Column       | Type    | Description                                          |
|--------------|---------|------------------------------------------------------|
| `key`        | TEXT PK | Cache key (e.g. `user:<id>`)                         |
| `value`      | TEXT    | JSON-serialized cached value                         |
| `expires_at` | INTEGER | Expiry timestamp (Unix ms); `NULL` means no expiry   |

Both tables are created automatically on startup via `onModuleInit`.

## Caching

### `TursoCache<T>` — Turso-backed cache (default)

Implements `ICache<T>` using the same libSQL client as the main store. Entries are stored in the `cache` table.

- **TTL**: pass `{ ttl: <ms> }` as the third argument to `set()`. Expired entries are filtered on `get()` (lazy eviction).
- **No expiry**: omit `options` or leave `ttl` undefined.

### `MemoryCache<T>` — In-process cache (alternative)

Simple `Map`-backed implementation, useful for local development or testing. Switch to it in `UsersModule` by swapping the provider:

```ts
// users.module.ts
{ provide: CACHE_TOKEN, useClass: MemoryCache }
```

### `@Cacheable()` — Command-side write-through

Applied to `save()` in command repositories. After a successful write it upserts the result into the cache; if the result is `null` (delete), it evicts the entry.

### `@Cache()` — Query-side read-through

Applied to `find()` in query repositories. Checks the cache first; on a miss it calls the database and populates the cache. Accepts a key function and an optional hydration function to reconstruct the domain entity from the cached value.

## What it demonstrates

- Global + per-handler pipeline behaviors
- Zod-validated commands, queries, and events via `createRequest()`
- Controller-level `ZodPipe` validation
- OpenTelemetry tracing with `TraceBehavior`
- DDD-style `User` entity built on `ddd-core` primitives (`CacheableEntity`, `RootDomainEvent`, `RootDomainOutcome`)
- Turso (libSQL) persistence with a fully normalized schema
- Pluggable `ICache<T>` — swap `TursoCache` ↔ `MemoryCache` via a single provider token
- Correlation ID propagation across handlers and events
- Express and Fastify adapter support
- BullMQ background job processing

## Dependencies

- `@nestjs-pipeline/core` (`workspace:*`, current `0.1.11`)
- `@nestjs-pipeline/ddd-core` (`workspace:*`, current `0.0.3`)
- `@nestjs-pipeline/correlation` (`workspace:*`, current `0.1.6`)
- `@nestjs-pipeline/opentelemetry` (`workspace:*`, current `0.1.5`)
- `@nestjs-pipeline/zod` (`workspace:*`, current `0.1.5`)
- `@libsql/client`
- `nestjs-pino`
- `pino-http`
- `pino-pretty`
