# @nestjs-pipeline/ddd-core

Reusable Domain-Driven Design primitives for NestJS applications using `@nestjs-pipeline`.

## Overview

This package provides the foundational building blocks for implementing a Clean Architecture / DDD domain and persistence layer:

### Domain Primitives

- **`RootEntity<TSnapshot>`** — Abstract base aggregate entity extending `@nestjs/cqrs` `AggregateRoot`. Provides internal uncommitted domain event management (`this.apply(event)`), UUID v7 identity, immutable `createdAt`/`updatedAt` timestamps, accessor mappings (`id`, `createdAt`, `updatedAt`), polymorphic snapshot rehydration via `RootEntity.from()`, and mutation tracking via `onUpdate()`.
- **`RootEntitySnapshot`** — Interface defining the serialized state contract (`id`, `createdAt`, `updatedAt`).
- **`DomainException`** — Abstract base class for domain invariant failures. Pure TypeScript error class completely decoupled from HTTP status codes and framework decorators.
- **`DomainEvent`** — Abstract base class for domain events carrying a unique UUID v7 `id` and implementing `@nestjs/cqrs` `IEvent`.
- **`RootDomainEvent<TEntity>`** — Domain event carrying a typed reference to the originating entity.
- **`CommandBaseHandler<TCommand, TResult>`** — Abstract base handler for CQRS commands. Executes the `@UsePipeline` chain, automatically dispatches uncommitted domain events via `this.eventBus.publishAll()` when an `AggregateRoot` is returned from `handle()`, and provides `protected commit(aggregate: AggregateRoot)` for custom return types.
- **`DomainOutcome` / `RootDomainOutcome<TEntity>`** — *(Deprecated)* Legacy wrappers for bundling events with entities. Modern domain aggregates manage uncommitted events internally via `this.apply(event)`.
- **`@Mutate()`** — Method decorator that automatically triggers `onUpdate()` after the decorated method executes, updating `updatedAt`.
- **`UnixTimestampType`** — Custom MikroORM `Type<Date, number>` mapping JavaScript `Date` instances to Unix timestamps (ms) in integer database columns.
- **`Method`** — Utility type for extracting method signatures.

### Persistence Abstractions

- **`ICache<T>`** — Interface for cache providers defining `get`, `set` (with optional options), and `delete`.
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

Domain aggregates extend `RootEntity` (which extends `@nestjs/cqrs` `AggregateRoot`). They record uncommitted domain events via `this.apply(event)` and enforce business rules through framework-agnostic `DomainException`s:

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

  toJSON(): RootEntitySnapshot & UserSnapshot {
    return this.freezeState({
      id: this.id,
      username: this.username,
      email: this.email,
      department: this.department,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    });
  }
}
```

---

### 2. Defining Domain Events

Domain events extend `RootDomainEvent<TEntity>` (which implements `@nestjs/cqrs` `IEvent`) carrying a unique UUID v7 identifier and a typed reference to the originating aggregate:

```typescript
import { RootDomainEvent } from '@nestjs-pipeline/ddd-core';
import { User } from './user.entity';

export class UserCreatedEvent extends RootDomainEvent<User> {
  constructor(entity: User) {
    super(entity);
  }
}

export class UserRenamedEvent extends RootDomainEvent<User> {
  constructor(entity: User) {
    super(entity);
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

### 4. Write-Side Command Repository with `@Cache()`

Command repositories receive and persist domain entities directly via `save(entity: TEntity)`. The `@Cache` decorator synchronizes caches declaratively using the pure entity:

```typescript
import { Injectable } from '@nestjs/common';
import { CommandRepository, Cache, ICache } from '@nestjs-pipeline/ddd-core';
import { User, UserSnapshot } from './user.entity';

// Write-through caching on creation / update (positional syntax)
@Injectable()
export class CreateUserCommandRepository extends CommandRepository<User, UserSnapshot> {
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
    const persisted = await this.ormStore.em.upsert(User, user);
    return persisted.toJSON();
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
    await this.ormStore.em.nativeDelete(User, user.id);
    return null;
  }
}
```

---

### 4. Read-Side Query Repository with `@FromCache()`

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
export class GetUserQueryRepository extends QueryRepository<GetUserQuery, User | null> {
  constructor(protected readonly cache: ICache<User>, private readonly ormStore: any) {
    super(cache);
  }

  @FromCache<GetUserQuery, User>(
    // keyFn: derive cache key from query params, or return null to bypass
    (q) => (q.userId ? `user:id:${q.userId}` : q.email ? `user:email:${q.email}` : null),
    // hydrateFn: transforms cached snapshot into a rich domain entity instance
    (cached) => User.fromJSON(cached as UserSnapshot),
  )
  async find(query: GetUserQuery): Promise<User | null> {
    const where = query.userId ? { id: query.userId } : { email: query.email };
    const user = await this.ormStore.em.findOne(User, where);
    return user;
  }
}
```

---

## Cache Implementations

`@nestjs-pipeline/ddd-core` defines the `ICache<T>` interface. Concrete implementations can be backed by any store:

```typescript
export interface ICache<T = unknown> {
  get(key: string): Promise<T | null>;
  set(key: string, value: T, options?: { ttl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}
```

In `ddd/users-api`, two production-ready implementations are provided:
- **`MikroOrmCache`**: Database-backed cache entity (`CacheEntry`) storing JSON payloads and Unix expiration timestamps.
- **`MemoryCache`**: Lightweight in-memory `Map` cache suitable for local testing.

---

## Peer Dependencies

- `@nestjs-pipeline/core` (workspace)
- `@mikro-orm/core` (optional, for `UnixTimestampType` integration)
