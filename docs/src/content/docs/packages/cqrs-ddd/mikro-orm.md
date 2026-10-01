---
title: "@cqrs-ddd/mikro-orm"
description: "MikroORM persistence adapters for @cqrs-ddd/core: authoritative aggregate loading, version-conditioned writes, a revision-fenced cache and root-entity schema mapping."
editUrl: false
---
[![npm version](https://img.shields.io/npm/v/@cqrs-ddd/mikro-orm.svg)](https://www.npmjs.com/package/@cqrs-ddd/mikro-orm)
[![License](https://img.shields.io/npm/l/@cqrs-ddd/mikro-orm.svg)](https://www.npmjs.com/package/@cqrs-ddd/mikro-orm)

MikroORM 7 adapters for [`@cqrs-ddd/core`](https://www.npmjs.com/package/@cqrs-ddd/core):
authoritative aggregate loading, version-conditioned writes, the persistence dialect
that maps unique violations and transient failures, a revision-fenced cache stored in
the database, and the `EntitySchema` mapping of `RootEntity`.

`@cqrs-ddd/core` depends on no ORM; this package is where MikroORM enters. It depends
on no framework: it works in a plain Node service and in a NestJS application.

## Contents

- [Installation](#installation)
- [Entity manager source](#entity-manager-source)
- [Multi-tenant store](#multi-tenant-store)
- [Loading aggregates](#loading-aggregates)
- [Version-conditioned writes](#version-conditioned-writes)
- [Persistence errors](#persistence-errors)
- [Mapping a root entity](#mapping-a-root-entity)
- [The database cache](#the-database-cache)
- [SQL identifiers](#sql-identifiers)
- [License](#license)

## Installation

```bash
pnpm add @cqrs-ddd/mikro-orm @cqrs-ddd/core @mikro-orm/core
```

Requires Node.js 22.17 or later, as MikroORM 7 does. `@cqrs-ddd/core` `^0.4.0` and `@mikro-orm/core` `^7.2.1` are peer
dependencies; add the MikroORM driver you use, such as `@mikro-orm/postgresql`.

Published as an ES module; a CommonJS application loads it with `require()`. Coming from
0.3.x, see [Upgrading from 0.3.x](/nestjs-pipeline/upgrading/from-0-3/).

## Entity manager source

The adapters take an `IEntityManagerSource`, an object with an `em` property, and read
`em` on every operation. A multi-tenant store can therefore hand out the current
tenant's manager; a single-database setup can pass `{ em: orm.em.fork() }`.

## Multi-tenant store

`TenantStore` is that source for a multi-tenant application. `em` and `transactional()`
act on the active tenant, which `tenant()` supplies; `orm(tenant)` returns the initialized
ORM holding its data. Both throw when there is no tenant or it is unknown: the store never
falls back to one.

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';
import { setPersistenceDialect } from '@cqrs-ddd/core/persistence';
import { CacheEntrySchema, MikroOrmDialect, TenantStore } from '@cqrs-ddd/mikro-orm';
import { MikroORM } from '@mikro-orm/core';

const requestTenant = new AsyncLocalStorage<string>();
const orms = new Map<string, MikroORM>();
for (const tenant of ['tenant_a', 'tenant_b']) {
  orms.set(tenant, await MikroORM.init({ ...tenantOptions(tenant), entities: [UserSchema, CacheEntrySchema] }));
}

const store = new TenantStore({
  tenant: () => {
    const tenant = requestTenant.getStore();
    if (!tenant) throw new Error('No tenant in scope.');
    return tenant;
  },
  orm: (tenant) => {
    const orm = orms.get(tenant);
    if (!orm) throw new Error(`Unknown tenant ${tenant}.`);
    return orm;
  },
  isolation: 'database', // one ORM and database per tenant; 'schema': one ORM, a schema per tenant
});

const [first] = orms.values();
if (first) setPersistenceDialect(new MikroOrmDialect(first));

await requestTenant.run('tenant_a', () => store.em.findOne(User, { id }));
await requestTenant.run('tenant_a', () =>
  store.transactional((em) => em.nativeDelete(CacheEntry, { key })),
);
```

With `'schema'` isolation, `orm` returns the same ORM for every tenant and each manager is
forked with `schema: tenant`; validate the tenant against a known list before it reaches
the store, for example with `isSqlIdentifier`.

- `em` reuses the contextual manager (a MikroORM `RequestContext` or an active
  transaction) only when it belongs to the tenant's ORM, configuration, driver and schema,
  and no other tenant used it first. Otherwise it forks one, with the tenant's schema under
  `'schema'` isolation.
- `transactional()` always runs on a fork of its own; a missing or unknown tenant rejects
  it.
- The tenant of each manager it hands out is kept in a `WeakMap`: MikroORM objects are
  never modified.

## Loading aggregates

A command that mutates an aggregate loads it through core's
`IWriteSideAggregateRepository<TEntity>.findById(id)`. `AggregateRepository` implements
it: `findById()` reads with `{ refresh: true }`, never touches the cache, rehydrates
through the `hydrateFn` you pass, and translates driver failures with
`mapPersistenceError`.

```typescript
import type { ICache } from '@cqrs-ddd/core/application';
import { cacheKey, PersistedWrite } from '@cqrs-ddd/core/persistence';
import { AggregateRepository, type IEntityManagerSource, optimisticUpdate } from '@cqrs-ddd/mikro-orm';

export class UpdateUserRepository extends AggregateRepository<UserSnapshot, User, UserSnapshot> {
  constructor(cache: ICache<UserSnapshot>, store: IEntityManagerSource) {
    super(cache, store, User, User.aggregateName, User.fromJSON);
  }

  @PersistedWrite<User>({
    cache: { setKey: (user) => cacheKey(User.aggregateName, { id: user.id }) },
  })
  async save(user: User): Promise<UserSnapshot> {
    const snapshot = user.toJSON();
    await optimisticUpdate(
      this.store.em,
      User,
      user,
      { username: snapshot.username, updatedAt: snapshot.updatedAt },
      'User',
    );
    return snapshot;
  }
}

const users = new UpdateUserRepository(cache, store);
const user = await users.findById(id); // always the database row, never the cache
```

## Version-conditioned writes

`optimisticUpdate` and `optimisticDelete` write `WHERE id = ? AND version = expected`
for any `VersionedAggregate` (an `id`, a `version` and `getExpectedVersion()`, as a
`RootEntity` has),
check the affected rows, and raise core's `EntityNotFoundException` or
`ConcurrencyConflictError`. They, and every write whose success triggers acknowledgment
or cache work, call `assertAutocommit(em, operation)` first: a write inside an outer
transaction is rejected before any statement runs, because its success would not mean
durable persistence.

```typescript
import { ConcurrencyConflictError } from '@cqrs-ddd/core/domain';
import { optimisticDelete, optimisticUpdate } from '@cqrs-ddd/mikro-orm';

// UPDATE users SET department = ?, updated_at = ?, version = <user.version>
//   WHERE id = <user.id> AND version = <user.getExpectedVersion()>
await optimisticUpdate(store.em, User, user, { department: 'Research', updatedAt: user.updatedAt }, 'User');

try {
  await optimisticDelete(store.em, User, staleUser, 'User');
} catch (error) {
  if (error instanceof ConcurrencyConflictError) {
    // error.expectedVersion is the version staleUser was loaded at; reload and retry
  }
  throw error;
}

await store.em.transactional((em) => optimisticUpdate(em, User, user, fields, 'User')); // rejected
```

- `data` holds the columns to write; `version` is set from `entity.version`, so a caller
  lists every other changed column, `updatedAt` included.
- No matching row: a refreshed read tells a missing row (`EntityNotFoundException`) from a
  diverged version (`ConcurrencyConflictError`). More than one matching row throws an
  `Error`.
- Neither function touches the cache, acknowledges the aggregate or publishes events;
  `@PersistedWrite`, `@Cache` and `CommandBaseHandler` do that.

## Persistence errors

`MikroOrmDialect` implements core's `IPersistenceDialect`. Register it once the ORM is
initialized, and `@MapPersistenceErrors` / `@PersistedWrite` map unique violations by
entity property:

```typescript
import { setPersistenceDialect } from '@cqrs-ddd/core/persistence';
import { MikroOrmDialect } from '@cqrs-ddd/mikro-orm';

const orm = await MikroORM.init(options);
setPersistenceDialect(new MikroOrmDialect(orm));

// in a repository
@PersistedWrite<User>({ unique: { email: (user) => new UniqueEmailException(user) } })
async save(user: User): Promise<UserSnapshot> {
  const snapshot = user.toJSON();
  await optimisticUpdate(this.store.em, User, user, { email: snapshot.email }, 'User');
  return snapshot;
}
```

A multi-property constraint is keyed by its declared name, passed as the constraint type:

```typescript
const ROLE_NAME = 'roles_tenant_name_unique';
// schema: uniques: [{ name: ROLE_NAME, properties: ['tenantId', 'name'] }]

@PersistedWrite<Role, typeof ROLE_NAME>({
  unique: { [ROLE_NAME]: (role) => new DuplicateRoleNameException(role) },
})
```

It reads each entity's unique constraints from the ORM metadata: `unique: true` or
`unique: 'name'` on a property, and `uniques: [{ name?, properties }]` on the schema. A
single-property constraint is keyed by that property; a multi-property one by its
`name`, which it must declare. For a `UniqueConstraintViolationException`, PostgreSQL's
reported constraint name is matched against the declared name, or the naming strategy's
`indexName` when none is declared, and SQLite's reported `table.column` list against the
constraint's columns. Anything else yields no match and the original error is rethrown.
Construction fails when two constraints of one entity cover the same columns, because
SQLite could not tell them apart. Declare constraint names in the mapping, never in a
repository.

`mapPersistenceError(error, operation)` is the `otherwise` translator for transient
failures: `isTransientPersistenceError` recognizes retryable PostgreSQL SQLSTATEs
(`40001`, `40P01`, `55P03`, `57P01`–`57P03`, classes `08` and `53`), Node network errors,
`SQLITE_BUSY`/`SQLITE_LOCKED` and timeouts, through the `cause` chain, and wraps them in
core's `TransientOperationError`. Any other error is returned unchanged.

## Mapping a root entity

`rootEntityProperties(columns?)` and `versionProperty(column?)` give the `EntitySchema`
properties every `RootEntity` needs, with timestamps stored as epoch milliseconds
through `UnixTimestampType`. That type reads a `Timestamp`: a `Date`, epoch milliseconds
as a number, a bigint or a numeric string, or a date string. It throws a `TypeError` for a
value with no valid time instead of storing `NaN`. The properties use `accessor: true`, so MikroORM reads
and writes them through the entity's getters and private setters, and queries use the
public names.

```typescript
export const UserSchema = new EntitySchema<User, AggregateRoot>({
  class: User as any,
  tableName: 'users',
  properties: {
    ...rootEntityProperties(),
    version: versionProperty(),
    username: { type: 'string', length: 255, accessor: true },
    department: { type: 'string', length: 255, nullable: true, accessor: true },
    email: { type: 'string', length: 320, unique: true },
  },
});
```

`rootEntityProperties({ createdAt: 'created', updatedAt: 'modified' })` renames the
columns; the defaults are `id`, `created_at` and `updated_at`.

Map a subclass's fields the same way. An entity written without version checks has no
version column; map its inherited `version` as `{ type: 'number', persist: false }`.

## The database cache

`MikroOrmCache(store, { defaultTtlMs?, logger? })` implements core's `IVersionedCache`
with one database row per key; every write is a compare-and-set in its own transaction.
`store` provides `em` and `transactional(work)`. Register `CacheEntrySchema` (or
`createCacheEntrySchema(table)`) with the ORM, and create the table in a migration with
`createCacheTableSql(table?)`, which covers PostgreSQL and SQLite.

```typescript
import { CACHE_TOKEN } from '@cqrs-ddd/core/persistence';
import { createCacheTableSql, MikroOrmCache } from '@cqrs-ddd/mikro-orm';

// once, in a migration
await orm.em.getConnection().execute(createCacheTableSql());

const cache = new MikroOrmCache<UserSnapshot>(store, {
  defaultTtlMs: 5 * 60_000, // 0 never expires
  logger: { warn: (message) => console.warn(message) },
});
const users = new UpdateUserRepository(cache, store);
const reads = new GetUserRepository(cache, store);

// NestJS
{
  provide: CACHE_TOKEN,
  useFactory: (store: TenantStore) => new MikroOrmCache(store, { logger: new Logger('MikroOrmCache') }),
  inject: [STORE],
}
```

- `store.transactional(work)` must run `work` on a manager of its own, never the caller's
  request or transaction manager; `TenantStore` does, and so does
  `{ em: orm.em, transactional: (work) => orm.em.fork().transactional(work) }`.
- With a `TenantStore`, each tenant's cache rows live in that tenant's database or schema.
- Reads bypass the identity map, a reader never deletes an expired row, and a corrupted
  payload throws instead of reading as a miss.
- `set` and `invalidate` throw when their compare-and-set cannot settle after 16 attempts.

## SQL identifiers

`isSqlIdentifier(name, { qualified? })` accepts an unquoted SQL identifier, optionally
schema-qualified. Use it before interpolating a name, such as a tenant schema, into SQL
text, where it cannot be passed as a parameter.

## License

Dual-licensed under **AGPL-3.0-or-later** or a **Commercial License**. See
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
at the repository root.
