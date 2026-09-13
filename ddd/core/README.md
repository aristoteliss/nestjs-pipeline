# @nestjs-pipeline/ddd-core

Reusable Domain-Driven Design primitives for NestJS applications using `@nestjs-pipeline`.

## Overview

This package provides the foundational building blocks for implementing a Clean Architecture / DDD domain and persistence layer:

### Domain Primitives

- **`RootEntity<TSnapshot>`** — Abstract base aggregate entity extending `@nestjs/cqrs` `AggregateRoot`. Provides internal uncommitted domain event management (`this.apply(event)`), UUID v7 identity, immutable `createdAt`/`updatedAt` timestamps, accessor mappings (`id`, `createdAt`, `updatedAt`), optimistic concurrency version tracking (`version`, `getExpectedVersion()`), polymorphic snapshot rehydration via `RootEntity.from()` with strict aggregate type safety (throws `TypeError` on incompatible aggregates), and mutation tracking via `onUpdate()`.
- **`RootEntitySnapshot`** — Interface defining the serialized state contract (`id`, `createdAt`, `updatedAt`, and optional `version`).
- **`DomainException`** — Abstract base class for domain invariant failures. Pure TypeScript error class completely decoupled from HTTP status codes and framework decorators.
- **`DomainEvent`** — Abstract base class for domain events carrying a unique UUID v7 `id` and implementing `@nestjs/cqrs` `IEvent`.
- **`RootDomainEvent<TEntity, TPayload>`** — Domain event carrying a typed reference to the originating entity (`event.entity`) and an immutable, deeply cloned and frozen state snapshot (`event.payload`) created via `deepCloneAndFreeze()` to protect asynchronous event consumers from subsequent in-memory aggregate mutations.
- **`deepCloneAndFreeze<T>()`** — Deeply clones and recursively freezes any value (objects, arrays, `Date` with mutation guards, `Map`, `Set`, `RegExp`), safely handling circular references via a `WeakMap`.
- **`CommandBaseHandler<TCommand, TResult>`** — Abstract base handler for CQRS commands. Executes the `@UsePipeline` chain, and automatically dispatches uncommitted domain events via `this.eventBus.publishAll()` and clears them when an `AggregateRoot` is returned from `handle()`. Command handlers return aggregates so event publication is never performed manually.
- **`@Mutate()`** — Method decorator that automatically triggers `onUpdate()` after the decorated method executes, incrementing `version` and updating `updatedAt`.
- **`UnixTimestampType`** — Custom MikroORM `Type<Date, number>` mapping JavaScript `Date` instances to Unix timestamps (ms) in 64-bit `bigint` SQL database columns (`platform.getBigIntTypeDeclarationSQL()`) to eliminate integer overflow.
- **`Method`** — Utility type for extracting method signatures.

### Persistence Abstractions

- **`ICache<T>`** — Interface for cache providers defining `get(key): Promise<T | undefined>`, `set(key, value, options?: CacheSetOptions): Promise<void>`, and `delete(key): Promise<void>`.
- **`CacheSetOptions`** — Options for cache writes: `ttl?: number` and atomic stale-write check `isNewer?: (cached: unknown, incoming: unknown) => boolean`.
- **`ICommandRepository<TEntity, TResult>`** — Interface defining the contract `save(entity: TEntity): Promise<TResult | null>`.
- **`CommandRepository<TEntity, TResult, TCache>`** — Abstract base for write repositories. Injects an `ICache` instance; concrete classes implement `save(entity: TEntity)`.
- **`QueryRepository<TQuery, TResult>`** — Abstract base for read repositories. Injects an `ICache` instance; concrete classes implement `find(query)`.
- **`@Cache()`** — Method decorator for `save()` in command repositories:
  - **Write-Through**: Automatically caches the returned result under the key derived by `setKeyFn` (operating directly on `entity: TEntity`).
  - **Eviction**: Evicts keys derived by `deleteKeysFn` when `save()` yields `null` or `undefined` (e.g. on entity deletion).
  - **Secondary Invalidation**: Evicts auxiliary keys derived by `invalidateKeysFn` on successful writes before setting new values.
  - **Best-Effort**: Cache write/delete errors are caught and swallowed so a committed database transaction is never converted into an application error.
- **`@FromCache()`** — Method decorator for `find()` in query repositories:
  - **Read-Through**: Checks the cache first via `keyFn`; on a cache hit returns the cached value (or automatically rehydrates it into a domain entity if `alwaysHydrate: true` or `query.hydrate` is enabled).
  - **Snapshot Storage Contract**: Stores strictly detached, serializable snapshots (`TSnapshot`), extracting them on cache miss via custom `serializeFn` or automatic `result.toJSON()`. Never caches live aggregate instances.
  - **Bounded Negative Cache**: Stores **only non-nullish** results to prevent negative caching of uncreated records.
  - **Fail-Closed**: Cache errors propagate to enforce strong consistency at the query boundary.
- **`@AcknowledgePersisted()`** — Method decorator for `save()` in command repositories: captures the aggregate's expected version before write execution and automatically calls `entity.acknowledgePersisted(version)` upon successful persistence.
- **`@MapPersistenceErrors()`** — Method decorator for persistence operations: maps identifiable database driver unique constraint failures (PostgreSQL `23505` and SQLite unique constraints) to application-owned domain exceptions.
- **`optimisticUpdate()`** — Infrastructure helper for MikroORM version-conditioned updates (`WHERE id = ? AND version = expectedVersion`). Inspects affected rows, performs diagnostic existence checks on zero affected rows, and raises `EntityNotFoundException` or `OptimisticLockError`. Explicitly rejects execution inside active outer transactions.

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

Domain aggregates extend `RootEntity` (which extends `@nestjs/cqrs` `AggregateRoot`). They record uncommitted domain events via `this.apply(event)`, manage optimistic locking versions (`this.version`, `this.getExpectedVersion()`), and enforce business rules through framework-agnostic `DomainException`s:

```typescript
import { RootEntity, Mutate, type RootEntitySnapshot, DomainException } from '@nestjs-pipeline/ddd-core';
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
  set username(val: string) {
    this._username = User.validateUsername(val);
  }

  get department(): string | null | undefined {
    return this._department;
  }
  set department(val: string | null | undefined) {
    this._department = val?.trim() || null;
  }

  @Mutate()
  rename(newUsername: string): this {
    this.username = newUsername;
    this.apply(new UserRenamedEvent(this));
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

Domain events extend `RootDomainEvent<TEntity, TPayload>` (which implements `@nestjs/cqrs` `IEvent`). They carry a unique UUID v7 identifier, a typed reference to the originating aggregate (`event.entity`), and a deeply cloned, recursively frozen state snapshot (`event.payload`) created via `deepCloneAndFreeze()`.

This ensures asynchronous event handlers never suffer from race conditions caused by subsequent in-memory mutations on the entity instance:

```typescript
import { RootDomainEvent } from '@nestjs-pipeline/ddd-core';
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

Command handlers extend `CommandBaseHandler`. When `handle()` returns an `AggregateRoot`, `CommandBaseHandler` automatically publishes all uncommitted events to the NestJS `EventBus` and calls `aggregate.uncommit()`:

```typescript
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { CommandBaseHandler, ICommandRepository } from '@nestjs-pipeline/ddd-core';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import { User, UserSnapshot } from './user.entity';
import { CreateUserCommand } from './create-user.command';

@CommandHandler(CreateUserCommand)
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'log' }])
export class CreateUserHandler extends CommandBaseHandler<CreateUserCommand, User> {
  constructor(
    private readonly commandRepository: ICommandRepository<User, UserSnapshot>,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: CreateUserCommand): Promise<User> {
    // 1. Create domain entity (internally applies UserCreatedEvent)
    const user = User.create(command.username, command.email, command.department);

    // 2. Persist entity state directly (no wrapper outcomes)
    await this.commandRepository.save(user);

    // 3. Return aggregate root:
    // CommandBaseHandler automatically calls eventBus.publishAll() and uncommit()!
    return user;
  }
}
```

> [!IMPORTANT]
> Command handlers must return the `AggregateRoot` (or an application result containing `aggregate: AggregateRoot`). Event publishing is handled automatically by `CommandBaseHandler.execute()` upon completion—never publish or commit domain events manually inside handlers. Presentation-specific transformations (such as mapping to response DTOs or session cookies) belong in the controller layer via dedicated mappers (e.g. `toSessionRes(result)`).

---

### 4. Write-Side Command Repositories with Lifecycle Decorators

Command repositories receive and persist domain entities directly via `save(entity: TEntity)`.

The lifecycle decorators (`@Cache`, `@AcknowledgePersisted`, and `@MapPersistenceErrors`) synchronize caches, advance version baselines, and map driver constraints declaratively:

#### Creation Repository (`CreateUserCommandRepository`)
```typescript
import { Injectable } from '@nestjs/common';
import {
  CommandRepository,
  Cache,
  AcknowledgePersisted,
  MapPersistenceErrors,
  ICache,
} from '@nestjs-pipeline/ddd-core';
import { User, UserSnapshot } from './user.entity';
import { UniqueEmailException } from './errors/email.exception';

@Injectable()
export class CreateUserCommandRepository extends CommandRepository<User, UserSnapshot> {
  constructor(protected readonly cache: ICache<UserSnapshot>, private readonly store: any) {
    super(cache);
  }

  @Cache<User, UserSnapshot>(
    // setKey: caches the newly created aggregate by id
    (user) => `tenant:user:id:${user.id}`,
    null,
    // invalidateKeys: invalidates secondary email lookup so stale/negative cache cannot hide the new record
    (user) => [`tenant:user:email:${user.email}`],
  )
  @AcknowledgePersisted<[User]>({ entity: ([user]) => user })
  @MapPersistenceErrors<[User], User>({
    entity: ([user]) => user,
    unique: [
      {
        constraint: 'users_email_unique',
        columns: 'users.email',
        error: (user) => new UniqueEmailException(user),
      },
    ],
  })
  async save(user: User): Promise<UserSnapshot> {
    const em = this.store.em;
    const persisted = em.create(User, user);
    em.persist(persisted);
    await em.flush();
    return persisted.toJSON();
  }
}
```

#### Update Repository (`UpdateUserCommandRepository`)
```typescript
import { Injectable } from '@nestjs/common';
import {
  CommandRepository,
  Cache,
  AcknowledgePersisted,
  MapPersistenceErrors,
  optimisticUpdate,
  ICache,
} from '@nestjs-pipeline/ddd-core';
import { User, UserSnapshot } from './user.entity';

@Injectable()
export class UpdateUserCommandRepository extends CommandRepository<User, UserSnapshot> {
  constructor(protected readonly cache: ICache<UserSnapshot>, private readonly store: any) {
    super(cache);
  }

  @Cache<User, UserSnapshot>(
    // setKey: writes updated snapshot into cache
    (user) => `tenant:user:id:${user.id}`,
    null,
    // invalidateKeys: secondary lookup keys to evict (e.g. by email)
    (user) => [`tenant:user:email:${user.email}`],
  )
  @AcknowledgePersisted<[User]>({ entity: ([user]) => user })
  @MapPersistenceErrors<[User], User>({
    entity: ([user]) => user,
    unique: [],
  })
  async save(user: User): Promise<UserSnapshot> {
    const snapshot = user.toJSON();
    await optimisticUpdate(
      this.store.em,
      User,
      user,
      {
        username: snapshot.username,
        department: snapshot.department ?? null,
        updatedAt: snapshot.updatedAt,
      },
      'User',
    );
    return snapshot;
  }
}
```

#### Deletion Repository (`DeleteUserCommandRepository`)
```typescript
import { Injectable } from '@nestjs/common';
import {
  CommandRepository,
  Cache,
  EntityNotFoundException,
  ICache,
} from '@nestjs-pipeline/ddd-core';
import { OptimisticLockError } from '@mikro-orm/core';
import { User } from './user.entity';

@Injectable()
export class DeleteUserCommandRepository extends CommandRepository<User, null> {
  constructor(protected readonly cache: ICache<unknown>, private readonly store: any) {
    super(cache);
  }

  @Cache<User, null>({
    // deleteKeys: evicts primary and secondary lookup cache keys
    deleteKeys: (user) => [
      `tenant:user:id:${user.id}`,
      `tenant:user:email:${user.email}`,
    ],
  })
  async save(user: User): Promise<null> {
    const affected = await this.store.em.nativeDelete(User, {
      id: user.id,
      version: user.getExpectedVersion(),
    });
    if (affected === 0) {
      const exists = await this.store.em.findOne(User, { id: user.id }, { refresh: true });
      if (exists) {
        throw OptimisticLockError.lockFailedVersionMismatch(
          user,
          user.getExpectedVersion(),
          exists.version,
        );
      }
      throw new EntityNotFoundException('User', user.id);
    }
    return null;
  }
}
```

---

### 5. Read-Side Query Repository with `@FromCache()`

Query repositories handle read-through caching and optional snapshot rehydration:

```typescript
import { Injectable } from '@nestjs/common';
import { QueryRepository, FromCache, ICache } from '@nestjs-pipeline/ddd-core';
import { User, UserSnapshot } from './user.entity';

export interface GetUserQuery {
  readonly userId?: string;
  readonly email?: string;
}

@Injectable()
export class GetUserQueryRepository extends QueryRepository<GetUserQuery, User | null> {
  constructor(protected readonly cache: ICache<UserSnapshot>, private readonly ormStore: any) {
    super(cache);
  }

  @FromCache<GetUserQuery, User | null>({
    // keyFn: derive cache key from query params, or return null to bypass
    keyFn: (q) => (q.userId ? `user:id:${q.userId}` : q.email ? `user:email:${q.email}` : null),
    // hydrateFn: safely transforms cached snapshot into a domain entity via User.fromJSON()
    hydrateFn: (cached) => User.fromJSON(cached as UserSnapshot),
    // alwaysHydrate: guarantees the query repository always yields a domain aggregate instance
    alwaysHydrate: true,
  })
  async find(query: GetUserQuery): Promise<User | null> {
    const em = this.ormStore.getEntityManager();
    const where = query.userId ? { id: query.userId } : { email: query.email };
    return em.findOne('User', where);
  }
}
```

#### Snapshot Storage and Ownership Contract
- **Snapshot Storage Contract**: `@FromCache` ensures that the cache layer (`ICache<TSnapshot>`) stores and returns **only snapshots**, never mutable aggregate instances. On a cache miss, if `find()` returns an aggregate, `@FromCache` automatically extracts its serializable snapshot via `serializeFn` or the entity's `toJSON()` method before saving to cache.
- **Unambiguous Return Contract (`alwaysHydrate: true`)**: With `alwaysHydrate: true`, `@FromCache` guarantees that `find()` always returns a fully rehydrated domain aggregate (`Promise<User | null>`), eliminating ambiguous union types (`User | UserSnapshot`) from query handlers and callers. Handlers can safely perform authorization and domain calculations on real entities before projecting to response DTOs.
- **Dynamic Hydration Mode**: If `alwaysHydrate` is omitted, `@FromCache` respects `query.hydrate`: if `query.hydrate` is true, it rehydrates with `hydrateFn`; if false/omitted, it returns the raw `TSnapshot`.

> [!NOTE]
> `RootEntity.from()` validates aggregate prototype identity at runtime. Attempting to rehydrate a snapshot with an incompatible aggregate class throws an informative `TypeError`, preventing prototype contamination.

---

## Cache Implementations & Options

`@nestjs-pipeline/ddd-core` defines the `ICache<T>` interface and `CacheSetOptions`:

```typescript
export interface CacheSetOptions {
  ttl?: number;
  /** Atomic stale-write check: returns true if incoming data should overwrite cached data. */
  isNewer?: (cached: unknown, incoming: unknown) => boolean;
}

export interface ICache<T = unknown> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T, options?: CacheSetOptions): Promise<void>;
  delete(key: string): Promise<void>;
}
```

In `ddd/users-api`, two production-ready implementations are provided:
- **`MikroOrmCache`**: Database-backed cache entity (`CacheEntry`) storing JSON payloads and Unix expiration timestamps, supporting atomic `isNewer` comparison against existing records.
- **`MemoryCache`**: Lightweight in-process `Map` cache with TTL and atomic `isNewer` protection, suitable for unit tests and local development.

---

## Peer Dependencies

- `@nestjs-pipeline/core` (workspace)
- `@mikro-orm/core` (declared dependency, used by persistence helpers and `UnixTimestampType`)


## Decorated versioned updates

Reusable persistence decorators and the MikroORM update helper are exported from
`@nestjs-pipeline/ddd-core`. Concrete repositories retain their own `save()` logic:

```ts
import {
  AcknowledgePersisted,
  Cache,
  MapPersistenceErrors,
  optimisticUpdate,
} from '@nestjs-pipeline/ddd-core';
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
`EntityNotFoundException` or MikroORM `OptimisticLockError` when appropriate.
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
