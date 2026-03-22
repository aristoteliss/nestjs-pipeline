# @nestjs-pipeline/ddd-core

Reusable Domain-Driven Design primitives for NestJS applications using `@nestjs-pipeline`.

## Overview

This package provides the foundational building blocks for implementing a DDD domain layer:

- **`RootEntity`** — Abstract base entity with UUID v7 identity, `createdAt`/`updatedAt` lifecycle, snapshot-based rehydration, and mutation tracking via `onUpdate()`.
- **`RootEntitySnapshot`** — Interface defining the shape of a serialized entity (`id`, `createdAt`, `updatedAt`).
- **`DomainEvent`** — Abstract base class for domain events. Each event carries a unique UUID v7 `id`.
- **`RootDomainEvent`** — Domain event that carries a typed reference to the originating entity.
- **`DomainOutcome`** — Base outcome class that bundles domain events produced by an operation.
- **`RootDomainOutcome`** — Outcome that pairs an entity with its domain events, enabling `const { entity, events } = ...` destructuring.
- **`@Mutate()`** — Method decorator that calls `onUpdate()` after the decorated method executes, updating `updatedAt` automatically.
- **`Method`** — Utility type for extracting method signatures.

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
import { RootEntity, Mutate, type RootEntitySnapshot } from '@nestjs-pipeline/ddd-core';

export interface UserSnapshot extends Partial<RootEntitySnapshot> {
  readonly username: string;
  readonly email: string;
}

export class User extends RootEntity<UserSnapshot> {
  private _username: string;

  private constructor(snapshot: UserSnapshot) {
    super(snapshot);
    this._username = snapshot.username;
  }

  static create(username: string): User {
    return new User({ username });
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

## Peer Dependencies

- `@nestjs-pipeline/core` (workspace)
