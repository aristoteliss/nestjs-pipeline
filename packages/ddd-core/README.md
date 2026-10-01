# @cqrs-ddd/core

[![npm version](https://img.shields.io/npm/v/@cqrs-ddd/core.svg)](https://www.npmjs.com/package/@cqrs-ddd/core)
[![License](https://img.shields.io/npm/l/@cqrs-ddd/core.svg)](https://www.npmjs.com/package/@cqrs-ddd/core)

Framework-neutral building blocks for domain-driven design in TypeScript: aggregates with
versioned mutations, detached domain events, a command handler that publishes those
events, repository contracts, persistence lifecycle decorators, a revision-fenced
repository cache, tenant-scoped cache keys and HTTP status mapping for its errors.

It depends on no framework and no ORM. MikroORM adapters are in
[`@cqrs-ddd/mikro-orm`](https://www.npmjs.com/package/@cqrs-ddd/mikro-orm). It works in a plain Node service, and in a NestJS
application through structural compatibility: see [Using it from NestJS](#using-it-from-nestjs).

## Contents

- [Installation](#installation)
- [Entry points](#entry-points)
- [Aggregates](#aggregates)
- [Value rules](#value-rules)
- [Domain events](#domain-events)
- [Commands and event publication](#commands-and-event-publication)
- [Write-side repositories](#write-side-repositories)
- [Read-side repositories](#read-side-repositories)
- [The repository cache](#the-repository-cache)
- [Tenant-scoped cache keys](#tenant-scoped-cache-keys)
- [HTTP status mapping](#http-status-mapping)
- [Using it from NestJS](#using-it-from-nestjs)
- [Moving from ddd/core](#moving-from-dddcore)
- [Known limits](#known-limits)
- [License](#license)

## Installation

```bash
pnpm add @cqrs-ddd/core
# or
npm install @cqrs-ddd/core
```

Requires Node.js 22.12 or later. It installs `@cqrs-ddd/uuidv7` and
`@cqrs-ddd/safe-stringify`, which have no dependencies. To persist with MikroORM, add
`@cqrs-ddd/mikro-orm` and `@mikro-orm/core` 7.

Published as an ES module; a CommonJS application loads it with `require()`. Coming from
0.3.x, see [Upgrading from 0.3.x](https://github.com/aristoteliss/nestjs-pipeline#upgrading-from-03x).

## Entry points

Import from the entry point for the layer you are writing. Each one loads only what it
needs.

| Entry | Holds |
| --- | --- |
| `@cqrs-ddd/core/domain` | `AggregateRoot`, `IAggregateRoot`, `ApplyEventOptions`, `RootEntity`, `RootEntitySnapshot`, `@Mutable`, `getMutableFields`, `@ApplyMutation`, `IEvent`, `DomainEvent`, `RootDomainEvent`, `deepCloneAndFreeze`, `textRule`, `numberRule`, `ValueViolation`, and the errors `DomainException`, `InvalidValueException`, `EntityNotFoundException`, `ConcurrencyConflictError`, `TransientOperationError` (with `isTransientOperationError`), `MissingTenantContextError`, `UnknownMutableFieldError` |
| `@cqrs-ddd/core/application` | `BaseCommand`, `BaseQuery`, `IQueryOptions`, `CommandBaseHandler`, the ports (`IDomainEventPublisher`, `ICommandRepository`, `IQueryRepository`, `IWriteSideAggregateRepository`, `ICache`, `IVersionedCache`, `isVersionedCache`), `requireTenant`, `setTenantResolver`, and the deprecated `requireTenantId` |
| `@cqrs-ddd/core/persistence` | the lifecycle decorators (`@PersistedWrite`, `@Cache`, `@AcknowledgePersisted`, `@MapPersistenceErrors`, `@FromCache`), `QueryRepository`, `CommandRepository`, `MemoryCache` and its injection token `CACHE_TOKEN`, `cacheKey`, `cacheKeyTemplate`, `isCacheNewer`, `toCacheSnapshot`, the mutation-barrier helpers, `consoleCacheLogger`, `safeWarn`, and the persistence dialect contract (`IPersistenceDialect`, `setPersistenceDialect`, `persistenceDialect`) |
| `@cqrs-ddd/core/http` | `domainErrorHttpStatus` |
| `@cqrs-ddd/core` | all of the above, plus the `Method` type |

No entry point loads an ORM or NestJS.

## Aggregates

An aggregate extends `RootEntity<TSnapshot>`. It gets a UUIDv7 `id`, `createdAt` and
`updatedAt`, an optimistic-concurrency `version`, and an event buffer. State changes go
through domain methods decorated with `@ApplyMutation`, which write only the fields
declared `@Mutable`:

```typescript
import {
  ApplyMutation,
  DomainException,
  InvalidValueException,
  Mutable,
  RootEntity,
  type RootEntitySnapshot,
  textRule,
} from '@cqrs-ddd/core/domain';

export class InvalidUsernameException extends InvalidValueException {}
export class InvalidDepartmentException extends InvalidValueException {}
export class EmptyUserUpdateException extends DomainException {
  constructor() {
    super('A user update needs at least one field.');
  }
}

export interface UserSnapshot extends Partial<RootEntitySnapshot> {
  readonly username: string;
  readonly email: string;
  readonly department?: string | null;
}

export class User extends RootEntity<UserSnapshot> {
  static readonly aggregateName = 'user';
  static readonly rules = {
    username: textRule({
      field: 'username',
      minLength: 3,
      maxLength: 255,
      error: (violation) => new InvalidUsernameException(violation),
    }),
    department: textRule({
      field: 'department',
      required: false,
      maxLength: 255,
      error: (violation) => new InvalidDepartmentException(violation),
    }),
  } as const;

  @Mutable<string>({ normalize: (value) => User.rules.username.parse(value) })
  private _username: string;

  @Mutable<string | null>({ normalize: (value) => User.rules.department.parse(value) })
  private _department: string | null;

  readonly email: string;

  private constructor(snapshot: UserSnapshot) {
    super(snapshot);
    this._username = User.rules.username.parse(snapshot.username);
    this._department = User.rules.department.parse(snapshot.department);
    this.email = snapshot.email;
  }

  static create(username: string, email: string, department?: string | null): User {
    const user = new User({ username, email, department });
    user.apply(new UserCreatedEvent(user));
    return user;
  }

  static fromJSON(snapshot: UserSnapshot): User {
    return new User(snapshot);
  }

  get username(): string {
    return this._username;
  }

  private set username(value: string) {
    this._username = User.rules.username.parse(value);
  }

  get department(): string | null {
    return this._department;
  }

  private set department(value: string | null) {
    this._department = User.rules.department.parse(value);
  }

  @ApplyMutation<User>({ event: (user) => new UserUpdatedEvent(user) })
  update(fields: { username?: string; department?: string | null }): this {
    if (fields.username === undefined && fields.department === undefined) {
      throw new EmptyUserUpdateException();
    }
    this.applyPatch({ username: fields.username, department: fields.department });
    return this;
  }

  @ApplyMutation<User>({ event: (user) => new UserDeletedEvent(user) })
  delete(): this {
    return this;
  }

  toJSON(): UserSnapshot & RootEntitySnapshot {
    return this.freezeState({
      id: this.id,
      username: this._username,
      department: this._department,
      email: this.email,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version,
    });
  }
}
```

The events are declared in [Domain events](#domain-events). Using the aggregate:

```typescript
const user = User.create('alice', 'alice@example.test');
user.version;                  // 1
user.getUncommittedEvents();   // [UserCreatedEvent]

user.update({ department: 'Research' });
user.version;                  // 2
user.getExpectedVersion();     // 1: the version the next write must find in storage

user.update({});               // throws EmptyUserUpdateException; nothing is recorded
user.update({ username: 'a' }); // throws InvalidUsernameException before any field is written
```

- `@Mutable` registers a field for `applyPatch` under its property name without a
  leading underscore (`_username` is patched as `username`); `as: 'name'` sets another
  key, and `normalize` validates and converts each value.

- `applyPatch(patch)` validates and normalizes every supplied field before writing any
  of them, and ignores `undefined` values. An unknown key throws `UnknownMutableFieldError`.
- After a successful method, `@ApplyMutation` advances `version` and `updatedAt` and
  records the event. A method that throws records nothing.
- Validate before patching: a failure after the fields are written (later method code,
  a lifecycle hook, event creation) does not roll them back. Discard or reload the
  instance.
- `RootEntity.from(value)` rehydrates an instance, a snapshot or a nullish database
  result, and throws a `TypeError` for an incompatible aggregate.
- `id`, `createdAt` and `updatedAt` have public getters and private setters. The ORM
  hydrates through the setters (see below); application code cannot assign them and
  changes state through domain methods and factories. Give a subclass's own persisted
  fields private setters too, as `username` and `department` above.
- `version` is the in-memory version; `getExpectedVersion()` is the version last read
  from or written to storage, which a version-conditioned write compares against.
  `acknowledgePersisted()` moves it forward after a successful write; `@PersistedWrite`
  calls it for you.

## Value rules

`textRule(options)` and `numberRule(options)` define the rule for one field once. The
aggregate uses the rule's `parse(value)` to normalize the value, and other layers read
the rule's limits, so a request schema cannot drift from the domain:

```typescript
z.string().trim().min(User.rules.username.minLength).max(User.rules.username.maxLength);
```

`parse(value)` returns the normalized value or throws the rule's error. It is a
standalone function, and the rule is frozen.

| `textRule` option | Effect |
| --- | --- |
| `field` | Name reported in the violation and in the default message |
| `required` | `false` normalizes `null`, `undefined` and blank text to `null`; by default they are rejected |
| `minLength`, `maxLength` | Length after normalization, in UTF-16 code units like Zod's `.min()` and `.max()` |
| `pattern` | Regular expression the text must match; a `g` or `y` flag is rejected |
| `multiline` | `true` accepts tab, line feed and carriage return inside the text |
| `error` | Builds the error for a violation; defaults to `InvalidValueException` |

Text is checked for type and unpaired surrogates, then put in Unicode NFC form and
trimmed. Control characters are always rejected, and so are tabs and line breaks unless
`multiline` is set.

| `numberRule` option | Effect |
| --- | --- |
| `field`, `required`, `error` | As for `textRule` (`required: false` accepts `null` and `undefined`) |
| `integer` | Accepts safe integers only |
| `min`, `max` | Inclusive bounds |

A number must be of type `number` and finite; a numeric string is rejected, not
converted. An invalid option, such as `minLength` above `maxLength`, throws a
`TypeError` when the rule is defined.

A broken rule throws `error(violation)`. `violation` is a frozen `ValueViolation`:
`{ field, rule }`, plus `limit` for a length or range rule and `expected` for a type
rule. `InvalidValueException` carries it, builds the message (`username must be at
least 3 characters.`), and does not keep the rejected value. Extend it for your own
exceptions, as in the example above, so every one shares that shape.

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

`UserUpdatedEvent` and `UserDeletedEvent` are declared the same way.

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
`BaseCommand` keeps an optional `sessionPrincipal` (or `sessionUser`) out of enumeration and `toJSON()`, so it
never reaches a fingerprint or a log. `getUpdateFields(fields)` returns the listed
fields the command carries (`null` counts, `undefined` does not), for field-level
authorization.

`CommandBaseHandler` runs a command and publishes the events of the aggregate it
returns:

```typescript
import {
  BaseCommand,
  CommandBaseHandler,
  type IDomainEventPublisher,
  type IWriteSideAggregateRepository,
} from '@cqrs-ddd/core/application';
import { EntityNotFoundException } from '@cqrs-ddd/core/domain';

export class UpdateUserCommand extends BaseCommand {
  constructor(
    readonly id: string,
    readonly username?: string,
    readonly department?: string | null,
  ) {
    super();
  }
}

export class UpdateUserHandler extends CommandBaseHandler<UpdateUserCommand, User> {
  constructor(
    private readonly users: IWriteSideAggregateRepository<User>,
    eventBus: IDomainEventPublisher,
  ) {
    super(eventBus);
  }

  async handle(command: UpdateUserCommand): Promise<User> {
    const user = await this.users.findById(command.id);
    if (!user) throw new EntityNotFoundException('User', command.id);
    user.update({ username: command.username, department: command.department });
    await this.users.save(user);
    return user;
  }
}

const handler = new UpdateUserHandler(users, {
  publishAll: async (events) => events.forEach((event) => emitter.emit('event', event)),
});
await handler.execute(new UpdateUserCommand(id, 'bob'));
```

- `handle()` returns the aggregate, or a result carrying it as `aggregate`; any
  `IAggregateRoot` qualifies. `execute()` calls it, publishes the buffered events once
  with `eventBus.publishAll(events, aggregate)` (the aggregate is the dispatcher context),
  clears the buffer and returns the result unchanged.
- A rejected `handle()` publishes nothing. If `publishAll()` throws, the error
  propagates and the events stay buffered.
- If `publishAll()` returns a promise, `execute()` waits for it after clearing the buffer.
  Its rejection rejects the command, although the aggregate is already persisted; the
  events are not published a second time.
- Any object with `publishAll(events)` is an `IDomainEventPublisher`.

**`AggregateRoot.commit()` publishes nothing by default.** It hands a copy of the
buffer to the aggregate's own `publishAll` hook (`apply()` calls `publish` while
`autoCommit` is on), which does nothing until a publisher is connected, then clears the
buffer. Calling `commit()` without a connected publisher therefore drops the events; so
does `autoCommit`. Let `CommandBaseHandler` publish, or read `getUncommittedEvents()` and
call `uncommit()` yourself.

`commit(dispatcherContext?)` passes the context, such as `{ transaction }`, to
`publishAll` and returns what it returns. The buffer is cleared once `publishAll`
returns, before an asynchronous publisher settles, so `await aggregate.commit()` waits
for the publisher and receives its error without risking a second publication; if
`publishAll` throws, the events stay buffered.

## Write-side repositories

A command handler loads the authoritative aggregate through
`IWriteSideAggregateRepository<TEntity>.findById(id)`: it must read primary storage, never
a cache. `@cqrs-ddd/mikro-orm`'s `AggregateRepository` implements it for MikroORM.

`save()` declares its lifecycle with `@PersistedWrite`. With `@cqrs-ddd/mikro-orm`, where
`AggregateRepository` provides `findById()` and `this.store`:

```typescript
import type { ICache } from '@cqrs-ddd/core/application';
import { DomainException } from '@cqrs-ddd/core/domain';
import { cacheKey, PersistedWrite } from '@cqrs-ddd/core/persistence';
import {
  AggregateRepository,
  type IEntityManagerSource,
  mapPersistenceError,
  optimisticUpdate,
} from '@cqrs-ddd/mikro-orm';

export class UniqueEmailException extends DomainException {
  constructor(readonly user: User) {
    super('This email is already registered.');
  }
}

export class UpdateUserRepository extends AggregateRepository<UserSnapshot, User, UserSnapshot> {
  constructor(cache: ICache<UserSnapshot>, store: IEntityManagerSource) {
    super(cache, store, User, User.aggregateName, User.fromJSON);
  }

  @PersistedWrite<User>({
    cache: {
      setKey: (user) => cacheKey(User.aggregateName, { id: user.id }),
      invalidateKeys: (user) => [cacheKey(User.aggregateName, { email: user.email })],
    },
    unique: { email: (user) => new UniqueEmailException(user) },
    otherwise: (error, user) => mapPersistenceError(error, `updating User ${user.id}`),
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

`optimisticUpdate` adds `version` to the written fields; every other changed column,
`updatedAt` included, is listed explicitly.

`@PersistedWrite` applies three decorators. Stacked by hand, the order is fixed,
outermost first:

1. `@Cache(options)`: after a successful write, writes the returned snapshot through
   with a compare-and-set (`isCacheNewer` unless `isNewer` says otherwise), and
   installs barriers for `invalidateKeys`.
   When `save()` resolves `null` or `undefined`, it installs barriers for `deleteKeys`.
   Cache errors are logged and never turn a committed write into a failure.
2. `@AcknowledgePersisted({ entity: ([aggregate]) => aggregate })`: advances the
   selected aggregate's persisted version only after the write succeeded.
3. `@MapPersistenceErrors({ entity, unique, dialect, otherwise })`: translates a unique
   violation into your domain error. `unique` is keyed by the entity property the
   constraint covers (`{ email: ... }`), or by the declared name of a multi-column
   constraint (`MapPersistenceErrors<Args, Entity, typeof NAME>`), so a repository never
   names a database constraint or column. Which constraint an error violated is read by
   the persistence dialect: `options.dialect`, else the one registered with
   `setPersistenceDialect()` at the composition root. Core knows no database; an adapter
   such as `MikroOrmDialect` of `@cqrs-ddd/mikro-orm` implements `IPersistenceDialect`.
   A method that declares `unique` with no dialect available throws a `TypeError` before
   it runs. `otherwise` translates the rest, for example with `mapPersistenceError` of
   `@cqrs-ddd/mikro-orm`, which turns retryable driver and network failures into
   `TransientOperationError` and keeps every other error unchanged.

Deletes do not acknowledge, so they stack `@Cache` and `@MapPersistenceErrors` alone,
and resolve `null` so `@Cache` installs barriers for `deleteKeys`:

```typescript
import { Cache, cacheKey, MapPersistenceErrors } from '@cqrs-ddd/core/persistence';
import { mapPersistenceError, optimisticDelete } from '@cqrs-ddd/mikro-orm';

export class DeleteUserRepository extends AggregateRepository<UserSnapshot, User, null> {
  constructor(cache: ICache<UserSnapshot>, store: IEntityManagerSource) {
    super(cache, store, User, User.aggregateName, User.fromJSON);
  }

  @Cache<User, null>({
    deleteKeys: (user) => [
      cacheKey(User.aggregateName, { id: user.id }),
      cacheKey(User.aggregateName, { email: user.email }),
    ],
  })
  @MapPersistenceErrors<[User], User>({
    entity: ([user]) => user,
    otherwise: (error, user) => mapPersistenceError(error, `deleting User ${user.id}`),
  })
  async save(user: User): Promise<null> {
    await optimisticDelete(this.store.em, User, user, 'User');
    return null;
  }
}
```

The write itself must be version-conditioned (`WHERE id = ? AND version = expected`) and
must not run inside an outer transaction, whose success would not mean durable
persistence. `@cqrs-ddd/mikro-orm` provides `optimisticUpdate` and `optimisticDelete`
for this.

## Read-side repositories

A query repository extends `QueryRepository` and decorates `find()` with `@FromCache`. The
constructor takes the cache (any `ICache`; see [The repository cache](#the-repository-cache)
for why `@FromCache` needs an `IVersionedCache`) and the repository's default hydration:

```typescript
import { BaseQuery, type ICache, type IQueryOptions } from '@cqrs-ddd/core/application';
import { cacheKey, FromCache, QueryRepository } from '@cqrs-ddd/core/persistence';
import type { IEntityManagerSource } from '@cqrs-ddd/mikro-orm';

export class GetUserQuery extends BaseQuery {
  constructor(
    readonly id: string,
    options?: IQueryOptions,
  ) {
    super(options);
  }
}

export class GetUserRepository extends QueryRepository<GetUserQuery, User | null> {
  constructor(
    cache: ICache<UserSnapshot>,
    private readonly store: IEntityManagerSource,
  ) {
    super(cache, { hydrateFn: (cached) => User.fromJSON(cached as UserSnapshot) });
  }

  @FromCache<GetUserQuery, User | null>({
    keyFn: (query) => cacheKey(User.aggregateName, { id: query.id }),
  })
  async find(query: GetUserQuery): Promise<User | null> {
    return this.store.em.findOne(User, { id: query.id }, query.refresh ? { refresh: true } : undefined);
  }
}

await users.find(new GetUserQuery(id));                    // may be served from the cache
await users.find(new GetUserQuery(id, { refresh: true })); // always reads the database
```

`@FromCache` options: `keyFn` (return `null` to skip the cache for that call),
`hydrateFn`, `serializeFn`, `ttl` in milliseconds, `isNewer` and `logger`.

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
- `MikroOrmCache`, in `@cqrs-ddd/mikro-orm`: one database row per key, every write a
  compare-and-set in its own transaction.

`CacheSetOptions.isNewer(cached, incoming)` returns `true` when the cached value is
newer and must not be overwritten; `isCacheNewer` compares `version`, then `__gen`, then
`updatedAt`. `toCacheSnapshot` turns a result into a detached snapshot: the cache never
stores a live aggregate.

Mutation barriers (`CacheMutationBarrier`) mark a deleted or invalidated key for
`barrierTtl`, 60 seconds by default. Size it above your longest in-flight read.

**The `logger` option.** `@Cache` and `@FromCache` accept `logger: { warn(message) }`
for their operational warnings, such as a failed cache write, a bypassed adapter or a
miswired repository. A NestJS `Logger` or `console` fits. Without one, warnings go to
`console.warn`. A logger that throws never changes a result. An adapter reports its own
warnings the same way through `consoleCacheLogger(context)` and `safeWarn(logger, message)`.

## Tenant-scoped cache keys

`cacheKey(resource, conditions, tenant?)` and `cacheKeyTemplate(template, tenant?)`
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
`requireTenant(purpose, source?)`, for any other key that must be partitioned by
tenant, such as an idempotency or rate-limit key, and for any code that needs the
current tenant and must fail when there is none:

```typescript
import { requireTenant } from '@cqrs-ddd/core/application';

requireTenant('access token issuance'); // the resolver's tenant
requireTenant('users.create idempotency key', ctx); // ctx.tenantId, else the resolver's
```

`requireTenantId(source, purpose)` is deprecated: it takes the same arguments in the
reverse order and calls `requireTenant`.

`cacheKey` keys have the form `${tenant}:${resource}:v1:${sha256}`, hashed over a
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
| any other `DomainException`, `InvalidValueException` included | 400 |

It returns `undefined` for anything else. Map your own exceptions first, then pass the
rest to it.

## Using it from NestJS

Nothing in this package imports NestJS; the fit is structural.

- The NestJS CQRS `EventBus` has `publishAll(events, dispatcherContext)`, so it is an
  `IDomainEventPublisher`: a handler passes its injected bus to `super(eventBus)`, and
  the bus hands the aggregate to its configured publisher as the dispatcher context.
- `AggregateRoot` satisfies NestJS's `IAggregateRoot`, and a NestJS `AggregateRoot`
  satisfies this package's `IAggregateRoot`. `EventPublisher.mergeObjectContext(aggregate)`
  connects an aggregate to the `EventBus`: `commit()` then publishes with the aggregate as
  the context, `commit({ transaction })` with that context, and both return the bus's
  result.
- `CommandBaseHandler.execute(command)` is the method the NestJS command bus calls, so a
  class decorated with `@CommandHandler` extends it directly.
- `BaseCommand`, `BaseQuery` and the domain events are plain classes that NestJS
  dispatches like any other.

```typescript
@CommandHandler(UpdateUserCommand)
export class UpdateUserHandler extends CommandBaseHandler<UpdateUserCommand, User> {
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
  that builds a `MikroOrmCache` from `@cqrs-ddd/mikro-orm` under `CACHE_TOKEN`:

  ```typescript
  { provide: CACHE_TOKEN, useValue: new MemoryCache({ defaultTtlMs: 30_000 }) }
  ```

- the tenant resolver, registered once before any lifecycle hook can start work that
  reads it, for example in a module constructor;
- an exception filter that maps its own errors, then calls `domainErrorHttpStatus`;
- a `logger` for the cache decorators, such as `new Logger('UserCache')`.

## Moving from ddd/core

The unpublished workspace package `@nestjs-pipeline/ddd-core` (directory `ddd/core`) maps
onto this package as follows. It depended on NestJS and MikroORM; this package depends on
neither, and the MikroORM parts are in `@cqrs-ddd/mikro-orm`.

| `ddd/core` | `@cqrs-ddd/core` |
| --- | --- |
| `import { … } from '@nestjs-pipeline/ddd-core'` | the layer entry points: `@cqrs-ddd/core/domain`, `/application`, `/persistence`, `/http` |
| `@Mutate()` on a mutation method, which called `onUpdate()` | `@ApplyMutation({ event })`, which also records the event, plus `@Mutable` fields written through `applyPatch()` |
| `DomainOutcome`, `RootDomainOutcome` returned by `handle()` | `handle()` returns the aggregate, or a result with an `aggregate` property; its buffered events are published |
| `CommandBaseHandler(eventBus: EventBus)` from `@nestjs/cqrs` | `CommandBaseHandler(eventBus: IDomainEventPublisher)`; a NestJS `EventBus` still fits |
| `CacheableEntity`, `ICacheKey`, `entity.cacheKey` (`prefix + id`) | `RootEntity` with a static `aggregateName`, keys built with `cacheKey(User.aggregateName, { id })`, always tenant-scoped |
| `CacheableEntity.fromStringify(data, fromJSON)` | `RootEntity.from(value)` or the aggregate's own `fromJSON` |
| `ICommandRepository.save(domainOutcome)` | `ICommandRepository.save(entity)`, and `IWriteSideAggregateRepository.findById(id)` for loading |
| `@Cache(setKeyFn, deleteKeysFn)` | `@Cache({ setKey, deleteKeys, invalidateKeys, ttl, isNewer, barrierTtl, logger })`, usually through `@PersistedWrite` |
| `@FromCache(keyFn, hydrateFn)`, hydrating when `query.hydrate` is set | `@FromCache({ keyFn, hydrateFn, … })` with an `IVersionedCache`; hits are always rehydrated when a hydrator applies |
| `QueryRepository(cache)` | `QueryRepository(cache, { hydrateFn, serializeFn? })` |
| `ICache` in `persistence/cache.interface` | `ICache` and `IVersionedCache` in `@cqrs-ddd/core/application` |
| `UnixTimestampType` | `UnixTimestampType` in `@cqrs-ddd/mikro-orm` |
| `RootEntity` with an abstract `afterUpdate()` | `afterUpdate()` is an optional hook; `RootEntity` extends `AggregateRoot` and adds `version`, `getExpectedVersion()`, the event buffer and private hydration setters |

The old imports and the new ones side by side:

```typescript
// ddd/core
import { CacheableEntity, CommandBaseHandler, Mutate, RootDomainOutcome } from '@nestjs-pipeline/ddd-core';

// @cqrs-ddd/core
import { ApplyMutation, Mutable, RootEntity } from '@cqrs-ddd/core/domain';
import { CommandBaseHandler } from '@cqrs-ddd/core/application';
import { cacheKey, PersistedWrite } from '@cqrs-ddd/core/persistence';
import { AggregateRepository, optimisticUpdate, UnixTimestampType } from '@cqrs-ddd/mikro-orm';
```

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
  writes atomic. A row that must commit with the aggregate, such as an audit record or
  an outbox message, therefore cannot share its transaction yet: that needs commit
  hooks that run acknowledgment and cache work after the commit.
- `@MapPersistenceErrors` maps a unique violation only as well as the registered
  persistence dialect reads it; `MikroOrmDialect` reads PostgreSQL and SQLite errors.
- The tenant resolver is process-wide: one per process, for each installed copy of this
  package.
- Event payloads are frozen for ordinary access only; see [Domain events](#domain-events).

## License

Dual-licensed under **AGPL-3.0-or-later** or a **Commercial License**. See
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
at the repository root.
