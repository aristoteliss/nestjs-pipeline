# @nestjs-pipeline/ddd-core

Reusable Domain-Driven Design primitives for NestJS applications using `@nestjs-pipeline`.

## Overview

This package provides the foundational building blocks for implementing a DDD domain layer:

- **`RootEntity`** — Abstract base entity with UUID v7 identity, `createdAt`/`updatedAt` lifecycle, snapshot-based rehydration, and mutation tracking via `onUpdate()`.
- **`CacheableEntity`** — Extends `RootEntity` with a `cacheKey` property (`<prefixKey><id>`) used by `@Cacheable` and `@Cache` decorators. Also provides `fromStringify()` for deserializing cached JSON.
- **`RootEntitySnapshot`** — Interface defining the shape of a serialized entity (`id`, `createdAt`, `updatedAt`).
- **`DomainEvent`** — Abstract base class for domain events. Each event carries a unique UUID v7 `id`.
- **`RootDomainEvent`** — Domain event that carries a typed reference to the originating entity.
- **`DomainOutcome`** — Base outcome class that bundles domain events produced by an operation.
- **`RootDomainOutcome`** — Outcome that pairs an entity with its domain events, enabling `const { entity, events } = ...` destructuring.
- **`@Mutate()`** — Method decorator that calls `onUpdate()` after the decorated method executes, updating `updatedAt` automatically.
- **`Method`** — Utility type for extracting method signatures.

### Persistence abstractions

- **`ICache<T>`** — Interface for cache providers. Implementations must supply `get`, `set` (with optional options), and `delete`.
- **`CommandRepository<TOutcome, TResult>`** — Abstract base for write repositories. Receives an `ICache` instance; concrete classes implement `save(outcome)`.
- **`QueryRepository<TQuery, TResult>`** — Abstract base for read repositories. Receives an `ICache` instance; concrete classes implement `find(query)`.
- **`@Cacheable()`** — Method decorator for `save()` in command repositories. After a successful write it upserts the result into the cache via `set()`; if the result is `null` (delete), it evicts all related keys via `delete()`.
- **`@Cache()`** — Method decorator for `find()` in query repositories. On every call it checks the cache first; on a miss it executes the query, stores the result, and returns it. Accepts a key function and an optional hydration function.

## Installation

This package is a workspace dependency. Add it to your `package.json`:

```json
{
  "dependencies": {
    "@nestjs-pipeline/ddd-core": "workspace:*"
  }
}
```

## Usage

### Define a domain entity

```typescript
import { CacheableEntity, Mutate, type RootEntitySnapshot } from '@nestjs-pipeline/ddd-core';

export interface UserSnapshot extends Partial<RootEntitySnapshot> {
  readonly username: string;
  readonly email: string;
}

export class User extends CacheableEntity<UserSnapshot, User> {
  static readonly prefixKey = 'user:';

  private _username: string;

  private constructor(snapshot: UserSnapshot) {
    super(User, snapshot);
    this._username = snapshot.username;
  }

  static create(username: string, email: string): User {
    return new User({ username, email });
  }

  @Mutate()
  rename(username: string): void {
    this._username = username;
  }
}
```

### Define domain events

```typescript
import { RootDomainEvent } from '@nestjs-pipeline/ddd-core';
import { User } from './user.entity';

export class UserCreatedEvent extends RootDomainEvent<User> {
  constructor(entity: User) {
    super(entity);
  }
}
```

### Use outcomes to bundle entity + events

```typescript
import { RootDomainOutcome, DomainEvent } from '@nestjs-pipeline/ddd-core';
import { User } from './user.entity';

export class UserCreateOutcome extends RootDomainOutcome<User> {
  constructor(entity: User, events: Array<DomainEvent>) {
    super(entity, events);
  }
}

// In your entity factory:
const outcome = new UserCreateOutcome(user, [new UserCreatedEvent(user)]);
const { entity, events } = outcome;
```

### Implement a command repository with write-through cache

```typescript
import { CommandRepository, Cacheable, ICache } from '@nestjs-pipeline/ddd-core';

export class CreateUserCommandRepository extends CommandRepository<UserCreateOutcome> {
  constructor(protected readonly cache: ICache<UserSnapshot>, private readonly client: Client) {
    super(cache);
  }

  @Cacheable()
  async save(outcome: UserCreateOutcome): Promise<UserSnapshot> {
    const snapshot = outcome.entity.toJSON();
    // persist to DB ...
    return snapshot;
  }
}
```

### Implement a query repository with read-through cache

```typescript
import { QueryRepository, Cache, ICache } from '@nestjs-pipeline/ddd-core';

export class GetUserQueryRepository extends QueryRepository<GetUserQuery, User> {
  constructor(protected readonly cache: ICache<User>, private readonly client: Client) {
    super(cache);
  }

  @Cache(
    (q) => `${User.prefixKey}${q.userId}`,
    (cached) => User.fromJSON(cached as UserSnapshot),
  )
  async find(query: GetUserQuery): Promise<User> {
    // fetch from DB and reconstruct entity ...
  }
}
```

### Provide an ICache implementation

Two implementations are available in `ddd-users-api` as reference:

| Class         | Backed by          | TTL support |
|---------------|--------------------|-------------|
| `MikroOrmCache` | MikroORM (libSQL) | Yes         |
| `MemoryCache` | In-process `Map`   | No          |

## Peer Dependencies

- `@nestjs-pipeline/core` (workspace)
