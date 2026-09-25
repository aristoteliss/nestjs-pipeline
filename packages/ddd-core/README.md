# @cqrs-ddd/core

[![npm version](https://img.shields.io/npm/v/@cqrs-ddd/core.svg)](https://www.npmjs.com/package/@cqrs-ddd/core)
[![License](https://img.shields.io/npm/l/@cqrs-ddd/core.svg)](https://www.npmjs.com/package/@cqrs-ddd/core)

Framework-neutral building blocks for domain-driven design in TypeScript: aggregates with
versioned mutations, detached domain events, a command handler that publishes those
events, repository contracts, MikroORM persistence decorators, a revision-fenced
repository cache, tenant-scoped cache keys and HTTP status mapping for its errors.

It depends on no framework. It works in a plain Node service, and in a NestJS
application through structural compatibility: see [Using it from NestJS](#using-it-from-nestjs).

## Contents

- [Installation](#installation)
- [Entry points](#entry-points)
- [Aggregates](#aggregates)
- [Domain events](#domain-events)
- [Commands and event publication](#commands-and-event-publication)
- [Write-side repositories](#write-side-repositories)
- [Read-side repositories](#read-side-repositories)
- [The repository cache](#the-repository-cache)
- [Tenant-scoped cache keys](#tenant-scoped-cache-keys)
- [HTTP status mapping](#http-status-mapping)
- [Using it from NestJS](#using-it-from-nestjs)
- [Known limits](#known-limits)
- [License](#license)

## Installation

```bash
pnpm add @cqrs-ddd/core
# or
npm install @cqrs-ddd/core
```

Requires Node.js 22 or later. It installs `@cqrs-ddd/uuidv7` and
`@cqrs-ddd/safe-stringify`, which have no dependencies. Add `@mikro-orm/core` 7 only if
you use `/persistence` or the root entry:

```bash
pnpm add @mikro-orm/core
```

## Entry points

Import from the entry point for the layer you are writing. Each one loads only what it
needs.

| Entry | Holds | Needs at runtime |
| --- | --- | --- |
| `@cqrs-ddd/core/domain` | `AggregateRoot`, `RootEntity`, `@Mutable`, `@ApplyMutation`, `DomainEvent`, `RootDomainEvent`, `deepCloneAndFreeze`, and the errors `DomainException`, `EntityNotFoundException`, `ConcurrencyConflictError`, `TransientOperationError`, `MissingTenantContextError`, `UnknownMutableFieldError` | nothing |
| `@cqrs-ddd/core/application` | `BaseCommand`, `BaseQuery`, `CommandBaseHandler`, the ports (`IDomainEventPublisher`, `ICommandRepository`, `IQueryRepository`, `IWriteSideAggregateRepository`, `ICache`, `IVersionedCache`), `requireTenantId`, `setTenantResolver` | nothing |
| `@cqrs-ddd/core/persistence` | the lifecycle decorators, `QueryRepository`, `CommandRepository`, `MikroOrmWriteSideCommandRepository`, `optimisticUpdate`, `optimisticDelete`, `MemoryCache`, `MikroOrmCache`, the cache-key helpers, `UnixTimestampType`, `rootEntityProperties` | `@mikro-orm/core` 7 |
| `@cqrs-ddd/core/http` | `domainErrorHttpStatus` | nothing |
| `@cqrs-ddd/core` | all of the above | `@mikro-orm/core` 7 |

## Aggregates

An aggregate extends `RootEntity<TSnapshot>`. It gets a UUIDv7 `id`, `createdAt` and
`updatedAt`, an optimistic-concurrency `version`, and an event buffer. State changes go
through domain methods decorated with `@ApplyMutation`, which write only the fields
declared `@Mutable`:

```typescript
import {
  ApplyMutation,
  DomainException,
  Mutable,
  RootEntity,
  type RootEntitySnapshot,
} from '@cqrs-ddd/core/domain';

export class InvalidUsernameException extends DomainException {}

export interface UserSnapshot extends Partial<RootEntitySnapshot> {
  readonly username: string;
  readonly email: string;
}

export class User extends RootEntity<UserSnapshot> {
  static readonly aggregateName = 'user';

  @Mutable<string>({ normalize: (value) => User.validUsername(value) })
  private _username: string;
  readonly email: string;

  private constructor(snapshot: UserSnapshot) {
    super(snapshot);
    this._username = User.validUsername(snapshot.username);
    this.email = snapshot.email;
  }

  static create(username: string, email: string): User {
    const user = new User({ username, email });
    user.apply(new UserCreatedEvent(user));
    return user;
  }

  static fromJSON(snapshot: UserSnapshot): User {
    return new User(snapshot);
  }

  private static validUsername(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length < 3) throw new InvalidUsernameException('Username too short');
    return trimmed;
  }

  get username(): string {
    return this._username;
  }

  @ApplyMutation<User>({ event: (user) => new UserRenamedEvent(user) })
  rename(username: string): this {
    this.applyPatch({ username });
    return this;
  }

  toJSON(): UserSnapshot & RootEntitySnapshot {
    return this.freezeState({
      id: this.id,
      username: this._username,
      email: this.email,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this._version,
    });
  }
}
```

- `applyPatch(patch)` validates and normalizes every supplied field before writing any
  of them, and ignores `undefined` values. An unknown key throws `UnknownMutableFieldError`.
- After a successful method, `@ApplyMutation` advances `version` and `updatedAt` and
  records the event. A method that throws records nothing.
- Validate before patching: a failure after the fields are written (later method code,
  a lifecycle hook, event creation) does not roll them back. Discard or reload the
  instance.
- `RootEntity.from(value)` rehydrates an instance, a snapshot or a nullish database
  result, and throws a `TypeError` for an incompatible aggregate.
- The public setters of `id`, `createdAt` and `updatedAt` exist for ORM hydration only
  (`@internal`), as should any a subclass adds for its own fields. Application code
  changes state through domain methods and factories.

## Domain events

A domain event extends `RootDomainEvent<TEntity, TPayload>`. It carries a UUIDv7 `id`,
the event-time `aggregateId` and `aggregateVersion`, and `payload`: a deep clone of the
aggregate's `toJSON()`, recursively frozen.

```typescript
import { RootDomainEvent } from '@cqrs-ddd/core/domain';

export class UserCreatedEvent extends RootDomainEvent<User, UserSnapshot> {
  constructor(user: User) {
    super(user);
  }
}
```

`UserRenamedEvent` is declared the same way.

- **Detached:** later changes to the aggregate never reach `payload`.
- **Read-only for ordinary access:** own properties are frozen, and the mutating methods
  of cloned `Date`, `Map` and `Set` values throw.
- **Not a security boundary:** `Object.freeze` does not cover built-in internal state,
  so `Date.prototype.setTime.call(payload.at, 0)` still changes it, and every consumer
  of one event shares the same `payload`. `event.clonePayload()` returns a fresh frozen
  copy per call when a consumer needs its own.
- **Not a transport format:** send an explicit, serializable message built from the
  fields you need.

`deepCloneAndFreeze(value)` is the function behind `payload`, also usable on its own. It
handles objects, arrays, `Date`, `Map`, `Set`, `RegExp` and circular references.

## Commands and event publication

`BaseCommand` and `BaseQuery` are plain base classes for command and query objects.
`BaseCommand` keeps an optional `sessionUser` out of enumeration and `toJSON()`, so it
never reaches a fingerprint or a log. `getUpdateFields(fields)` returns the listed
fields the command carries (`null` counts, `undefined` does not), for field-level
authorization.

`CommandBaseHandler` runs a command and publishes the events of the aggregate it
returns:

```typescript
import { CommandBaseHandler, type IDomainEventPublisher } from '@cqrs-ddd/core/application';

export class RenameUserHandler extends CommandBaseHandler<RenameUserCommand, User> {
  constructor(
    private readonly users: IWriteSideAggregateRepository<User>,
    eventBus: IDomainEventPublisher,
  ) {
    super(eventBus);
  }

  async handle(command: RenameUserCommand): Promise<User> {
    const user = await this.users.findById(command.id);
    if (!user) throw new EntityNotFoundException('User', command.id);
    user.rename(command.username);
    await this.users.save(user);
    return user;
  }
}
```

- `handle()` returns the aggregate, or a result carrying it as `aggregate`.
  `execute()` calls it, publishes the buffered events once with
  `eventBus.publishAll(events)`, clears the buffer and returns the result unchanged.
- A rejected `handle()` publishes nothing. If `publishAll()` throws, the error
  propagates and the events stay buffered.
- Any object with `publishAll(events)` is an `IDomainEventPublisher`.

**`AggregateRoot.commit()` publishes nothing by default.** It hands the buffer to the
aggregate's own `publish`/`publishAll` hooks, which do nothing until a publisher is
connected by overriding them, and then clears the buffer. Calling `commit()` without a
connected publisher therefore drops the events; so does `autoCommit`. Let
`CommandBaseHandler` publish, or read `getUncommittedEvents()` and call `uncommit()`
yourself.

## Write-side repositories

A command handler loads the authoritative aggregate through
`IWriteSideAggregateRepository<TEntity>.findById(id)`. `MikroOrmWriteSideCommandRepository`
implements it: `findById()` reads with `{ refresh: true }`, never touches the cache,
rehydrates through the `hydrateFn` you pass, and translates failures with
`mapPersistenceError`. It reads `store.em` on every call (`IEntityManagerSource`), so a
multi-tenant store can hand out the current tenant's manager.

`save()` declares its lifecycle with `@PersistedWrite`:

```typescript
import { filterCacheKey, PersistedWrite } from '@cqrs-ddd/core/persistence';

@PersistedWrite<User>({
  cache: {
    setKey: (user) => filterCacheKey(User.aggregateName, { id: user.id }),
    invalidateKeys: (user) => [filterCacheKey(User.aggregateName, { email: user.email })],
  },
  unique: [
    {
      constraint: 'users_email_unique',
      columns: 'users.email',
      error: (user) => new UniqueEmailException(user),
    },
  ],
})
async save(user: User): Promise<UserSnapshot> {
  const snapshot = user.toJSON();
  await optimisticUpdate(this.store.em, UserRow, user, { username: snapshot.username }, 'User');
  return snapshot;
}
```

`@PersistedWrite` applies three decorators. Stacked by hand, the order is fixed,
outermost first:

1. `@Cache(options)`: after a successful write, writes the returned snapshot through
   with a compare-and-set (`isCacheNewer` unless `isNewer` says otherwise), and
   installs barriers for `invalidateKeys`.
   When `save()` resolves `null` or `undefined`, it installs barriers for `deleteKeys`.
   Cache errors are logged and never turn a committed write into a failure.
2. `@AcknowledgePersisted({ entity: ([aggregate]) => aggregate })`: advances the
   selected aggregate's persisted version only after the write succeeded.
3. `@MapPersistenceErrors({ entity, unique, otherwise })`: translates a configured unique
   constraint (PostgreSQL `23505` with the constraint name, or the PostgreSQL/SQLite
   diagnostic for it) into your domain error. `otherwise` translates the rest;
   `mapPersistenceError` turns retryable driver and network failures into
   `TransientOperationError` and keeps every other error unchanged.

Deletes do not acknowledge, so they stack `@Cache` and `@MapPersistenceErrors` alone.

`optimisticUpdate` and `optimisticDelete` write `WHERE id = ? AND version = expected`,
check the affected rows, and raise `EntityNotFoundException` or
`ConcurrencyConflictError`. They, and every write whose success triggers acknowledgment
or cache work, call `assertAutocommit(em, operation)` first: a write inside an outer
transaction is rejected before any statement runs, because its success would not mean
durable persistence.

`rootEntityProperties(columns?)` and `versionProperty(column?)` give the MikroORM
`EntitySchema` properties every `RootEntity` needs, with timestamps stored as epoch
milliseconds through `UnixTimestampType`. That type throws a `TypeError` for a value
with no valid time instead of storing `NaN`.

## Read-side repositories

A query repository extends `QueryRepository` and decorates `find()` with `@FromCache`:

```typescript
import { FromCache, QueryRepository, filterCacheKey } from '@cqrs-ddd/core/persistence';

export class GetUserQueryRepository extends QueryRepository<GetUserQuery, User | null> {
  constructor(cache: IVersionedCache<UserSnapshot>, private readonly store: IEntityManagerSource) {
    super(cache, { hydrateFn: (cached) => User.fromJSON(cached as UserSnapshot) });
  }

  @FromCache<GetUserQuery, User | null>({
    keyFn: (query) => filterCacheKey(User.aggregateName, { id: query.id }),
  })
  async find(query: GetUserQuery): Promise<User | null> {
    const row = await this.store.em.findOne(UserRow, { id: query.id });
    return row ? User.fromJSON(row) : null;
  }
}
```

- Every hit is rehydrated whenever a hydrator applies, so a hit and a miss return the
  same type. A method's own `hydrateFn` (or `hydrateFn: null`) overrides the
  repository's; `serializeFn` follows the same rule.
- Without a hydrator, only plain data is cached; a class instance is returned uncached.
- Only non-nullish results are stored. A barrier or a stored `null` counts as a miss.
- A query with `refresh: true` bypasses the cache.
- Cache errors propagate from reads: a query fails rather than guessing.

## The repository cache

`@Cache` works with any `ICache` (`get`, `set`, `delete`). `@FromCache` requires an
`IVersionedCache`, which adds a revision fence:

| Method | Contract |
| --- | --- |
| `readState(key)` | the entry's status (`hit`, `miss`, `expired`), value and opaque revision |
| `invalidate(key)` | evicts the value and advances the revision |
| `tryFill(key, observedRevision, value, options?)` | writes only if the revision is still `observedRevision`; `false` otherwise |

`@FromCache` observes the revision before the database read and fills with `tryFill`, so
a read that raced an invalidation or a delete cannot write a stale snapshot back. A
rejected fill re-reads the key, returns a strictly newer snapshot if one is there, and
otherwise retries a bounded number of times before returning the database result
uncached. **An adapter that implements only `ICache` is bypassed by `@FromCache` for
both reads and fills**, with a warning logged once: it cannot fence a fill.

Two adapters implement `IVersionedCache`:

- `MemoryCache({ defaultTtlMs = 60_000, maxEntries = 10_000 })`: in process, entries
  JSON-cloned on write and read, for tests and a single process.
- `MikroOrmCache(store, { defaultTtlMs?, logger? })`: one database row per key, every
  write a compare-and-set in its own transaction. `store` provides `em` and
  `transactional(work)`. Register `CacheEntrySchema` (or `createCacheEntrySchema(table)`)
  with the ORM, and create the table in a migration with `createCacheTableSql(table?)`
  (PostgreSQL and SQLite).

`CacheSetOptions.isNewer(cached, incoming)` returns `true` when the cached value is
newer and must not be overwritten; `isCacheNewer` compares `version`, then `__gen`, then
`updatedAt`. `toCacheSnapshot` turns a result into a detached snapshot: the cache never
stores a live aggregate.

Mutation barriers (`CacheMutationBarrier`) mark a deleted or invalidated key for
`barrierTtl`, 60 seconds by default. Size it above your longest in-flight read.

**The `logger` option.** `@Cache`, `@FromCache` and `MikroOrmCache` each accept
`logger: { warn(message) }` for their operational warnings, such as a failed cache write,
a bypassed adapter or a miswired repository. A NestJS `Logger` or `console` fits.
Without one, warnings go to `console.warn`. A logger that throws never changes a result.

## Tenant-scoped cache keys

`filterCacheKey(resource, conditions, tenant?)` and `cacheKeyTemplate(template, tenant?)`
namespace every key by tenant. The tenant comes from, in order:

1. the explicit `tenant` argument: a tenant id string, or an object carrying `tenantId`,
   such as a request context;
2. for `cacheKeyTemplate`, a context source's `tenantId`;
3. the resolver the application registers once at startup with `setTenantResolver(fn)`,
   a function that returns the tenant of the running request or job;
4. otherwise, `MissingTenantContextError`.

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';
import { setTenantResolver } from '@cqrs-ddd/core/application';

const requestTenant = new AsyncLocalStorage<string>();
setTenantResolver(() => requestTenant.getStore());

// Per request or job:
requestTenant.run(tenantId, () => handle(request));
```

There is no shared namespace: a missing or empty tenant, or a resolver that returns
nothing, throws. A single-tenant deployment passes a fixed id or registers
`setTenantResolver(() => 'single')`. The same resolution is public as
`requireTenantId(source, purpose)`, for any other key that must be partitioned by
tenant, such as an idempotency or rate-limit key.

`filterCacheKey` keys have the form `${tenant}:${resource}:v1:${sha256}`, hashed over a
key-sorted serialization of `[tenant, resource, conditions]`. The format is frozen, so
stored entries stay addressable across releases.

## HTTP status mapping

`domainErrorHttpStatus(error)` from `/http` maps this package's errors to plain
`{ statusCode, error, message }` values, for any HTTP framework:

| Error | Status |
| --- | --- |
| `ConcurrencyConflictError` | 409 |
| `EntityNotFoundException` | 404 |
| `MissingTenantContextError` | 500, with a generic message: a request without a tenant is a server fault |
| any other `DomainException` | 400 |

It returns `undefined` for anything else. Map your own exceptions first, then pass the
rest to it.

## Using it from NestJS

Nothing in this package imports NestJS; the fit is structural.

- The NestJS CQRS `EventBus` has `publishAll(events)`, so it is an
  `IDomainEventPublisher`: a handler passes its injected bus to `super(eventBus)`.
- `CommandBaseHandler.execute(command)` is the method the NestJS command bus calls, so a
  class decorated with `@CommandHandler` extends it directly.
- `BaseCommand`, `BaseQuery` and the domain events are plain classes that NestJS
  dispatches like any other.

```typescript
@CommandHandler(RenameUserCommand)
export class RenameUserHandler extends CommandBaseHandler<RenameUserCommand, User> {
  constructor(
    @Inject(USER_WRITE_REPOSITORY) private readonly users: IWriteSideAggregateRepository<User>,
    eventBus: EventBus,
  ) {
    super(eventBus);
  }
  // handle() as above
}
```

The application writes the rest of the glue:

- providers for the repositories and the cache, for example a `useFactory` provider
  that builds a `MikroOrmCache`;
- the tenant resolver, registered once before any lifecycle hook can start work that
  reads it, for example in a module constructor;
- an exception filter that maps its own errors, then calls `domainErrorHttpStatus`;
- a `logger` for the cache decorators, such as `new Logger('UserCache')`.

## Known limits

- Persistence and event publication are not atomic. A crash between the write and
  `publishAll()` loses the events; durable delivery needs an outbox.
- Cache maintenance after a commit is best-effort. If an invalidation fails, the
  previous entry stays until it expires: the revision fence coordinates the cache with
  itself, not with the database. Read with `{ refresh: true }` where a decision must
  not rest on a cached value.
- A mutation barrier protects only for `barrierTtl`. It is a bounded race window, not a
  tombstone.
- The persistence helpers reject outer transactions; decorators cannot make several
  writes atomic.
- `/persistence` supports MikroORM 7; constraint mapping and the cache table SQL cover
  PostgreSQL and SQLite.
- The tenant resolver is process-wide: one per process, for each installed copy of this
  package.
- Event payloads are frozen for ordinary access only; see [Domain events](#domain-events).

## License

Dual-licensed under **AGPL-3.0-or-later** or a **Commercial License**. See
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
at the repository root.
