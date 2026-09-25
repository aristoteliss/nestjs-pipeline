# @nestjs-pipeline/ddd-core

## Repository reads and cache ownership

Repository caching is an intentional reusable capability, including reads needed
by commands whose freshness contract permits it. Commands do not need to dispatch
application queries for repository lookups. The current mutation path deliberately
loads authoritative aggregates through the write-side repository. Pipeline caching
remains useful for final composed application results; neither layer replaces the
other. See the
[architecture skill](../../.agents/skills/nestjs-pipeline-architecture/SKILL.md)
for consistency and invalidation
requirements. Existing barriers/CAS checks are mechanisms to verify, not proof of
atomic DB/cache consistency or complete anti-resurrection safety.

Framework-neutral DDD support: domain, application, MikroORM persistence and HTTP
status-mapping entry points, provided separately. It does not depend on NestJS or on any
`@nestjs-pipeline/*` package. A NestJS application supplies its own glue, such as
the injected `EventBus` it passes to `CommandBaseHandler` and a pipeline behavior
that calls `runWithTenant`. It is a private workspace package.

Internal users-api code imports domain primitives from `/domain`, application
ports and CQRS support from `/application`, and concrete adapters/decorators from
`/persistence`. An HTTP boundary takes status codes for this package's errors from
`/http`. The root export remains a compatibility convenience. Biome rejects
bare-root imports throughout users-api production code and persistence imports
from domain, CQRS, and application directories.

## Overview

This package provides the foundational building blocks for implementing a Clean Architecture / DDD domain and persistence layer:

### Domain Primitives

- **`AggregateRoot<EventBase>`** — Abstract base class representing a DDD aggregate root. Owns uncommitted event buffering (`this.apply(event)`), `getUncommittedEvents()`, `uncommit()`, and `loadFromHistory()`. Pure domain primitive completely decoupled from `@nestjs/*`.
- **`RootEntity<TSnapshot>`** — Abstract base aggregate entity extending domain `AggregateRoot`. Provides UUID v7 identity, detached `Date` reads for `createdAt`/`updatedAt` with public setters reserved for persistence hydration, accessor mappings (`id`, `createdAt`, `updatedAt`), optimistic concurrency version tracking (`version`, `getExpectedVersion()`), polymorphic snapshot rehydration via `RootEntity.from()` with strict aggregate type safety (throws `TypeError` on incompatible aggregates), and mutation tracking via `onUpdate()`, which calls the overridable `protected afterUpdate()` hook (a no-op by default).
- **`RootEntitySnapshot`** — Interface defining the serialized state contract (`id`, `createdAt`, `updatedAt`, and optional `version`).
- **`DomainException`** — Abstract base class for domain invariant failures. Pure TypeScript error class completely decoupled from HTTP status codes and framework decorators.
- **`DomainEvent`** — Abstract base class for domain events carrying a unique UUID v7 `id` and implementing `IEvent`.
- **`IEvent`** — Marker interface for domain events.
- **`RootDomainEvent<TEntity, TPayload>`** — Domain event carrying event-time `aggregateId`/`aggregateVersion` and a detached, deeply cloned and frozen state snapshot (`event.payload`) created via `deepCloneAndFreeze()` so later aggregate mutations never reach consumers; `clonePayload()` returns an independent copy per call.
- **`deepCloneAndFreeze<T>()`** — Deeply clones and recursively freezes any value (objects, arrays, `Date` with mutation guards, `Map`, `Set`, `RegExp`), safely handling circular references via a `WeakMap`.
- **`CommandBaseHandler<TCommand, TResult>`** — Abstract base handler for CQRS commands. Calls `handle()`, then publishes and clears buffered domain events from a returned `AggregateRoot` or result containing `aggregate: AggregateRoot`. Pipeline behaviors are applied by the pipeline integration; event publication is owned by `execute()`.
- **`@Mutable(options?)`** — Property decorator declaring an aggregate field as mutable via patch mutations, with optional backing property name and value normalizer.
- **`@ApplyMutation<TEntity>(options)`** — Completes a successful domain mutation by invoking `onUpdate()` (advancing `version` and `updatedAt`) and recording events from the resulting state. Methods return `this` (or `Promise<this>`); the decorator preserves that result. Call protected `applyPatch(...)` to validate and normalize all supplied `@Mutable` fields before writing them. Undefined values are ignored. Complete business validation before applying a patch: failures after field writes, including later method code, lifecycle hooks or event creation/application, do not roll back state; discard or reload the instance. A method that throws or rejects does not run the completion lifecycle.
- **`UnixTimestampType`** — Custom MikroORM `Type<Date, number>` mapping JavaScript `Date` instances to Unix timestamps (ms) in 64-bit `bigint` SQL database columns (`platform.getBigIntTypeDeclarationSQL()`) to eliminate integer overflow.
- **`rootEntityProperties(columns?)` / `versionProperty(column?)`** — MikroORM `EntitySchema` property definitions for the `id`, `createdAt`, `updatedAt` and `version` accessors every `RootEntity` inherits. Timestamps use `UnixTimestampType`; `version` is the optimistic-lock column and starts at 1. Column names default to `id`, `created_at`, `updated_at` and `version`; pass `{ id?, createdAt?, updatedAt? }` or a version column name to change them. Spread them into each aggregate schema: `properties: { ...rootEntityProperties(), version: versionProperty(), … }`.
- **`Method`** — Utility type for extracting method signatures.

### Persistence Abstractions

- **`ICache<T>`** — Interface for cache providers defining `get(key): Promise<T | undefined>`, `set(key, value, options?: CacheSetOptions): Promise<void>`, and `delete(key): Promise<void>`. Sufficient for `@Cache` write-through; `@FromCache` read-through additionally requires `IVersionedCache`.
- **`IVersionedCache<T>`** / **`isVersionedCache(cache)`** — The revision-fenced contract (`readState`, `invalidate`, `tryFill`) and its capability guard. `@FromCache` caches only through an adapter that satisfies it.
- **`CacheSetOptions`** — Options for cache writes: `ttl?: number` and atomic stale-write check `isNewer?: (cached: unknown, incoming: unknown) => boolean`.
- **`isCacheNewer(cached, incoming)`** — Shared version comparison helper evaluating numeric `version`, sequence `__gen`, or `updatedAt` timestamps. Returns `true` only if `cached` is strictly newer than `incoming`.
- **`toCacheSnapshot(value, serializeFn?)`** — Shared serialization boundary extracting a pure, detached snapshot via `serializeFn`, `value.toJSON()`, or deep JSON cloning. Guarantees live aggregate references never leak into cache storage.
- **`ICommandRepository<TEntity, TResult>`** — Interface defining the contract `save(entity: TEntity): Promise<TResult | null>`.
- **`IWriteSideAggregateRepository<TEntity, TId = string>`** — Single-entity generic interface for write-side repositories extending `ICommandRepository<TEntity, unknown>`, defining `findById(id: TId): Promise<TEntity | null>`. Guarantees command handlers load rehydrated domain aggregates directly from authoritative persistence (`{ refresh: true }`) without leaking snapshot types or ORM clients into handlers.
- **`MikroOrmWriteSideCommandRepository<TSnapshot, TEntity, TResult>`** — Abstract MikroORM base class that implements it: `findById()` reads with `{ refresh: true }`, never touches the cache, rehydrates through the `hydrateFn` passed to the constructor, and translates failures with `mapPersistenceError`. It takes an **`IEntityManagerSource`** (`{ readonly em: EntityManager }`) and reads `em` on every call, so a multi-tenant store can return the current tenant's manager. Subclasses add the decorated `save()`.
- **`CacheMutationBarrier`** — Sentinel record (`{ __cacheBarrier: true, token: string, reason: 'deleted' | 'invalidated', createdAt: number }`) installed in cache during mutations with a finite `barrierTtl` (60 seconds by default) to prevent concurrent in-flight queries from repopulating the cache with stale/resurrected state.
- **`createCacheMutationBarrier(reason, entity?)`** / **`isCacheMutationBarrier(value)`** — Helper factory and type guard for mutation barriers.
- **`CommandRepository<TEntity, TResult, TCache>`** — Abstract base for write repositories. Injects an `ICache` instance; concrete classes implement `save(entity: TEntity)`.
- **`QueryRepository<TQuery, TResult>`** — Abstract base for read repositories. Injects an `ICache` instance and an optional `QueryRepositoryHydration` policy (`{ hydrateFn, serializeFn? }`) that `@FromCache` applies to methods declaring neither; concrete classes implement `find(query)`.
- **Cache ownership contract** — `@Cache` and `@FromCache` read the repository's `cache` property (and `@FromCache` its `hydration`). Both bases declare them. A repository whose `cache` is unset is intentionally uncached: writes and reads pass through without cache work. A decorated repository with no `cache` property at all is miswired; it also passes through, and a warning is logged once per repository class. A `save()` that resolves `null` or `undefined` is treated as a deletion and evicts `deleteKeys`.
- **`@Cache()`** — Method decorator for `save()` in command repositories:
  - **CAS-Safe Write-Through**: Automatically converts the returned result to a snapshot via `toCacheSnapshot()` and writes to cache using `isCacheNewer` CAS comparator to prevent late-finishing writes from overwriting newer cache entries.
  - **Anti-Resurrection Eviction**: Installs a `CacheMutationBarrier` sentinel with the configured `barrierTtl` for keys derived by `deleteKeys` when `save()` yields `null` or `undefined` (e.g. on entity deletion).
  - **Secondary Invalidation**: Installs a `CacheMutationBarrier` sentinel with the configured `barrierTtl` for auxiliary keys derived by `invalidateKeys` on successful writes before setting new values.
  - **Best-Effort**: Cache write/delete errors are caught and swallowed so a committed database transaction is never converted into an application error.
- **`@FromCache()`** — Method decorator for `find()` in query repositories:
  - **Read-Through**: Checks the cache first via `keyFn`; every hit is rehydrated whenever a hydrator applies, so hits and misses return the same type regardless of `query.hydrate`.
  - **Hydration Precedence**: A method that declares `hydrateFn` (including `null`, which opts out) uses its own; otherwise the repository's `hydrateFn` applies. `serializeFn` follows the same rule.
  - **No Hydrator, Plain Data Only**: Without a hydrator a hit returns the cached data as is, so only plain-data results (primitives, arrays, plain objects) are cached. A class instance, or a result reshaped by `serializeFn`, is returned uncached and reported once.
  - **Revision-Fenced Fills**: Requires an adapter implementing `IVersionedCache`. The decorator observes the key's opaque revision before the database read and fills with `tryFill(key, observedRevision, snapshot)`, which commits only if nothing — an invalidation, a delete, a newer write — has advanced the revision in between. A stale snapshot therefore cannot overwrite a deletion barrier. A rejected fill re-reads the key, returns a strictly newer snapshot when one is present, and otherwise retries a bounded number of times before returning the database result uncached.
  - **Unversioned Adapters Are Bypassed**: An adapter exposing only `get`/`set`/`delete` cannot fence a fill against concurrent invalidation, so `@FromCache` uses neither side of it: no read, no fill, the query goes to the database. Reads are bypassed too because serving entries while skipping fills would still return values written before a mutation. The decorator logs this once per adapter instance. Implement `IVersionedCache` to enable caching; `MemoryCache` and `MikroOrmCache` both do.
  - **Barriers and Nulls Are Misses**: A `CacheMutationBarrier` or a stored `null` is never hydrated — neither is a snapshot this decorator would have written.
  - **Enforceable Invariants**: Validates at decoration time that `alwaysHydrate: true` requires a `hydrateFn`, throwing `TypeError` immediately if omitted. The flag does not otherwise change results.
  - **Snapshot Storage Contract**: Stores strictly detached, serializable snapshots (`TSnapshot`), extracting them on cache miss via custom `serializeFn` or `toCacheSnapshot()`. Never caches live aggregate instances.
  - **Strong Consistency on Concurrent Writes**: If a concurrent command writes and caches a newer snapshot during an in-flight DB fetch, `@FromCache` compares snapshots (`newerCheck(current, snapshot)`) and returns the fresher cached snapshot (rehydrated when a hydrator applies) rather than stale DB data or overwriting cache.
  - **Bounded Negative Cache**: Stores **only non-nullish** results to prevent negative caching of uncreated records.
  - **Fail-Closed**: Cache errors propagate to enforce strong consistency at the query boundary.
- **`@PersistedWrite(options)`** — Composite method decorator for `save(aggregate)`: applies `@Cache(options.cache)` → `@AcknowledgePersisted` → `@MapPersistenceErrors({ unique, otherwise })` in canonical order with the first argument as the entity. `cache` is optional. Use the individual decorators for other signatures, for deletes (which do not acknowledge), or for caller-owned ordering; `biome/plugins/persistence-lifecycle.grit` rejects combining both forms on one method.
- **`@AcknowledgePersisted()`** — Method decorator for `save()` in command repositories: captures the aggregate's current entry version before write execution and automatically calls `entity.acknowledgePersisted(version)` upon successful persistence.
- **`@MapPersistenceErrors()`** — Method decorator for persistence operations: maps identifiable database driver unique constraint failures (PostgreSQL `23505` and SQLite unique constraints) to application-owned domain exceptions.
- **`mapPersistenceError(error, operation)`** — The canonical `otherwise` translator for `@MapPersistenceErrors` and `@PersistedWrite`, also usable in a plain `catch`: returns a `TransientOperationError` (with the original as `cause`) for a retryable failure, and any other error unchanged, so deliberate domain errors keep their identity. Retry policies then depend on `TransientOperationError`, never on driver codes.
- **`isTransientPersistenceError(error)`** — The classifier behind it, for persistence adapters only: retryable PostgreSQL SQLSTATEs (serialization failure, deadlock, lock not available, shutdown, and the `08` and `53` classes), Node network errors, `SQLITE_BUSY`/`SQLITE_LOCKED`, and errors named `TaskCancelledError` or `TimeoutError`, searched through the `cause` chain. Keep it in persistence adapters: application handlers depend on `TransientOperationError` instead.
- **`optimisticUpdate()`** — Infrastructure helper for MikroORM version-conditioned updates (`WHERE id = ? AND version = expectedVersion`). Inspects affected rows, performs diagnostic existence checks on zero affected rows, and raises `EntityNotFoundException` or `ConcurrencyConflictError`. Explicitly rejects execution inside active outer transactions.
- **`optimisticDelete()`** — The delete counterpart, on `{ id, version: getExpectedVersion() }`, with the same affected-row contract and the same autocommit requirement. Unversioned rows (sessions, tokens) are out of scope: delete those by primary key rather than inventing a version column.
- **`assertAutocommit()`** — The single transaction-boundary check shared by the update, delete and create paths. Every write whose successful return triggers acknowledgment or cache maintenance calls it before issuing a statement.

### HTTP Status Mapping

- **`domainErrorHttpStatus(error)`** (`/http`) — Maps this package's errors to `{ statusCode, error, message }` as plain values, for any HTTP framework: 409 `ConcurrencyConflictError`, 404 `EntityNotFoundException`, 500 `MissingTenantContextError` with a generic message (its own message is for developers), 400 for any other `DomainException`. It returns `undefined` for anything that is not a `DomainException`. Map the application's own exceptions first, then pass the rest to it.

---

## Installation

This package is a workspace dependency:

```json
{
  "dependencies": {
    "@nestjs-pipeline/ddd-core": "workspace:*"
  }
}
```

---

## Usage Guide & Practical Examples

### 1. Defining a Domain Entity with Invariants and RootEntity

Domain aggregates extend `RootEntity` (which extends domain `AggregateRoot`). They record uncommitted domain events via `this.apply(event)`, manage optimistic locking versions (`this.version`, `this.getExpectedVersion()`), and enforce business rules through framework-agnostic `DomainException`s:

```typescript
import {
  ApplyMutation,
  DomainException,
  Mutable,
  RootEntity,
  type RootEntitySnapshot,
} from '@nestjs-pipeline/ddd-core/domain';
import { UserCreatedEvent } from './user-created.event';
import { UserRenamedEvent } from './user-renamed.event';

export class InvalidUsernameException extends DomainException {
  readonly minLength: number;
  readonly actualValue: string;

  constructor(actualValue: string, minLength = 3) {
    super(`Username must be at least ${minLength} characters, received: "${actualValue}".`);
    this.minLength = minLength;
    this.actualValue = actualValue;
  }
}

export interface UserSnapshot extends Partial<RootEntitySnapshot> {
  readonly username: string;
  readonly email: string;
  readonly department?: string | null;
  readonly version?: number;
}

export class User extends RootEntity<UserSnapshot> {
  @Mutable<string>({ normalize: (val) => User.validateUsername(val) })
  private _username: string;
  readonly email: string;
  private _department?: string | null;

  private constructor(snapshot: UserSnapshot) {
    super(snapshot);
    this._username = User.validateUsername(snapshot.username);
    this.email = snapshot.email;
    this._department = snapshot.department ?? null;
  }

  // Factory recording the creation event internally
  static create(username: string, email: string, department?: string | null): User {
    const user = new User({ username, email, department });
    user.apply(new UserCreatedEvent(user));
    return user;
  }

  static fromJSON(snapshot: UserSnapshot): User {
    return new User(snapshot);
  }

  private static validateUsername(value?: string): string {
    const trimmed = (value ?? '').trim();
    if (trimmed.length < 3) {
      throw new InvalidUsernameException(trimmed);
    }
    return trimmed;
  }

  get username(): string {
    return this._username;
  }

  /** @internal @deprecated MikroORM hydration setter only */
  set username(val: string) {
    this._username = User.validateUsername(val);
  }

  get department(): string | null | undefined {
    return this._department;
  }

  /** @internal @deprecated MikroORM hydration setter only */
  set department(val: string | null | undefined) {
    this._department = val?.trim() || null;
  }

  @ApplyMutation<User>({ event: (user) => new UserRenamedEvent(user) })
  rename(newUsername: string): this {
    this.applyPatch({ username: newUsername });
    return this;
  }

  toJSON(): RootEntitySnapshot & UserSnapshot {
    return this.freezeState({
      id: this.id,
      username: this.username,
      email: this.email,
      department: this.department,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this._version,
    });
  }
}
```

---

### 2. Defining Domain Events with Detached Payloads

Domain events extend `RootDomainEvent<TEntity, TPayload>` (which implements `IEvent`). They carry a unique UUID v7 identifier, event-time aggregate identity and version (`aggregateId`, `aggregateVersion`), and a deeply cloned, recursively frozen state snapshot (`event.payload`) created via `deepCloneAndFreeze()`.

Consumers reading `event.payload` observe the captured snapshot despite later
aggregate mutations. The originating aggregate is not retained or frozen.
Use `payload`, `aggregateId`, and `aggregateVersion` when consuming events.
Constructors accept the aggregate. Snapshot isolation does not make in-memory
EventBus delivery durable.

What the snapshot guarantees:

- **Detachment** — the payload is a deep clone; mutating the aggregate or the
  object passed to the constructor never changes it.
- **Ordinary read-only access** — own properties are frozen, and the mutating
  methods of cloned `Date`, `Map` and `Set` values throw.
- **Not a security boundary** — `Object.freeze` does not cover built-in
  internal state, so `Date.prototype.setTime.call(payload.at, 0)` or
  `Map.prototype.set.call(payload.map, …)` still changes the shared payload.
  Every consumer of one event sees the same `payload` instance.
- **Per-consumer isolation on request** — `event.clonePayload()` returns a new
  detached, frozen copy on every call. Use it when one consumer must not
  observe what another did to its copy.
- **Transport** — send an explicit, serializable message built from the fields
  you need (as users-api does with its job DTOs) rather than the payload object.


```typescript
import { RootDomainEvent } from '@nestjs-pipeline/ddd-core/domain';
import { User, type UserSnapshot } from './user.entity';

export class UserCreatedEvent extends RootDomainEvent<User, UserSnapshot> {
  constructor(entity: User) {
    // Automatically invokes entity.toJSON() and deeply freezes the resulting snapshot into this.payload
    super(entity);
  }
}

export class UserRenamedEvent extends RootDomainEvent<User, UserSnapshot> {
  constructor(entity: User) {
    super(entity);
  }
}
```

Asynchronous consumers consume `event.payload` safely:

```typescript
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { UserCreatedEvent } from './user-created.event';

@EventsHandler(UserCreatedEvent)
export class SendWelcomeEmailHandler implements IEventHandler<UserCreatedEvent> {
  async handle(event: UserCreatedEvent): Promise<void> {
    // event.payload is a detached, frozen snapshot shared by all consumers
    const { id, username, email } = event.payload;
    // Asynchronous notification or projection logic...
  }
}
```

---

### 3. CQRS Command Handler with `CommandBaseHandler`

Use the compiled sample handlers as the canonical examples:

- [CreateUserHandler](../users-api/src/users/cqrs/commands/create-user.handler.ts)
  injects an application repository port, authorizes the aggregate, persists it,
  and returns it. `CommandBaseHandler.execute()` publishes buffered events.
- [UpdateUserHandler](../users-api/src/users/cqrs/commands/update-user.handler.ts)
  loads through `IWriteSideAggregateRepository.findById()`, authorizes the real
  aggregate, and mutates it through its domain method.

`handle()` returns either the aggregate or an application result containing it,
for example `{ aggregate: user, success: true }`. `execute()` returns that result
unchanged and publishes buffered events once after successful handling. A rejected
`handle()` does not publish events. If the publisher's `publishAll()` throws
synchronously, the error propagates and the aggregate's buffered events remain
uncleared.

The sample passes the in-memory Nest `EventBus` as the publisher. Persistence and
event delivery are not atomic; durable delivery requires an explicit outbox
architecture.

Do not publish events manually or put response/session mapping in these handlers.

### 4. Write-Side Command Repositories with Lifecycle Decorators

Creates and updates declare the whole lifecycle with `@PersistedWrite`, which
applies `@Cache(...)` → `@AcknowledgePersisted(...)` →
`@MapPersistenceErrors(...)` in that order:

```typescript
@PersistedWrite<User>({
  cache: {
    setKey: (user) => filterCacheKey(User.aggregateName, { id: user.id }),
    invalidateKeys: (user) => [
      filterCacheKey(User.aggregateName, { email: user.email }),
    ],
  },
  unique: [
    {
      constraint: 'users_email_unique',
      columns: 'users.email',
      error: (user) => new UniqueEmailException(user),
    },
  ],
})
async save(user: User): Promise<UserSnapshot> { ... }
```

A rejected write translates known constraint errors, leaves the persisted
version baseline unchanged and performs no cache maintenance; a resolved write
acknowledges first, then maintains the cache best-effort. `@PersistedWrite`
adds no transaction or event-delivery guarantee. Deletes do not acknowledge,
so they stack `@Cache` and `@MapPersistenceErrors` individually.

- [Creation repository](../users-api/src/users/persistence/create-user.command-repository.ts)
- [Update repository](../users-api/src/users/persistence/update-user.command-repository.ts)
- [Deletion repository](../users-api/src/users/persistence/delete-user.command-repository.ts)

These source examples compile with the application build. Updates use
`optimisticUpdate` and deletes use `optimisticDelete`; both condition on ID and
expected version and distinguish missing records from concurrency conflicts.
Successful write resolution must mean durable persistence before acknowledgment
and cache maintenance run.

### 5. Read-Side Query Repository with `@FromCache()`

[GetUserQueryRepository](../users-api/src/users/persistence/get-user.query-repository.ts)
returns `Promise<User | null>` and passes `{ hydrateFn: User.fromJSON }` to the
`QueryRepository` constructor, so every cache hit is rehydrated; its
`@FromCache` declares only the key. A method needing different treatment
declares its own `hydrateFn`/`alwaysHydrate` (or `hydrateFn: null`). The cache
stores detached serializable snapshots, not aggregates.
[GetUserHandler](../users-api/src/users/cqrs/queries/get-user.handler.ts) authorizes
and filters the loaded aggregate before returning a response.

Cache mutation barriers protect against stale in-flight reads while retained.
`@Cache` uses a finite `barrierTtl` (60 seconds by default); size it above the
maximum in-flight read duration. This is a bounded race-protection window, not
an indefinite tombstone or a durable consistency protocol.

## Tenant-scoped cache keys

`filterCacheKey(resource, conditions, tenant?)` and `cacheKeyTemplate(template, tenant?)`
namespace every key by tenant. The tenant comes from, in order:

1. the explicit `tenant` argument (`CacheKeyTenantSource`): a tenant id string, or an
   object carrying `tenantId`, such as a pipeline context;
2. for `cacheKeyTemplate`, a context source's `tenantId`;
3. the running tenant scope, set with `runWithTenant(tenantId, fn)` from
   `@nestjs-pipeline/ddd-core/application`, which is Node's `AsyncLocalStorage` and needs
   no framework.

Set the scope once where a unit of work enters the application: an HTTP request, a queue
job, or a command dispatch. The examples above then need no tenant argument. In a NestJS
pipeline application, one global pipeline behavior does it:

```typescript
@Injectable()
export class TenantScopeBehavior implements IPipelineBehavior {
  handle(context: IPipelineContext, next: NextDelegate) {
    return runWithTenant(context.tenantId, next);
  }
}
```

There is no shared namespace: a missing or empty tenant throws
`MissingTenantContextError`. A single-tenant deployment passes a fixed id or runs inside
`runWithTenant('single', ...)`.

The same resolution is public as `requireTenantId(source, purpose)` from `/application`,
for any other key that must be partitioned by tenant, such as an idempotency or
rate-limit key. `source` is a `TenantSource` (`CacheKeyTenantSource` is the same type).
Map `MissingTenantContextError` to HTTP 500: a request without a tenant is server
misconfiguration, never the caller's fault.

`filterCacheKey` keys have the form `${tenant}:${resource}:v1:${sha256}`, hashed over a
key-sorted serialization of `[tenant, resource, conditions]`. That output is frozen, so
existing cache entries stay addressable across releases.

## Cache Implementations & Options

`@nestjs-pipeline/ddd-core` defines the `ICache<T>` interface and `CacheSetOptions`:

```typescript
export interface CacheSetOptions {
  ttl?: number;
  /** Atomic stale-write check: returns true if incoming data should overwrite cached data. */
  /** Stale-write check: true means cached data is newer and the incoming value must be skipped. */
  isNewer?: (cached: unknown, incoming: unknown) => boolean;
}

export interface ICache<T = unknown> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T, options?: CacheSetOptions): Promise<void>;
  delete(key: string): Promise<void>;
}
```

Two implementations of `IVersionedCache` exist:
- **`MemoryCache`** (bundled): Lightweight in-process `Map` cache with TTL and atomic `isNewer` protection, suitable for unit tests and local development.
- **`MikroOrmCache`**: Database-backed `IVersionedCache`, one row per key (`CacheEntry`): the JSON payload, an epoch-millisecond expiry and a revision token that fences concurrent fills. Every write is a compare-and-set in its own transaction, reads bypass the identity map, and `set()` supports atomic `isNewer` comparison against the stored value.
  - `new MikroOrmCache(store, { defaultTtlMs?, logger? })`, where `store` is an `ITransactionalEntityManagerSource`: an `em`, plus `transactional(work)` that runs `work` on a manager dedicated to that call (`em.fork().transactional(work)` qualifies). No framework is needed; in NestJS, register it with a `useFactory` provider.
  - Register `CacheEntrySchema` with the ORM, or `createCacheEntrySchema(table)` for another table name (validated). `expires_at` is a `bigint` column.
  - Create the table once, in a migration, with `createCacheTableSql(table?)` (PostgreSQL and SQLite): the columns the schema maps plus an index on `expires_at`.

A custom adapter that implements only `ICache` still works with `@Cache`, but
`@FromCache` bypasses it entirely, as described above. That is a deliberate
fail-safe, not a degraded mode: implement `readState`, `invalidate` and `tryFill`
to get read-through caching.

The revision fence coordinates the cache with itself, not with the database. A
committed write followed by an unavailable cache — invalidation that fails or
never runs — leaves the previous entry until it expires, and per-key
compare-and-set cannot remove that dual-write window. Cache maintenance after a
commit is best-effort; size TTLs to the staleness the use case tolerates, and read
with `{ refresh: true }` where a decision must not rest on a cached value.

---

## Dependencies

- No runtime dependencies, and no NestJS or `@nestjs-pipeline/*` package in any
  form.
- `@mikro-orm/core` is the only peer, and it is optional. `/persistence` and the
  root barrel load it at runtime, because they export `UnixTimestampType`, which
  extends MikroORM's `Type`. Import `@nestjs-pipeline/ddd-core/domain` or
  `/application` to run without it.


## Decorated versioned updates

Reusable persistence decorators and the MikroORM update helper are exported from
`@nestjs-pipeline/ddd-core`. Concrete repositories retain their own `save()` logic:

```ts
import { AcknowledgePersisted, Cache, MapPersistenceErrors, PersistedWrite, optimisticUpdate } from '@nestjs-pipeline/ddd-core/persistence';
```

`@PersistedWrite({ cache, unique, otherwise })` applies the three decorators
below with the first argument as the aggregate. When stacking them
individually, apply them in this order (outermost first):

1. `@Cache(...)`: best-effort cache maintenance after acknowledgment.
2. `@AcknowledgePersisted({ entity: ([aggregate]) => aggregate })`: explicitly
   select the aggregate from the arguments, capture its entry version, and
   acknowledge that version only after the wrapped method succeeds.
3. `@MapPersistenceErrors({ entity, unique: [...] })`: translate identified
   constraint failures from the persistence operation. Each unique mapping
   supplies a PostgreSQL constraint name, SQLite column identity, and an
   application-owned error factory. Unidentified failures retain their identity.

`optimisticUpdate(em, entityType, aggregate, data, entityName)` constructs one
version-conditional update, verifies the affected row count, and raises
`EntityNotFoundException` or framework-neutral `ConcurrencyConflictError` when appropriate.
It remains an explicit helper because it executes SQL, rather than wrapping
arbitrary repository logic. It does not cache, acknowledge, or publish events.
This helper is MikroORM-specific infrastructure within this framework-neutral
package; the decorators do not depend on application models or configuration.

The acknowledgment decorator requires that the method write the entry version
and that successful resolution mean committed persistence. Capture the return
snapshot before awaiting the helper.

Every path whose successful return is treated as durable enforces the same
boundary through `assertAutocommit(em, operation)`: `optimisticUpdate`,
`optimisticDelete`, and the create repositories before their flush or upsert. The
check runs before any statement, so a rejected operation mutates nothing, leaves
the aggregate's persisted baseline where it was, and evicts nothing from the
cache. Supporting outer transactions requires commit hooks for acknowledgment and
cache maintenance; decorators alone cannot make several writes atomic, and a
caller must not be able to trigger acknowledgment merely by flushing uncommitted
work. Event publication remains with `CommandBaseHandler`.

See the [role repository](../users-api/src/roles/persistence/update-role.command-repository.ts)
and [user repository](../users-api/src/users/persistence/update-user.command-repository.ts)
for concrete examples. Constraint names, writable fields, cache keys, and domain
error factories belong to the application, not these shared mechanisms.


### Persistence contracts and tests

The decorators use explicit `entity` selectors over the argument tuple. They
preserve the method receiver, arguments, result, and unrelated failure identity.
`AcknowledgePersisted` captures the version before invoking the method, waits for
its returned promise, and acknowledges once on success. It does not acknowledge
on a rejected write. Concurrent calls on different aggregates do not share state;
concurrent writes of the same aggregate instance are not a supported transaction
or serialization mechanism.

`MapPersistenceErrors` translates only a configured, identifiable unique
constraint. It recognizes PostgreSQL code `23505` plus a matching constraint name,
or the preserved PostgreSQL/SQLite diagnostic text for that constraint. A generic
`SQLITE_CONSTRAINT_UNIQUE` without column identity is insufficient. Its mapping
factory receives the selected aggregate; all unmatched failures are rethrown
unchanged. Diagnostic-text matching is a driver compatibility seam, covered by
unit tests and actual libSQL tests in users-api.

`optimisticUpdate` uses `getExpectedVersion()` in the WHERE clause and the current
aggregate version in SET (overriding any version supplied in `data`). It never
mutates `data` or acknowledges the aggregate. One affected row means success;
zero triggers a refreshed existence check to distinguish not-found from version
conflict. Unexpected row counts and driver/read failures reject the operation.
The follow-up existence read is diagnostic and is not an atomic observation with
the failed update. No HTTP exceptions, cache behavior, or events are introduced.

Run `pnpm --filter @nestjs-pipeline/ddd-core test` for shared unit tests, including:

- `acknowledge-persisted.decorator.spec.ts`: argument selection, receiver/result
  preservation, pending operations, overlapping calls, and failure behavior.
- `map-persistence-errors.decorator.spec.ts`: configured constraint selection,
  error identity, ambiguous/prefix/composite constraint rejection, and success.
- `optimistic-update.spec.ts`: version predicates, row-count outcomes, driver
  failures, captured identity, and transaction rejection.
- `biome-persistence-plugin.spec.ts`: invokes the real Biome CLI in temporary
  fixtures using the root plugin registration; validates positive and negative
  cases rather than duplicating the rule logic in TypeScript.
- `biome-general-plugins.spec.ts`: validates package license boundaries, standalone
  package isolation from application modules, and prevention of committed focused tests (`.only`).

The application libSQL tests ([role](../users-api/test/role-update-lifecycle.spec.ts)
and [user](../users-api/test/user-update-lifecycle.spec.ts))
exercise actual ORM writes and real constraint diagnostics. Run users-api tests
with `pnpm --filter @nestjs-pipeline/ddd-users-api test`.

The lifecycle lint is implemented solely in the
[Grit plugin](../../biome/plugins/persistence-lifecycle.grit), configured by
`biome.json`. `pnpm lint:persistence` calls Biome directly. Its current pattern
uses canonical API names and the three-decorator order above; aliases are
rejected explicitly. The plugin is a structural guard, not transaction analysis.
Complementary plugins (`package-licenses.grit`, `verify-package-licenses.grit`,
`test-suite.grit`) enforce packaging and test isolation across the workspace.
