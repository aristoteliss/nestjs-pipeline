# @nestjs-pipeline/ddd-core

Reusable Domain-Driven Design primitives for NestJS applications using `@nestjs-pipeline`.

## Overview

This package provides the foundational building blocks for implementing a Clean Architecture / DDD domain and persistence layer:

### Domain Primitives

- **`RootEntity<TSnapshot>`** — Abstract base entity with UUID v7 identity, immutable `createdAt`/`updatedAt` timestamps, accessor mappings (`id`, `createdAt`, `updatedAt`), polymorphic snapshot rehydration via `RootEntity.from()`, and mutation tracking via `onUpdate()`.
- **`RootEntitySnapshot`** — Interface defining the serialized state contract (`id`, `createdAt`, `updatedAt`).
- **`DomainException`** — Abstract base class for domain invariant failures. Pure TypeScript error class completely decoupled from HTTP status codes and framework decorators.
- **`DomainEvent`** — Abstract base class for domain events carrying a unique UUID v7 `id`.
- **`RootDomainEvent<TEntity>`** — Domain event carrying a typed reference to the originating entity.
- **`DomainOutcome`** — Base outcome class bundling domain events produced by an operation.
- **`RootDomainOutcome<TEntity>`** — Outcome pairing an entity with its domain events, enabling `const { entity, events } = outcome` destructuring.
- **`@Mutate()`** — Method decorator that automatically triggers `onUpdate()` after the decorated method executes, updating `updatedAt`.
- **`UnixTimestampType`** — Custom MikroORM `Type<Date, number>` mapping JavaScript `Date` instances to Unix timestamps (ms) in integer database columns.
- **`Method`** — Utility type for extracting method signatures.

### Persistence Abstractions

- **`ICache<T>`** — Interface for cache providers defining `get`, `set` (with optional options), and `delete`.
- **`CommandRepository<TOutcome, TResult>`** — Abstract base for write repositories. Injects an `ICache` instance; concrete classes implement `save(outcome)`.
- **`QueryRepository<TQuery, TResult>`** — Abstract base for read repositories. Injects an `ICache` instance; concrete classes implement `find(query)`.
- **`@Cache()`** — Method decorator for `save()` in command repositories:
  - **Write-Through**: Automatically caches the returned result under the key derived by `setKeyFn`.
  - **Eviction**: Evicts keys derived by `deleteKeysFn` when `save()` yields `null` or `undefined` (e.g. on entity deletion).
  - **Secondary Invalidation**: Evicts auxiliary keys derived by `invalidateKeysFn` on successful writes.
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

Domain aggregates remain pure DDD models. They encapsulate business rules and invariants, throwing framework-agnostic `DomainException`s:

```typescript
import { RootEntity, Mutate, type RootEntitySnapshot, DomainException } from '@nestjs-pipeline/ddd-core';

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

  static create(username: string, email: string, department?: string | null): User {
    return new User({ username, email, department });
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
  updateProfile(username?: string, department?: string | null): void {
    if (username !== undefined) this.username = username;
    if (department !== undefined) this.department = department;
  }

  afterUpdate(): void {
    // Optional hook executed after every @Mutate() invocation
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

### 2. Defining Domain Events and Outcomes

Mutations bundle the aggregate state with emitted domain events:

```typescript
import { RootDomainEvent, RootDomainOutcome, DomainEvent } from '@nestjs-pipeline/ddd-core';
import { User } from './user.entity';

// 1. Domain Event
export class UserCreatedEvent extends RootDomainEvent<User> {
  constructor(entity: User) {
    super(entity);
  }
}

// 2. Domain Outcome
export class UserCreateOutcome extends RootDomainOutcome<User> {
  constructor(entity: User, events: DomainEvent[] = [new UserCreatedEvent(entity)]) {
    super(entity, events);
  }
}

// 3. Usage inside Aggregate Factory or Handler
const user = User.create('alice', 'alice@example.com');
const outcome = new UserCreateOutcome(user);
const { entity, events } = outcome;
```

---

### 3. Write-Side Command Repository with `@Cache()`

Command repositories handle persistence and declarative cache updates or evictions without polluting domain entities:

```typescript
import { Injectable } from '@nestjs/common';
import { CommandRepository, Cache, ICache } from '@nestjs-pipeline/ddd-core';
import { User, UserSnapshot } from './user.entity';
import { UserCreateOutcome } from './user-create.outcome';
import { UserUpdateOutcome } from './user-update.outcome';

// Write-through caching on creation/update (positional syntax)
@Injectable()
export class CreateUserCommandRepository extends CommandRepository<UserCreateOutcome, UserSnapshot> {
  constructor(protected readonly cache: ICache<UserSnapshot>, private readonly ormStore: any) {
    super(cache);
  }

  @Cache<UserCreateOutcome, UserSnapshot>(
    // setKey: writes result into cache under this key
    (outcome) => `tenant:user:id:${outcome.entity.id}`,
    // deleteKeys: null (not a deletion)
    null,
    // invalidateKeys: secondary lookup keys to evict (e.g. by email)
    (outcome) => [`tenant:user:email:${outcome.entity.email}`],
  )
  async save(outcome: UserCreateOutcome): Promise<UserSnapshot> {
    const user = await this.ormStore.em.upsert(User, outcome.entity);
    return user.toJSON();
  }
}

// Eviction on deletion (options object syntax)
@Injectable()
export class DeleteUserCommandRepository extends CommandRepository<UserUpdateOutcome, null> {
  constructor(protected readonly cache: ICache<UserSnapshot>, private readonly ormStore: any) {
    super(cache);
  }

  @Cache<UserUpdateOutcome, null>({
    // deleteKeys: evict all primary and secondary cache keys
    deleteKeys: (outcome) => [
      `tenant:user:id:${outcome.entity.id}`,
      `tenant:user:email:${outcome.entity.email}`,
    ],
  })
  async save(outcome: UserUpdateOutcome): Promise<null> {
    await this.ormStore.em.nativeDelete(User, outcome.entity.id);
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
