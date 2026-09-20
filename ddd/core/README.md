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

Private, Nest-oriented DDD support for the sample applications. Domain, application,
and MikroORM persistence entry points are provided separately; this is not a
framework-neutral or independently published domain library.

Internal users-api code imports domain primitives from `/domain`, application
ports and CQRS support from `/application`, and concrete adapters/decorators from
`/persistence`. The root export remains a compatibility convenience. Biome rejects
bare-root imports throughout users-api production code and persistence imports
from domain, CQRS, and application directories.

## Overview

This package provides the foundational building blocks for implementing a Clean Architecture / DDD domain and persistence layer:

### Domain Primitives

- **`AggregateRoot<EventBase>`** — Abstract base class representing a DDD aggregate root. Owns uncommitted event buffering (`this.apply(event)`), `getUncommittedEvents()`, `uncommit()`, and `loadFromHistory()`. Pure domain primitive completely decoupled from `@nestjs/*`.
- **`RootEntity<TSnapshot>`** — Abstract base aggregate entity extending domain `AggregateRoot`. Provides UUID v7 identity, detached `Date` reads for `createdAt`/`updatedAt` with public setters reserved for persistence hydration, accessor mappings (`id`, `createdAt`, `updatedAt`), optimistic concurrency version tracking (`version`, `getExpectedVersion()`), polymorphic snapshot rehydration via `RootEntity.from()` with strict aggregate type safety (throws `TypeError` on incompatible aggregates), and mutation tracking via `onUpdate()`.
- **`RootEntitySnapshot`** — Interface defining the serialized state contract (`id`, `createdAt`, `updatedAt`, and optional `version`).
- **`DomainException`** — Abstract base class for domain invariant failures. Pure TypeScript error class completely decoupled from HTTP status codes and framework decorators.
- **`DomainEvent`** — Abstract base class for domain events carrying a unique UUID v7 `id` and implementing `IEvent`.
- **`IEvent`** — Marker interface for domain events.
- **`RootDomainEvent<TEntity, TPayload>`** — Domain event carrying event-time `aggregateId`/`aggregateVersion` and an immutable, deeply cloned and frozen state snapshot (`event.payload`) created via `deepCloneAndFreeze()` to protect asynchronous event consumers from subsequent in-memory aggregate mutations.
- **`deepCloneAndFreeze<T>()`** — Deeply clones and recursively freezes any value (objects, arrays, `Date` with mutation guards, `Map`, `Set`, `RegExp`), safely handling circular references via a `WeakMap`.
- **`CommandBaseHandler<TCommand, TResult>`** — Abstract base handler for CQRS commands. Calls `handle()`, then publishes and clears buffered domain events from a returned `AggregateRoot` or result containing `aggregate: AggregateRoot`. Pipeline behaviors are applied by the pipeline integration; event publication is owned by `execute()`.
- **`@Mutable(options?)`** — Property decorator declaring an aggregate field as mutable via patch mutations, with optional backing property name and value normalizer.
- **`@ApplyMutation<TEntity>(options)`** — Method decorator coordinating aggregate state mutation and domain event application: receives a `MutationPatch`, updates `@Mutable` fields, invokes `onUpdate()` (advancing `version` and `updatedAt`), and constructs domain events (`options.event(entity)`) from the post-mutation snapshot. Pre-application checks (key validation, normalizers, callable lifecycle methods) fail safely before state modification; unexpected post-application failures propagate without automated rollback. The legacy `@Mutate()` decorator is completely removed in favor of `@ApplyMutation` to guarantee deterministic event ordering and payload consistency.
- **`UnixTimestampType`** — Custom MikroORM `Type<Date, number>` mapping JavaScript `Date` instances to Unix timestamps (ms) in 64-bit `bigint` SQL database columns (`platform.getBigIntTypeDeclarationSQL()`) to eliminate integer overflow.
- **`Method`** — Utility type for extracting method signatures.

### Persistence Abstractions

- **`ICache<T>`** — Interface for cache providers defining `get(key): Promise<T | undefined>`, `set(key, value, options?: CacheSetOptions): Promise<void>`, and `delete(key): Promise<void>`.
- **`CacheSetOptions`** — Options for cache writes: `ttl?: number` and atomic stale-write check `isNewer?: (cached: unknown, incoming: unknown) => boolean`.
- **`isCacheNewer(cached, incoming)`** — Shared version comparison helper evaluating numeric `version`, sequence `__gen`, or `updatedAt` timestamps. Returns `true` only if `cached` is strictly newer than `incoming`.
- **`toCacheSnapshot(value, serializeFn?)`** — Shared serialization boundary extracting a pure, detached snapshot via `serializeFn`, `value.toJSON()`, or deep JSON cloning. Guarantees live aggregate references never leak into cache storage.
- **`ICommandRepository<TEntity, TResult>`** — Interface defining the contract `save(entity: TEntity): Promise<TResult | null>`.
- **`IWriteSideAggregateRepository<TEntity, TId = string>`** — Single-entity generic interface for write-side repositories extending `ICommandRepository<TEntity, unknown>`, defining `findById(id: TId): Promise<TEntity | null>`. Guarantees command handlers load rehydrated domain aggregates directly from authoritative persistence (`{ refresh: true }`) without leaking snapshot types or ORM clients into handlers.
- **`CacheMutationBarrier`** — Sentinel record (`{ __cacheBarrier: true, token: string, reason: 'deleted' | 'invalidated', createdAt: number }`) installed in cache during mutations with a finite `barrierTtl` (60 seconds by default) to prevent concurrent in-flight queries from repopulating the cache with stale/resurrected state.
- **`createCacheMutationBarrier(reason, entity?)`** / **`isCacheMutationBarrier(value)`** — Helper factory and type guard for mutation barriers.
- **`CommandRepository<TEntity, TResult, TCache>`** — Abstract base for write repositories. Injects an `ICache` instance; concrete classes implement `save(entity: TEntity)`.
- **`QueryRepository<TQuery, TResult>`** — Abstract base for read repositories. Injects an `ICache` instance; concrete classes implement `find(query)`.
- **`@Cache()`** — Method decorator for `save()` in command repositories:
  - **CAS-Safe Write-Through**: Automatically converts the returned result to a snapshot via `toCacheSnapshot()` and writes to cache using `isCacheNewer` CAS comparator to prevent late-finishing writes from overwriting newer cache entries.
  - **Anti-Resurrection Eviction**: Installs a `CacheMutationBarrier` sentinel with the configured `barrierTtl` for keys derived by `deleteKeys` when `save()` yields `null` or `undefined` (e.g. on entity deletion).
  - **Secondary Invalidation**: Installs a `CacheMutationBarrier` sentinel with the configured `barrierTtl` for auxiliary keys derived by `invalidateKeys` on successful writes before setting new values.
  - **Best-Effort**: Cache write/delete errors are caught and swallowed so a committed database transaction is never converted into an application error.
- **`@FromCache()`** — Method decorator for `find()` in query repositories:
  - **Read-Through**: Checks the cache first via `keyFn`; on a cache hit returns the cached value (or automatically rehydrates it into a domain entity if `alwaysHydrate: true` or `query.hydrate` is enabled).
  - **Anti-Resurrection Coordination**: Coordinates pre- and post-DB barrier validation. When a mutation barrier is detected, it prevents caching stale DB results, verifies barrier token continuity (detecting ABA sequence mutations), and retries boundedly (`MAX_BARRIER_RETRIES = 2`) to reject stale reads while the mutation barrier is retained.
  - **Enforceable Invariants**: Validates at decoration time that `alwaysHydrate: true` requires a `hydrateFn`, throwing `TypeError` immediately if omitted.
  - **Snapshot Storage Contract**: Stores strictly detached, serializable snapshots (`TSnapshot`), extracting them on cache miss via custom `serializeFn` or `toCacheSnapshot()`. Never caches live aggregate instances.
  - **Strong Consistency on Concurrent Writes**: If a concurrent command writes and caches a newer snapshot during an in-flight DB fetch, `@FromCache` compares snapshots (`newerCheck(current, snapshot)`) and returns the fresher cached snapshot (rehydrated if requested) rather than stale DB data or overwriting cache.
  - **Bounded Negative Cache**: Stores **only non-nullish** results to prevent negative caching of uncreated records.
  - **Fail-Closed**: Cache errors propagate to enforce strong consistency at the query boundary.
- **`@AcknowledgePersisted()`** — Method decorator for `save()` in command repositories: captures the aggregate's current entry version before write execution and automatically calls `entity.acknowledgePersisted(version)` upon successful persistence.
- **`@MapPersistenceErrors()`** — Method decorator for persistence operations: maps identifiable database driver unique constraint failures (PostgreSQL `23505` and SQLite unique constraints) to application-owned domain exceptions.
- **`optimisticUpdate()`** — Infrastructure helper for MikroORM version-conditioned updates (`WHERE id = ? AND version = expectedVersion`). Inspects affected rows, performs diagnostic existence checks on zero affected rows, and raises `EntityNotFoundException` or `ConcurrencyConflictError`. Explicitly rejects execution inside active outer transactions.

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
  type MutationPatch,
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
  protected applyRename(newUsername: string): MutationPatch<User> {
    return { username: newUsername };
  }

  rename(newUsername: string): this {
    this.applyRename(newUsername);
    return this;
  }

  afterUpdate(): void {
    // Optional hook executed immediately after onUpdate()
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

### 2. Defining Domain Events with Immutable Payloads

Domain events extend `RootDomainEvent<TEntity, TPayload>` (which implements `IEvent`). They carry a unique UUID v7 identifier, event-time aggregate identity and version (`aggregateId`, `aggregateVersion`), and a deeply cloned, recursively frozen state snapshot (`event.payload`) created via `deepCloneAndFreeze()`.

Consumers reading `event.payload` observe the captured snapshot despite later
aggregate mutations. The originating aggregate is not retained or frozen.
Use `payload`, `aggregateId`, and `aggregateVersion` when consuming events.
Constructors accept the aggregate. Snapshot isolation does not make in-memory
EventBus delivery durable:

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
    // event.payload is an immutable, frozen snapshot
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
`handle()` does not publish events. If `EventBus.publishAll()` throws synchronously,
the error propagates and the aggregate's buffered events remain uncleared.

Publication uses the in-memory Nest EventBus. Persistence and event delivery are
not atomic; durable delivery requires an explicit outbox architecture.

Do not publish events manually or put response/session mapping in these handlers.

### 4. Write-Side Command Repositories with Lifecycle Decorators

The canonical outermost-to-innermost order is `@Cache(...)` →
`@AcknowledgePersisted(...)` → `@MapPersistenceErrors(...)`:

- [Creation repository](../users-api/src/users/persistence/create-user.command-repository.ts)
- [Update repository](../users-api/src/users/persistence/update-user.command-repository.ts)
- [Deletion repository](../users-api/src/users/persistence/delete-user.command-repository.ts)

These source examples compile with the application build. Updates use
`optimisticUpdate`; deletes condition on ID and expected version and distinguish
missing records from concurrency conflicts. Successful write resolution must
mean durable persistence before acknowledgment and cache maintenance run.

### 5. Read-Side Query Repository with `@FromCache()`

[GetUserQueryRepository](../users-api/src/users/persistence/get-user.query-repository.ts)
returns `Promise<User | null>` and configures `alwaysHydrate: true` with a
`hydrateFn`. Its cache stores detached serializable snapshots, not aggregates.
[GetUserHandler](../users-api/src/users/cqrs/queries/get-user.handler.ts) authorizes
and filters the loaded aggregate before returning a response.

Cache mutation barriers protect against stale in-flight reads while retained.
`@Cache` uses a finite `barrierTtl` (60 seconds by default); size it above the
maximum in-flight read duration. This is a bounded race-protection window, not
an indefinite tombstone or a durable consistency protocol.

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

The sample uses two cache implementations:
- **`MikroOrmCache`**: Database-backed cache entity (`CacheEntry`) storing JSON payloads and Unix expiration timestamps, supporting atomic `isNewer` comparison against existing records.
- **`MemoryCache`**: Lightweight in-process `Map` cache with TTL and atomic `isNewer` protection, suitable for unit tests and local development.

---

## Peer Dependencies

- `@nestjs-pipeline/core` (workspace)
- `@mikro-orm/core` is an optional peer required by persistence helpers and `UnixTimestampType`.
  Import `@nestjs-pipeline/ddd-core/domain` or `/application` to avoid loading
  the persistence entry point; the root barrel also exports persistence.


## Decorated versioned updates

Reusable persistence decorators and the MikroORM update helper are exported from
`@nestjs-pipeline/ddd-core`. Concrete repositories retain their own `save()` logic:

```ts
import { AcknowledgePersisted, Cache, MapPersistenceErrors, optimisticUpdate } from '@nestjs-pipeline/ddd-core/persistence';
```

Apply decorators in this order (outermost first):

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
This helper is MikroORM-specific infrastructure within this Nest-oriented support
package; the decorators do not depend on application models or configuration.

The acknowledgment decorator requires that the method write the entry version
and that successful resolution mean committed persistence. Capture the return
snapshot before awaiting the helper. `optimisticUpdate` rejects an active outer
transaction before writing. Supporting outer transactions requires commit hooks
for acknowledgment and cache maintenance; decorators alone cannot make several
writes atomic. Event publication remains with `CommandBaseHandler`.

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
