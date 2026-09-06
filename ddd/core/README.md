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
- **`CommandBaseHandler<TCommand, TResult>`** — Abstract base handler for CQRS commands. Executes the `@UsePipeline` chain, automatically dispatches uncommitted domain events via `this.eventBus.publishAll()` when an `AggregateRoot` is returned from `handle()`, and provides `protected commit(aggregate: AggregateRoot)` for custom return types.
- **`DomainOutcome` / `RootDomainOutcome<TEntity>`** — *(Deprecated)* Legacy wrappers for bundling events with entities. Modern domain aggregates manage uncommitted events internally via `this.apply(event)`.
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
  - **Read-Through**: Checks the cache first via `keyFn`; on a cache hit returns the cached value (optionally rehydrating with `hydrateFn`).
  - **Bounded Negative Cache**: Stores **only non-nullish** results to prevent negative caching of uncreated records.
  - **Fail-Closed**: Cache errors propagate to enforce strong consistency at the query boundary.

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

> [!NOTE]
> If your handler returns a non-aggregate result (e.g. a DTO or session token), you can use the protected `this.commit(aggregate)` helper to manually dispatch uncommitted events to the `EventBus` before returning.

---

### 4. Write-Side Command Repository with Optimistic Locking and `@Cache()`

Command repositories receive and persist domain entities directly via `save(entity: TEntity)`. The `@Cache` decorator synchronizes caches declaratively using the pure entity:

```typescript
import { ConflictException, Injectable } from '@nestjs/common';
import { CommandRepository, Cache, ICache } from '@nestjs-pipeline/ddd-core';
import { User, UserSnapshot } from './user.entity';

// Write-through caching with optimistic locking (positional syntax)
@Injectable()
export class UpdateUserCommandRepository extends CommandRepository<User, UserSnapshot> {
  constructor(protected readonly cache: ICache<UserSnapshot>, private readonly ormStore: any) {
    super(cache);
  }

  @Cache<User, UserSnapshot>(
    // setKey: writes result into cache under this key
    (user) => `tenant:user:id:${user.id}`,
    // deleteKeys: null (not a deletion)
    null,
    // invalidateKeys: secondary lookup keys to evict (e.g. by email)
    (user) => [`tenant:user:email:${user.email}`],
  )
  async save(user: User): Promise<UserSnapshot> {
    const em = this.ormStore.getEntityManager();
    const expectedVersion = user.getExpectedVersion();

    // Enforce optimistic locking against concurrent writes
    const affected = await em.nativeUpdate(
      'User',
      { id: user.id, version: expectedVersion },
      { ...user.toJSON() },
    );

    if (affected === 0) {
      throw new ConflictException(
        `Optimistic lock failure: User ${user.id} was modified concurrently (expected version ${expectedVersion}).`,
      );
    }

    return user.toJSON();
  }
}

// Eviction on deletion (options object syntax)
@Injectable()
export class DeleteUserCommandRepository extends CommandRepository<User, null> {
  constructor(protected readonly cache: ICache<UserSnapshot>, private readonly ormStore: any) {
    super(cache);
  }

  @Cache<User, null>({
    // deleteKeys: evict all primary and secondary cache keys
    deleteKeys: (user) => [
      `tenant:user:id:${user.id}`,
      `tenant:user:email:${user.email}`,
    ],
  })
  async save(user: User): Promise<null> {
    const em = this.ormStore.getEntityManager();
    await em.nativeDelete('User', { id: user.id });
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
  readonly hydrate?: boolean;
}

@Injectable()
export class GetUserQueryRepository extends QueryRepository<GetUserQuery, User | UserSnapshot | null> {
  constructor(protected readonly cache: ICache<UserSnapshot>, private readonly ormStore: any) {
    super(cache);
  }

  @FromCache<GetUserQuery, User | UserSnapshot>(
    // keyFn: derive cache key from query params, or return null to bypass
    (q) => (q.userId ? `user:id:${q.userId}` : q.email ? `user:email:${q.email}` : null),
    // hydrateFn: safely transforms cached snapshot into a domain entity via RootEntity.from()
    (cached) => User.from(cached as UserSnapshot),
  )
  async find(query: GetUserQuery): Promise<User | UserSnapshot | null> {
    const em = this.ormStore.getEntityManager();
    const where = query.userId ? { id: query.userId } : { email: query.email };
    const user = await em.findOne('User', where);
    if (!user) return null;
    return query.hydrate ? User.from(user) : user.toJSON();
  }
}
```

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
- `@mikro-orm/core` (optional, for `UnixTimestampType` integration)
