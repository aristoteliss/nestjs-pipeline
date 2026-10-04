---
title: "@cqrs-ddd/mikro-orm"
description: "MikroORM persistence adapters για το @cqrs-ddd/core: αυθεντική φόρτωση aggregates, version-conditioned εγγραφές, ένα revision-fenced cache και αντιστοίχιση schema για root entities."
editUrl: false
---

> **Από την έκδοση 0.5.0 το `@cqrs-ddd/mikro-orm` αναπτύσσεται και δημοσιεύεται από το [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs)**, με τεκμηρίωση στο [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/mikro-orm/). Αυτός ο ιστότοπος τεκμηριώνει τη σειρά 0.4.x· οι εκδόσεις 0.1 έως 0.4 παραμένουν στο npm αμετάβλητες.

[![npm version](https://img.shields.io/npm/v/@cqrs-ddd/mikro-orm.svg)](https://www.npmjs.com/package/@cqrs-ddd/mikro-orm)
[![License](https://img.shields.io/npm/l/@cqrs-ddd/mikro-orm.svg)](https://www.npmjs.com/package/@cqrs-ddd/mikro-orm)

MikroORM 7 adapters για το [`@cqrs-ddd/core`](https://www.npmjs.com/package/@cqrs-ddd/core):
αυθεντική φόρτωση aggregates, version-conditioned εγγραφές, το persistence dialect
που αντιστοιχίζει μοναδικές παραβιάσεις και παροδικές (transient) αποτυχίες, ένα revision-fenced cache αποθηκευμένο στη
βάση δεδομένων, και η αντιστοίχιση `EntitySchema` του `RootEntity`.

Το `@cqrs-ddd/core` δεν εξαρτάται από κανένα ORM· αυτό το πακέτο είναι το σημείο εισόδου του MikroORM. Δεν εξαρτάται
από κανένα framework: λειτουργεί σε μια απλή υπηρεσία Node καθώς και σε μια εφαρμογή NestJS.

## Περιεχόμενα <a id="contents"></a>

- [Εγκατάσταση](#installation)
- [Entity manager source](#entity-manager-source)
- [Multi-tenant store](#multi-tenant-store)
- [Φόρτωση aggregates](#loading-aggregates)
- [Version-conditioned εγγραφές](#version-conditioned-writes)
- [Σφάλματα persistence](#persistence-errors)
- [Χαρτογράφηση ενός root entity](#mapping-a-root-entity)
- [Το database cache](#the-database-cache)
- [SQL αναγνωριστικά (identifiers)](#sql-identifiers)
- [Άδεια χρήσης](#license)

## Εγκατάσταση <a id="installation"></a>

```bash
pnpm add @cqrs-ddd/mikro-orm @cqrs-ddd/core @mikro-orm/core
```

Απαιτεί Node.js 22.17 ή νεότερο, όπως απαιτεί και το MikroORM 7. Τα `@cqrs-ddd/core` `^0.4.2` και `@mikro-orm/core` `^7.2.1` είναι peer
dependencies· προσθέστε τον MikroORM driver που χρησιμοποιείτε, όπως `@mikro-orm/postgresql`.

Δημοσιεύεται ως ES module· μια εφαρμογή CommonJS το φορτώνει με `require()`. Εάν προέρχεστε από την έκδοση
0.3.x, δείτε [Αναβάθμιση από 0.3.x](/nestjs-pipeline/upgrading/from-0-3/).

## Entity manager source <a id="entity-manager-source"></a>

Οι adapters δέχονται ένα `IEntityManagerSource`, ένα αντικείμενο με ιδιότητα `em`, και διαβάζουν
το `em` σε κάθε λειτουργία. Ένα multi-tenant store μπορεί επομένως να παρέχει τον manager του τρέχοντος
tenant· μια διάταξη μίας βάσης δεδομένων μπορεί να περάσει `{ em: orm.em.fork() }`.

## Multi-tenant store <a id="multi-tenant-store"></a>

Το `TenantStore` αποτελεί αυτή την πηγή για μια multi-tenant εφαρμογή. Τα `em` και `transactional()`
ενεργούν επί του ενεργού tenant, το οποίο παρέχει η συνάρτηση `tenant()`· το `orm(tenant)` επιστρέφει το αρχικοποιημένο
ORM που περιέχει τα δεδομένα του. Και τα δύο πετούν σφάλμα όταν δεν υπάρχει tenant ή είναι άγνωστο: το store δεν
καταφεύγει ποτέ σε κάποιο default.

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

Με απομόνωση `'schema'`, το `orm` επιστρέφει το ίδιο ORM για κάθε tenant και κάθε manager γίνεται
forked με `schema: tenant`· επικυρώστε το tenant έναντι μιας γνωστής λίστας πριν φτάσει
στο store, για παράδειγμα με το `isSqlIdentifier`.

- Το `em` επαναχρησιμοποιεί τον contextual manager (ένα MikroORM `RequestContext` ή ένα ενεργό
  transaction) μόνο όταν ανήκει στο ORM, στο configuration, στον driver και στο schema του tenant,
  και κανένα άλλο tenant δεν το χρησιμοποίησε πρώτο. Διαφορετικά εκτελεί fork ενός νέου manager, με το schema του tenant υπό
  απομόνωση `'schema'`.
- Το `transactional()` εκτελείται πάντα σε δικό του fork· ένα ελλείπον ή άγνωστο tenant
  το απορρίπτει.
- Το tenant κάθε manager που παρέχει διατηρείται σε ένα `WeakMap`: τα αντικείμενα του MikroORM
  δεν τροποποιούνται ποτέ.

## Φόρτωση aggregates <a id="loading-aggregates"></a>

Ένα command που μεταλλάσσει ένα aggregate το φορτώνει μέσω του
`IWriteSideAggregateRepository<TEntity>.findById(id)` του core. Το `AggregateRepository` το υλοποιεί:
το `findById()` διαβάζει με `{ refresh: true }`, δεν αγγίζει ποτέ το cache, επανενυδατώνει
μέσω της συνάρτησης `hydrateFn` που περνάτε, και μεταφράζει τις αποτυχίες του driver με το
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

## Version-conditioned εγγραφές <a id="version-conditioned-writes"></a>

Τα `optimisticUpdate` και `optimisticDelete` γράφουν με `WHERE id = ? AND version = expected`
για οποιοδήποτε `VersionedAggregate` (που διαθέτει `id`, `version` και `getExpectedVersion()`, όπως διαθέτει
ένα `RootEntity`),
ελέγχουν τις επηρεαζόμενες γραμμές (affected rows), και εγείρουν τα `EntityNotFoundException` ή
`ConcurrencyConflictError` του core. Αυτά, καθώς και κάθε εγγραφή της οποίας η επιτυχία ενεργοποιεί acknowledgment
ή εργασίες cache, καλούν πρώτα το `assertAutocommit(em, operation)`: μια εγγραφή εντός εξωτερικού
transaction απορρίπτεται πριν εκτελεστεί οποιοδήποτε statement, επειδή η επιτυχία της δεν θα σήμαινε
ανθεκτικό (durable) persistence.

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

- Το `data` περιέχει τις στήλες προς εγγραφή· το `version` ορίζεται από το `entity.version`, επομένως ο καλών
  παραθέτει ρητά κάθε άλλη τροποποιημένη στήλη, συμπεριλαμβανομένου του `updatedAt`.
- Καμία γραμμή δεν ταιριάζει: μια ανανεωμένη ανάγνωση διακρίνει μια ελλείπουσα γραμμή (`EntityNotFoundException`) από μια
  αποκλίνουσα έκδοση (`ConcurrencyConflictError`). Περισσότερες από μία ταιριαστές γραμμές πετούν
  `Error`.
- Καμία από τις δύο συναρτήσεις δεν αγγίζει το cache, δεν εκτελεί acknowledgment στο aggregate ούτε δημοσιεύει συμβάντα·
  τα `@PersistedWrite`, `@Cache` και `CommandBaseHandler` αναλαμβάνουν αυτά τα καθήκοντα.

## Σφάλματα persistence <a id="persistence-errors"></a>

Το `MikroOrmDialect` υλοποιεί το `IPersistenceDialect` του core. Καταχωρίστε το μόλις αρχικοποιηθεί το ORM,
και τα `@MapPersistenceErrors` / `@PersistedWrite` θα αντιστοιχίζουν μοναδικές παραβιάσεις ανά
ιδιότητα entity:

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

Ένας περιορισμός πολλαπλών ιδιοτήτων έχει ως κλειδί το δηλωμένο όνομά του, το οποίο περνά ως τύπος περιορισμού:

```typescript
const ROLE_NAME = 'roles_tenant_name_unique';
// schema: uniques: [{ name: ROLE_NAME, properties: ['tenantId', 'name'] }]

@PersistedWrite<Role, typeof ROLE_NAME>({
  unique: { [ROLE_NAME]: (role) => new DuplicateRoleNameException(role) },
})
```

Διαβάζει τους μοναδικούς περιορισμούς κάθε entity από τα metadata του ORM: `unique: true` ή
`unique: 'name'` σε μια ιδιότητα, και `uniques: [{ name?, properties }]` στο schema. Ένας
περιορισμός μίας ιδιότητας έχει ως κλειδί αυτή την ιδιότητα· ένας πολλαπλών ιδιοτήτων το
`name` του, το οποίο πρέπει να δηλώνει. Για ένα `UniqueConstraintViolationException`, το αναφερόμενο όνομα περιορισμού της PostgreSQL
αντιστοιχίζεται με το δηλωμένο όνομα, ή με το `indexName` της στρατηγικής ονοματοδοσίας
όταν δεν έχει δηλωθεί κανένα, ενώ η αναφερόμενη λίστα `table.column` του SQLite αντιστοιχίζεται με τις
στήλες του περιορισμού. Οτιδήποτε άλλο δεν αποφέρει ταύτιση και το αρχικό σφάλμα επανεκπέμπεται.
Η κατασκευή αποτυγχάνει όταν δύο περιορισμοί ενός entity καλύπτουν τις ίδιες στήλες, επειδή
το SQLite δεν θα μπορούσε να τους ξεχωρίσει. Δηλώστε τα ονόματα περιορισμών στη χαρτογράφηση (mapping),
ποτέ σε ένα repository.

Το `mapPersistenceError(error, operation)` είναι ο μεταφραστής `otherwise` για παροδικές (transient)
αποτυχίες: το `isTransientPersistenceError` αναγνωρίζει επαναλήψιμα SQLSTATEs της PostgreSQL
(`40001`, `40P01`, `55P03`, `57P01`–`57P03`, κλάσεις `08` και `53`), σφάλματα δικτύου της Node,
`SQLITE_BUSY`/`SQLITE_LOCKED` και timeouts, μέσω της αλυσίδας `cause`, και τα τυλίγει στο
`TransientOperationError` του core. Οποιοδήποτε άλλο σφάλμα επιστρέφεται αμετάβλητο.

## Χαρτογράφηση ενός root entity <a id="mapping-a-root-entity"></a>

Τα `rootEntityProperties(columns?)` και `versionProperty(column?)` παρέχουν τις ιδιότητες `EntitySchema`
που χρειάζεται κάθε `RootEntity`, με τα timestamps να αποθηκεύονται ως epoch milliseconds
μέσω του `UnixTimestampType`. Αυτός ο τύπος διαβάζει ένα `Timestamp`: ένα `Date`, epoch milliseconds
ως αριθμό, ένα bigint ή αριθμητική συμβολοσειρά, ή μια συμβολοσειρά ημερομηνίας. Πετά `TypeError` για
τιμή χωρίς έγκυρο χρόνο αντί να αποθηκεύει `NaN`. Οι ιδιότητες χρησιμοποιούν `accessor: true`, ώστε το MikroORM να τις διαβάζει
και να τις γράφει μέσω των getters και των ιδιωτικών setters του entity, και τα queries να χρησιμοποιούν τα
δημόσια ονόματα.

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

Το `rootEntityProperties({ createdAt: 'created', updatedAt: 'modified' })` μετονομάζει τις
στήλες· οι προεπιλογές είναι `id`, `created_at` και `updated_at`.

Χαρτογραφήστε τα πεδία μιας υποκλάσης με τον ίδιο τρόπο. Ένα entity που γράφεται χωρίς ελέγχους έκδοσης δεν έχει
στήλη έκδοσης· χαρτογραφήστε το κληρονομημένο `version` του ως `{ type: 'number', persist: false }`.

## Το database cache <a id="the-database-cache"></a>

Το `MikroOrmCache(store, { defaultTtlMs?, logger? })` υλοποιεί το `IVersionedCache` του core
με μία γραμμή βάσης δεδομένων ανά κλειδί· κάθε εγγραφή είναι ένα compare-and-set στο δικό της transaction.
Το `store` παρέχει τα `em` και `transactional(work)`. Καταχωρίστε το `CacheEntrySchema` (ή
`createCacheEntrySchema(table)`) στο ORM, και δημιουργήστε τον πίνακα σε migration με το
`createCacheTableSql(table?)`, το οποίο καλύπτει PostgreSQL και SQLite.

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

- Το `store.transactional(work)` πρέπει να εκτελεί το `work` σε δικό του manager, ποτέ στον
  manager του αιτήματος ή του transaction του καλούντος· το `TenantStore` το κάνει, όπως και το
  `{ em: orm.em, transactional: (work) => orm.em.fork().transactional(work) }`.
- Με ένα `TenantStore`, οι γραμμές cache κάθε tenant βρίσκονται στη βάση δεδομένων ή στο schema αυτού του tenant.
- Οι αναγνώσεις παρακάμπτουν το identity map, ένας αναγνώστης δεν διαγράφει ποτέ μια ληγμένη γραμμή, και ένα κατεστραμμένο
  payload πετά σφάλμα αντί να αναγνωσθεί ως miss.
- Τα `set` και `invalidate` πετούν σφάλμα όταν το compare-and-set τους δεν μπορεί να επιλυθεί μετά από 16 προσπάθειες.

## SQL αναγνωριστικά (identifiers) <a id="sql-identifiers"></a>

Το `isSqlIdentifier(name, { qualified? })` δέχεται ένα αναγνωριστικό SQL χωρίς εισαγωγικά, προαιρετικά
με πρόθεμα schema. Χρησιμοποιήστε το πριν από την παρεμβολή ενός ονόματος, όπως ενός tenant schema, σε κείμενο
SQL, όπου δεν μπορεί να περαστεί ως παράμετρος.

## Άδεια χρήσης <a id="license"></a>

Διπλή άδεια υπό **AGPL-3.0-or-later** ή **Commercial License**. Δείτε τα
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) και
[`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
στη ρίζα του repository.
