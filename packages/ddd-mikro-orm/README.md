# @cqrs-ddd/mikro-orm

[![npm version](https://img.shields.io/npm/v/@cqrs-ddd/mikro-orm.svg)](https://www.npmjs.com/package/@cqrs-ddd/mikro-orm)
[![License](https://img.shields.io/npm/l/@cqrs-ddd/mikro-orm.svg)](https://www.npmjs.com/package/@cqrs-ddd/mikro-orm)

MikroORM 7 adapters for [`@cqrs-ddd/core`](https://www.npmjs.com/package/@cqrs-ddd/core):
authoritative aggregate loading, version-conditioned writes, a revision-fenced cache
stored in the database, and the `EntitySchema` mapping of `RootEntity`.

`@cqrs-ddd/core` depends on no ORM; this package is where MikroORM enters. It depends
on no framework: it works in a plain Node service and in a NestJS application.

## Contents

- [Installation](#installation)
- [Entity manager source](#entity-manager-source)
- [Loading aggregates](#loading-aggregates)
- [Version-conditioned writes](#version-conditioned-writes)
- [Mapping a root entity](#mapping-a-root-entity)
- [The database cache](#the-database-cache)
- [SQL identifiers](#sql-identifiers)
- [License](#license)

## Installation

```bash
pnpm add @cqrs-ddd/mikro-orm @cqrs-ddd/core @mikro-orm/core
```

Requires Node.js 22 or later. `@cqrs-ddd/core` and `@mikro-orm/core` 7 are peer
dependencies; add the MikroORM driver you use, such as `@mikro-orm/postgresql`.

## Entity manager source

The adapters take an `IEntityManagerSource`, an object with an `em` property, and read
`em` on every operation. A multi-tenant store can therefore hand out the current
tenant's manager; a single-database setup can pass `{ em: orm.em.fork() }`.

## Loading aggregates

A command that mutates an aggregate loads it through core's
`IWriteSideAggregateRepository<TEntity>.findById(id)`. `AggregateRepository` implements
it: `findById()` reads with `{ refresh: true }`, never touches the cache, rehydrates
through the `hydrateFn` you pass, and translates driver failures with core's
`mapPersistenceError`.

```typescript
import { PersistedWrite } from '@cqrs-ddd/core/persistence';
import { AggregateRepository, type IEntityManagerSource, optimisticUpdate } from '@cqrs-ddd/mikro-orm';

export class UpdateUserRepository extends AggregateRepository<UserSnapshot, User, UserSnapshot> {
  constructor(cache: ICache<UserSnapshot>, store: IEntityManagerSource) {
    super(cache, store, User, User.aggregateName, User.fromJSON);
  }

  @PersistedWrite<User>({ cache: { setKey: (user) => `user:${user.id}` } })
  async save(user: User): Promise<UserSnapshot> {
    const snapshot = user.toJSON();
    await optimisticUpdate(this.store.em, User, user, { username: snapshot.username }, 'User');
    return snapshot;
  }
}
```

## Version-conditioned writes

`optimisticUpdate` and `optimisticDelete` write `WHERE id = ? AND version = expected`,
check the affected rows, and raise core's `EntityNotFoundException` or
`ConcurrencyConflictError`. They, and every write whose success triggers acknowledgment
or cache work, call `assertAutocommit(em, operation)` first: a write inside an outer
transaction is rejected before any statement runs, because its success would not mean
durable persistence.

## Mapping a root entity

`rootEntityProperties(columns?)` and `versionProperty(column?)` give the `EntitySchema`
properties every `RootEntity` needs, with timestamps stored as epoch milliseconds
through `UnixTimestampType`. That type throws a `TypeError` for a value with no valid
time instead of storing `NaN`. The properties use `accessor: true`, so MikroORM reads
and writes them through the entity's getters and private setters, and queries use the
public names.

```typescript
export const UserSchema = new EntitySchema<User, AggregateRoot>({
  class: User as any,
  tableName: 'users',
  properties: {
    ...rootEntityProperties(),
    version: versionProperty(),
    email: { type: 'string', unique: true },
  },
});
```

Map a subclass's fields the same way. An entity written without version checks has no
version column; map its inherited `version` as `{ type: 'number', persist: false }`.

## The database cache

`MikroOrmCache(store, { defaultTtlMs?, logger? })` implements core's `IVersionedCache`
with one database row per key; every write is a compare-and-set in its own transaction.
`store` provides `em` and `transactional(work)`. Register `CacheEntrySchema` (or
`createCacheEntrySchema(table)`) with the ORM, and create the table in a migration with
`createCacheTableSql(table?)`, which covers PostgreSQL and SQLite.

Reads bypass the identity map, a reader never deletes an expired row, and a corrupted
payload throws instead of reading as a miss.

## SQL identifiers

`isSqlIdentifier(name, { qualified? })` accepts an unquoted SQL identifier, optionally
schema-qualified. Use it before interpolating a name, such as a tenant schema, into SQL
text, where it cannot be passed as a parameter.

## License

Dual-licensed under **AGPL-3.0-or-later** or a **Commercial License**. See
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
at the repository root.
