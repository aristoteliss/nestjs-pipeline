---
title: "@nestjs-pipeline/cache"
description: "Caching behavior για το NestJS pipeline — cache-manager v7 βασισμένο στο Keyv με pluggable stores (memory, redis, memcache, sqlite, postgres)."
editUrl: false
---

> **Από την έκδοση 0.5.0 αυτό το πακέτο συνεχίζει ως [`@cqrs-ddd/pipeline-cache`](https://www.npmjs.com/package/@cqrs-ddd/pipeline-cache).** Ο κώδικας, τα issues και
> τα releases βρίσκονται στο [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs), με τεκμηρίωση στο [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-cache/).
> Οι εφαρμογές NestJS προσθέτουν το [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs). Οι εκδόσεις 0.1 έως 0.4 του
> `@nestjs-pipeline/cache` παραμένουν στο npm αμετάβλητες, και η γραμμή 0.4.x λαμβάνει μόνο διορθώσεις (fixes).

## Αρχιτεκτονικός ρόλος <a id="architectural-role"></a>

Αυτό το επαναχρησιμοποιήσιμο πακέτο αποθηκεύει στην cache τα τελικά αποτελέσματα των queries της εφαρμογής, συμπεριλαμβανομένων δαπανηρών συναθροίσεων (aggregations), read models που συνδυάζουν repositories και σύνθεσης εξωτερικών υπηρεσιών.
Συμπληρώνει τις repository snapshot/read-through caches· δεν αντικαθίσταται από αυτές απλώς επειδή ένα συγκεκριμένο παράδειγμα χρησιμοποιεί επί του παρόντος repository caching. Επιλέξτε το επίπεδο που κατέχει το αποτέλεσμα και ορίστε τις εξαρτήσεις του, το εύρος ασφαλείας (security scope) και τη φρεσκάδα (freshness) του. Η χρήση και των δύο επιπέδων είναι προαιρετική, και η ακύρωση (invalidation) δεν διαμοιράζεται αυτόματα.

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/cache.svg)](https://www.npmjs.com/package/@nestjs-pipeline/cache)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/cache.svg)](https://www.npmjs.com/package/@nestjs-pipeline/cache)

Caching behavior για το `@nestjs-pipeline/core`, βασισμένο στο [cache-manager](https://www.npmjs.com/package/cache-manager) v7 πάνω από το [Keyv](https://keyv.org/). Αποθηκεύστε διαφανώς στην cache τα αποτελέσματα των queries — δηλωτικά, με μηδενικές αλλαγές στον κώδικα του handler σας — και επιλέξτε οποιοδήποτε backend: **memory** (προεπιλογή), **redis**, **memcache**, **sqlite**, ή **postgres**.

---

## Πίνακας Περιεχομένων <a id="table-of-contents"></a>

- [Γιατί](#why)
- [Εγκατάσταση](#installation)
- [Γρήγορη εκκίνηση](#quick-start)
  - [1. Δήλωση του cache provider και behavior](#1-register-the-cache-provider-and-behavior)
  - [2. Σύνδεση του behavior σε queries](#2-attach-the-behavior-to-queries)
  - [3. Ρύθμιση ανά handler](#3-configure-per-handler)
- [Επιλογή Store](#choosing-a-store)
  - [Memory (προεπιλογή)](#memory-default)
  - [Redis](#redis)
  - [Memcache](#memcache)
  - [SQLite](#sqlite)
  - [Postgres](#postgres)
  - [Tiered (πολυεπίπεδα) caches](#tiered-multi-layer-caches)
  - [Escape hatches](#escape-hatches)
- [Πώς λειτουργεί](#how-it-works)
  - [Τι αποθηκεύεται στην cache](#what-gets-cached)
  - [Σφάλματα store](#store-errors)
  - [Cache keys](#cache-keys)
  - [Tenant partitioning](#tenant-partitioning)
  - [Κοινή χρήση key factory μέσω module defaults](#sharing-a-key-factory-through-module-defaults)
  - [Υπό όρους caching](#conditional-caching)
  - [Επίλυση επιλογών](#options-resolution)
  - [Context items](#context-items)
- [Ρύθμιση παραμέτρων](#configuration)
- [Behavior Contract & Bootstrap Diagnostics](#behavior-contract--bootstrap-diagnostics)
  - [Περιορισμοί σειράς εκτέλεσης](#ordering-constraints)
  - [Invariants επικύρωσης](#validation-invariants)
- [Προσαρμοσμένος Logger](#custom-logger)
- [Αναφορά API](#api-reference)
- [Άδεια χρήσης](#license)

---

## Γιατί <a id="why"></a>

Τα queries με μεγάλο όγκο αναγνώσεων (read-heavy queries) συχνά ζητούν επανειλημμένα τα ίδια δεδομένα. Το `@nestjs-pipeline/cache` προσθέτει ένα διαφανές caching layer στο CQRS pipeline σας χωρίς να δεσμεύει τη λογική του caching με τον επιχειρησιακό σας κώδικα. Αποτελεί ένα λεπτό, type-safe behavior πάνω από το [cache-manager](https://github.com/jaredwray/cacheable) v7 + [Keyv](https://keyv.org/), παρέχοντας tiered caches και μια συνεπή διεπαφή σε κάθε υποστηριζόμενο backend.

---

## Εγκατάσταση <a id="installation"></a>

```bash
pnpm add @cqrs-ddd/pipeline-cache @cqrs-ddd/nestjs @cqrs-ddd/pipeline @nestjs/cqrs cache-manager keyv
```

**Peer dependencies:**

```bash
pnpm add @nestjs/common @nestjs/core reflect-metadata
```

Απαιτεί Node.js 22.12 ή νεότερο, `@nestjs/common` `^12.1.0`,
`cache-manager` `^7.0.0` και `keyv` `^5.0.0`.

**Προαιρετικοί store adapters** — εγκαταστήστε μόνο αυτόν(ους) που χρησιμοποιείτε:

```bash
pnpm add @keyv/redis      # type: 'redis'
pnpm add @keyv/memcache   # type: 'memcache'
pnpm add @keyv/sqlite     # type: 'sqlite'
pnpm add @keyv/postgres   # type: 'postgres'
```

> Το `memory` store δεν χρειάζεται adapter — παρέχεται μαζί με το Keyv. Τα υπόλοιπα backends φορτώνονται lazily· χρειάζεστε το αντίστοιχο πακέτο `@keyv/*` μόνο όταν επιλέξετε πραγματικά αυτόν τον τύπο store.

---

## Γρήγορη εκκίνηση <a id="quick-start"></a>

### 1. Δήλωση του cache provider και behavior <a id="1-register-the-cache-provider-and-behavior"></a>

Στο feature module σας (π.χ. `ReliabilityModule`), κατασκευάστε την cache χρησιμοποιώντας το `buildCache()` και δηλώστε το `CacheBehavior` ως singleton provider:

```typescript
import { Module, Logger } from '@nestjs/common';
import { PipelineModule } from '@cqrs-ddd/nestjs';
import { buildCache, CacheBehavior } from '@cqrs-ddd/pipeline-cache';
import type { Cache } from 'cache-manager';

export const RESPONSE_CACHE = Symbol('RESPONSE_CACHE');

@Module({
  imports: [
    PipelineModule.forRoot(),
  ],
  providers: [
    {
      provide: RESPONSE_CACHE,
      useFactory: () =>
        buildCache({
          store: process.env.REDIS_URL
            ? { type: 'redis', url: process.env.REDIS_URL }
            : { type: 'memory' },
          ttl: 30_000,
        }),
    },
    {
      provide: CacheBehavior,
      inject: [RESPONSE_CACHE],
      useFactory: (cache: Cache) =>
        new CacheBehavior(cache, undefined, new Logger(CacheBehavior.name)),
    },
  ],
})
export class ReliabilityModule {}
```

Μια cache που κατασκευάζεται από το `store` αποσυνδέεται κατά τον τερματισμό της εφαρμογής μέσω Nest lifecycle hooks.

### 2. Σύνδεση του behavior σε queries <a id="2-attach-the-behavior-to-queries"></a>

Διακοσμήστε τα queries με το `@UsePipeline` και ρυθμίστε την παραγωγή κλειδιού (key derivation) χρησιμοποιώντας το `cache()`:

### 3. Ρύθμιση ανά handler <a id="3-configure-per-handler"></a>

Αυτό το απόσπασμα προστατευμένου query προϋποθέτει ότι το pipeline διαθέτει tenant (`context.tenantId`, δείτε [Tenant partitioning](#tenant-partitioning)) και ότι ένα προγενέστερο behavior ορίζει τα `currentUserId` και `capabilityVersion` στο `context.items` πριν εκτελεστεί το caching. Ο handler εξακολουθεί να εκτελεί έλεγχο εξουσιοδότησης σε επίπεδο entity και πεδίων (field authorization) σε περιπτώσεις cache miss.

```ts
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import { cache, createPartitionedCacheKeyFactory } from '@nestjs-pipeline/cache';

@QueryHandler(GetUserQuery)
@UsePipeline(cache({
  ttl: 60_000,
  key: createPartitionedCacheKeyFactory({
    principal: (ctx) => ctx.items.get('currentUserId') as string | undefined,
    scope: (ctx) => {
      const scope = ctx.items.get('capabilityVersion');
      if (typeof scope !== 'string' || !scope.trim()) {
        throw new Error('Missing capability version');
      }
      return scope;
    },
  }),
}))
export class GetUserHandler implements IQueryHandler<GetUserQuery> {
  async execute(query: GetUserQuery) {
    // ...δαπανηρή ανάγνωση; αποτέλεσμα στην cache για 60s
  }
}
```

> Χρησιμοποιήστε το `cache({ inheritModuleKey: true })` μόνο όταν το module παρέχει το key factory.
> Η ακατέργαστη μορφή tuple `@UsePipeline([CacheBehavior, { ... }])` εξακολουθεί να υποστηρίζεται ως escape hatch.

---

## Επιλογή Store <a id="choosing-a-store"></a>

Το backend επιλέγεται μία φορά, κατά τη δήλωση του module. Οι επιλογές ανά handler (`ttl`, `key`, `condition`, `kinds`) είναι ανεξάρτητες από το store που επιλέγετε.

### Memory (προεπιλογή) <a id="memory-default"></a>

```ts
CacheModule.forRoot({ ttl: 30_000 });
// ισοδύναμο με:
CacheModule.forRoot({ store: { type: 'memory' }, ttl: 30_000 });
```

### Redis <a id="redis"></a>

```ts
CacheModule.forRoot({
  store: { type: 'redis', url: 'redis://localhost:6379' },
  ttl: 60_000,
});
```

### Memcache <a id="memcache"></a>

```ts
CacheModule.forRoot({
  store: { type: 'memcache', url: 'localhost:11211' },
});
```

### SQLite <a id="sqlite"></a>

```ts
CacheModule.forRoot({
  store: { type: 'sqlite', url: 'sqlite://./cache.sqlite' },
});
```

### Postgres <a id="postgres"></a>

```ts
CacheModule.forRoot({
  store: {
    type: 'postgres',
    url: 'postgresql://user:pass@localhost:5432/db',
    options: { table: 'cache' },
  },
});
```

### Tiered (πολυεπίπεδα) caches <a id="tiered-multi-layer-caches"></a>

Παρέχετε έναν πίνακα από stores — ελέγχονται με τη σειρά (το ταχύτερο πρώτο) και οι εγγραφές διαχέονται σε κάθε επίπεδο:

```ts
CacheModule.forRoot({
  store: [
    { type: 'memory', ttl: 5_000 }, // L1: in-process
    { type: 'redis', url: 'redis://localhost:6379' }, // L2: shared
  ],
});
```

### Escape hatches <a id="escape-hatches"></a>

Για πλήρη έλεγχο, περάστε ένα προκατασκευασμένο στιγμιότυπο `cache-manager` ή τα δικά σας `Keyv` stores:

```ts
import { createCache } from 'cache-manager';
import { Keyv } from 'keyv';
import KeyvRedis from '@keyv/redis';

// Προκατασκευασμένα Keyv stores
CacheModule.forRoot({
  stores: [new Keyv({ store: new KeyvRedis('redis://localhost:6379') })],
});

// Πλήρως προκατασκευασμένη cache
CacheModule.forRoot({ cache: createCache({ stores: [new Keyv()] }) });
```

| Επιλογή | Προτεραιότητα | Περιγραφή |
| ------ | ---------- | ----------- |
| `cache` | 1 (υψηλότερη) | Ένα έτοιμο στιγμιότυπο `cache-manager`. |
| `stores` | 2 | Προκατασκευασμένα `Keyv[]` (tiered, υψηλότερη προτεραιότητα πρώτα). |
| `store` | 3 | Δηλωτική ρύθμιση — ένα μεμονωμένο store ή πίνακας. |
| _(κανένα)_ | 4 (εφεδρικό) | In-memory `Keyv`. |

---

## Πώς λειτουργεί <a id="how-it-works"></a>

### Τι αποθηκεύεται στην cache <a id="what-gets-cached"></a>

Μόνο τα **query** αιτήματα αποθηκεύονται στην cache από προεπιλογή — τα commands και τα events διέρχονται πάντοτε ανεπηρέαστα. Παρακάμψτε το με την επιλογή `kinds`. Σε cache miss, αποτελέσματα `null` και `undefined` δεν εγγράφονται. Ένα hit επιστρέφει απευθείας την τιμή από εκείνη την αναζήτηση. Το `CacheBehavior` δεν χρησιμοποιεί `cache-manager.wrap()` ή background refresh, επειδή ένα callback ανανέωσης θα εκτελούσε εκ νέου κάθε behavior και παρενέργεια που βρίσκεται ένθετη μετά το cache behavior.

Τα αποτελέσματα στην cache είναι τιμές JSON. Σε ένα miss, το behavior αποθηκεύει τη μορφή JSON του αποτελέσματος του handler και επιστρέφει αυτήν την ίδια μορφή, ώστε ένα miss και ένα μεταγενέστερο hit να έχουν την ίδια δομή: ένα `Date` είναι ένα ISO string και ένα class instance ένα απλό αντικείμενο και στις δύο περιπτώσεις. Επιστρέφετε απλά JSON δεδομένα (ένα snapshot ή read model) από cached handlers. Ένα αποτέλεσμα χωρίς JSON αναπαράσταση (ένα `bigint`, ένας κύκλος) επιστρέφεται αμετάβλητο, δεν αποθηκεύεται στην cache, και καταγράφεται ως προειδοποίηση στα logs.

### Σφάλματα store <a id="store-errors"></a>

Τα stores που δημιουργούνται δηλωτικά χρησιμοποιούν `throwOnErrors: true`. Τα προκατασκευασμένα `cache` και `stores` παραμένουν στην κυριότητα του καλούντος και μεταβιβάζονται χωρίς να αλλάξουν οι ρυθμίσεις σφαλμάτων τους. Το behavior μπορεί να διαχειριστεί μόνο αποτυχίες που εμφανίζουν αυτές οι υλοποιήσεις· δεν μπορεί να ανιχνεύσει backend σφάλματα που αποσιωπούνται από αυτές.

Το `CacheBehavior` διαθέτει μια συνεπή πολιτική αποτυχιών ανεξάρτητα από το inject-αρισμένο `cache-manager` ή την προσαρμοσμένη υλοποίηση cache. Από προεπιλογή, `failOpen: true`:

- μια ανάγνωση cache που εγείρει σφάλμα καταγράφεται στα logs, σημαίνεται ως `cache.hit = false`, και παρακάμπτει την εγγραφή στην cache για αυτή την εκτέλεση· το αποτέλεσμα του handler εξακολουθεί να χρησιμοποιεί την ίδια μετατροπή JSON όπως σε ένα κανονικό miss·
- μια εγγραφή στην cache που εγείρει σφάλμα καταγράφεται στα logs και επιστρέφεται το επιτυχές αποτέλεσμα του handler.

Ορίστε `failOpen: false` για να καταγράφετε και να διαδίδετε οποιοδήποτε σφάλμα store. Αυτή η αυστηρή λειτουργία μπορεί να μετατρέψει μια επιτυχή εκτέλεση του επόμενου handler σε απορριφθέν αίτημα όταν αποτυγχάνει η επακόλουθη εγγραφή στην cache, επομένως ενδείκνυται καλύτερα για περιπτώσεις όπου η διαθεσιμότητα της cache αποτελεί μέρος του συμβολαίου της λειτουργίας. Σφάλματα από το condition, το key factory ή τον επόμενο handler διαδίδονται πάντοτε αμετάβλητα.

### Cache keys <a id="cache-keys"></a>

Ο helper παράγει `cache:v3:<tenant>:<principal>:<scope>:<requestName>:<sha256>`, με escaped τμήματα και την κωδικοποίηση απόντος τμήματος που παρέχεται από το core `joinKeySegments`. Αντιμετωπίστε το παραγόμενο κλειδί ως αδιαφανές (opaque). Η αλλαγή από παλαιότερες μορφές προκαλεί cold cache· αφήστε τις παλιές εγγραφές να λήξουν ή αφαιρέστε το namespace τους.

Το `key` είναι **υποχρεωτικό**. Σκοπίμως δεν υπάρχει προεπιλογή.

Η προηγούμενη προεπιλογή ενσωμάτωνε το `context.correlationId`, το οποίο είναι μοναδικό ανά αίτημα. Αυτό έκανε την cache να εγγράφει μια καταχώριση για κάθε query και να μην διαβάζει ποτέ καμία πίσω — δύο επιπλέον round-trips και απεριόριστη αύξηση του store για μηδενικό hit rate. Ούτε αποτελούσε όριο εξουσιοδότησης: ένας client μπορεί να στείλει το δικό του correlation ID, και οι ένθετες εκτελέσεις σκόπιμα κληρονομούν ένα. Τα correlation metadata δεν καθιερώνουν απομόνωση principal ή δικαιωμάτων, καθώς τα correlation IDs μπορούν να παρασχεθούν ή να επαναχρησιμοποιηθούν. Τα cache hits παρακάμπτουν τον handler, συμπεριλαμβανομένων των ελέγχων entity/field. Για προστατευμένα αποτελέσματα, παρέχετε ένα ρητό `key` που καλύπτει tenant, τύπο/ID principal, ενεργό πεδίο δικαιωμάτων (effective permission scope) και εξαρτήσεις απάντησης· αποτύχετε κλειστά (fail closed) εάν απουσιάζει το απαιτούμενο context. Ρυθμίστε την ακύρωση/φρεσκάδα (invalidation/freshness) για αυτό το αποτέλεσμα ξεχωριστά. Ένα type-level authorization behavior έξω από την cache δεν αναπαράγει κάθε έλεγχο οντότητας.

Χρησιμοποιήστε το `createPartitionedCacheKeyFactory`. Διαμερίζει κάθε διάσταση που μπορεί να αλλάξει μια εξουσιοδοτημένη απάντηση, κάνει escape κάθε τμήμα ώστε το `a:b` + `c` να μην μπορεί να συγκρουστεί με το `a` + `b:c`, και αποτυγχάνει κλειστά με `MissingCachePartitionError` όταν απουσιάζει μια απαιτούμενη διάσταση:

```typescript
import { createPartitionedCacheKeyFactory } from '@nestjs-pipeline/cache';

@UsePipeline([CacheBehavior, {
  key: createPartitionedCacheKeyFactory({
    principal: (ctx) => ctx.items.get('currentUserId') as string | undefined,
    // Συμπεριλάβετε σύνοψη ρόλων (role-set hash) ή capability version, διαφορετικά ένας
    // principal του οποίου τα δικαιώματα ανακλήθηκαν θα συνεχίσει να διαβάζει την παλιά
    // απάντηση μέχρι να λήξει.
    scope: (ctx) => ctx.items.get('capabilityVersion') as string | undefined,
  }),
}])
export class GetUsersHandler {}
```

Για πραγματικά δημόσιες απαντήσεις που είναι πανομοιότυπες για κάθε καλούντα:

```typescript
createPartitionedCacheKeyFactory({
  principal: () => 'public',
  requirePrincipal: false,
  requireTenant: false,
  requireScope: false,
});
```

Το permission scope απαιτείται από προεπιλογή: η δημιουργία ενός factory χωρίς resolver για το `scope` εγείρει σφάλμα εκτός εάν το `requireScope: false` δηλώνει ότι οι απαντήσεις δεν εξαρτώνται από τα δικαιώματα του καλούντος, και ένας resolver που δεν επιστρέφει τίποτα εγείρει `MissingCachePartitionError` κατά τον χρόνο εκτέλεσης του αιτήματος.

Οι επιλογές tenant είναι οι ίδιες για τα key factories της cache, του idempotency και του rate-limit (`TenantPartitionOptions` του `@nestjs-pipeline/core`): το `includeTenant` (προεπιλογή `true`) τοποθετεί το tenant στο κλειδί, και το `requireTenant` (προεπιλογή: `includeTenant`) απορρίπτει την απουσία του. Τα σφάλματα διαμερισμού των τριών πακέτων κληρονομούν από το `MissingPartitionError`.

Το payload του αιτήματος περιλαμβάνεται ως σύνοψη SHA-256 (digest), ώστε τα μυστικά και οι όροι αναζήτησης να παραμένουν εκτός των καταχωρίσεων κλειδιών Redis. Το digest κατασκευάζεται με το `stableStringify` από το `@cqrs-ddd/safe-stringify` (δεν επανεξάγεται από αυτό το πακέτο), το οποίο ταξινομεί αναδρομικά τα κλειδιά αντικειμένων ώστε δομικά ίσα payloads να αντιστοιχίζονται στην ίδια εγγραφή. Αποδέχεται `null`, booleans, πεπερασμένους αριθμούς, strings, arrays, αντικείμενα τύπου record, και έγκυρες ημερομηνίες (μετατρέπονται σε ISO strings). Περιπτώσεις απώλειας εγγενούς JSON όπως `Map`, `Set`, `RegExp`, `Error`, δυαδικές τιμές, μη πεπερασμένοι αριθμοί, `undefined`, bigint, συναρτήσεις, symbols, και κύκλοι απορρίπτονται αντί να διακινδυνεύεται μια σύγκρουση (collision).

Επειδή ένα cache hit επιστρέφει πριν εκτελεστεί ο handler, παρακάμπτει επίσης οποιονδήποτε έλεγχο εξουσιοδότησης σε επίπεδο οντότητας και φιλτράρισμα πεδίων εκτελεί ο handler. Γι' αυτό το λόγο το tenant, ο principal και το scope απαιτούνται όλα από τον helper από προεπιλογή. Εξαιρεθείτε ρητά από το καθένα με `requireTenant: false`, `requirePrincipal: false` ή `requireScope: false`.

Ένα `MissingCachePartitionError` που συλλαμβάνεται κατονομάζει τη διάσταση που λείπει:

```typescript
import { MissingCachePartitionError } from '@nestjs-pipeline/cache';

if (error instanceof MissingCachePartitionError) {
  // error.name === 'MissingCachePartitionError'; αντιστοιχίστε το σε 401/403 στο filter σας
}
```

### Tenant partitioning <a id="tenant-partitioning"></a>

Το τμήμα tenant του κλειδιού είναι το `context.tenantId`, όχι μια τιμή στο `context.items`. Το pipeline το λαμβάνει από την πηγή tenant που έχει διαμορφωθεί στο `PipelineModule.forRoot()`· το πακέτο cache δεν εισάγει το `@nestjs-pipeline/tenant`:

```typescript
import { Module } from '@nestjs/common';
import { PipelineModule } from '@nestjs-pipeline/core';
import { tenantSource } from '@nestjs-pipeline/tenant';
import { CacheBehavior, CacheModule } from '@nestjs-pipeline/cache';

@Module({
  imports: [
    CacheModule.forRoot({ ttl: 30_000 }),
    PipelineModule.forRoot({
      sources: { tenantId: tenantSource },
      behaviors: [CacheBehavior],
    }),
  ],
})
export class AppModule {}
```

Για single-tenant εγκατάσταση, παραλείψτε το tenant από το κλειδί:

```typescript
createPartitionedCacheKeyFactory({
  includeTenant: false,
  principal: (ctx) => ctx.items.get('currentUserId') as string | undefined,
  scope: (ctx) => ctx.items.get('capabilityVersion') as string | undefined,
});
```

Το correlation id δεν αποτελεί ποτέ μέρος του κλειδιού (δείτε παραπάνω).

### Κοινή χρήση key factory μέσω module defaults <a id="sharing-a-key-factory-through-module-defaults"></a>

Ορίστε το factory μία φορά στα `defaults` και επιλέξτε το ανά handler με `inheritModuleKey: true`· το `cache()` απορρίπτει μια κλήση που δεν έχει ούτε `key` ούτε `inheritModuleKey` κατά το compile time:

```typescript
CacheModule.forRoot({
  ttl: 30_000,
  defaults: {
    key: createPartitionedCacheKeyFactory({
      principal: (ctx) => ctx.items.get('currentUserId') as string | undefined,
      scope: (ctx) => ctx.items.get('capabilityVersion') as string | undefined,
    }),
  },
});

@QueryHandler(ListOrdersQuery)
@UsePipeline(cache({ inheritModuleKey: true, ttl: 10_000 }))
export class ListOrdersHandler {}
```

### Υπό όρους caching <a id="conditional-caching"></a>

Το `condition` επιστρέφει `false` για να παρακάμψει την cache για ένα συγκεκριμένο αίτημα:

```typescript
@UsePipeline(cache({
  inheritModuleKey: true,
  condition: (ctx) => (ctx.request as { fresh?: boolean }).fresh !== true,
}))
export class GetReportHandler {}
```

### Επίλυση επιλογών <a id="options-resolution"></a>

Οι ισχύουσες επιλογές για έναν handler επιλύονται ως εξής:

1. Καθολικές προεπιλογές module που συνδέονται μέσω `CacheModule.forRoot({ ttl, defaults })`.
2. Επιλογές ανά handler από το `@UsePipeline([CacheBehavior, { ... }])`, συγχωνευμένες επιφανειακά (shallow-merged) από πάνω (υπερισχύουν τα κλειδιά του handler).

### Context items <a id="context-items"></a>

Το behavior καταγράφει διαγνωστικά στοιχεία στο `context.items`:

| Item Token | Τύπος | Σημασία |
| ---------- | ---- | ------- |
| `CACHE_HIT_ITEM` | `boolean` | Εάν το αίτημα εξυπηρετήθηκε από την cache. |
| `CACHE_KEY_ITEM` | `string` | Το επιλυμένο cache key. |

Εξάγονται ως μοναδικές σταθερές `Symbol` (`CACHE_HIT_ITEM` και `CACHE_KEY_ITEM`) για την αποφυγή συγκρούσεων κλειδιών στο `context.items`. Τα `CACHE_HIT_ITEM_TOKEN` και `CACHE_KEY_ITEM_TOKEN` είναι typed tokens πάνω στα ίδια κλειδιά για χρήση με τα `getPipelineItem` / `requirePipelineItem` από το `@nestjs-pipeline/core`.

Το `buildCacheAttributes(context)` μετατρέπει τη σημαία hit στο attribute `cache.hit`. Χρησιμοποιήστε το για attributes σε spans μέσω του `AttributesBehavior` του [`@nestjs-pipeline/opentelemetry`](/nestjs-pipeline/packages/nestjs-pipeline/opentelemetry/#attributes-from-other-behaviors), για audit `metadata`, ή σε μια γραμμή log· δεν απαιτεί πακέτο τηλεμετρίας. Επιστρέφει `{}` όταν το behavior δεν εκτελέστηκε, ποτέ ένα κατασκευασμένο miss, και δεν περιλαμβάνει ποτέ το κλειδί.

---

## Ρύθμιση παραμέτρων <a id="configuration"></a>

`CacheModuleOptions` (μεταβιβάζεται στο `CacheModule.forRoot`):

| Πεδίο | Τύπος | Περιγραφή |
| ----- | ---- | ----------- |
| `cache` | `Cache` | Προκατασκευασμένο στιγμιότυπο `cache-manager` (escape hatch). |
| `stores` | `Keyv[]` | Προκατασκευασμένα Keyv stores (tiered). |
| `store` | `CacheStoreConfig \| CacheStoreConfig[]` | Δηλωτικό(ά) store(s). |
| `ttl` | `number` | Προεπιλεγμένο TTL (ms) για stores και handlers. |
| `nonBlocking` | `boolean` | Βελτιστοποίηση αναγνώσεων/εγγραφών σε πολλαπλά stores. |
| `defaults` | `CacheBehaviorOptions` | Προεπιλεγμένες επιλογές ανά handler. |

`CacheBehaviorOptions` (ανά handler και/ή module `defaults`):

| Πεδίο | Τύπος | Προεπιλογή | Περιγραφή |
| ----- | ---- | ------- | ----------- |
| `kinds` | `Array<'command' \| 'query' \| 'event' \| 'unknown'>` | `['query']` | Είδη αιτημάτων κατάλληλα για caching. |
| `ttl` | `number` | module `ttl` | TTL (ms) για εγγραφές που γράφονται από αυτόν τον handler. |
| `key` | `(context) => string` | Υποχρεωτικό | Ρητό cache-key factory· χρησιμοποιήστε το `createPartitionedCacheKeyFactory` για προστατευμένες απαντήσεις. |
| `condition` | `(context) => boolean` | _πάντα_ | Πύλη ελέγχου εάν ένα αίτημα αποθηκεύεται στην cache. |
| `failOpen` | `boolean` | `true` | Καταγραφή και παράκαμψη σφαλμάτων ανάγνωσης/εγγραφής της cache· ορίστε `false` για διάδοσή τους. |

`CacheStoreConfig` (δηλωτικό store):

| Πεδίο | Τύπος | Περιγραφή |
| ----- | ---- | ----------- |
| `type` | `'memory' \| 'redis' \| 'memcache' \| 'sqlite' \| 'postgres'` | Backend προς κατασκευή. |
| `url` | `string` | Connection string / URI (αγνοείται για το `memory`). |
| `namespace` | `string` | Πρόθεμα κλειδιού για αυτό το store. |
| `ttl` | `number` | Προεπιλεγμένο TTL (ms) για αυτό το store. |
| `options` | `Record<string, unknown>` | Ειδικές επιλογές adapter που διαβιβάζονται. |

---

## Behavior Contract & Bootstrap Diagnostics <a id="behavior-contract--bootstrap-diagnostics"></a>

Το `CacheBehavior` υλοποιεί διαγνωστικά συμβολαίου συμπεριφοράς (behavior contract diagnostics) του `@nestjs-pipeline/core`:

### Περιορισμοί σειράς εκτέλεσης <a id="ordering-constraints"></a>

- **Σειρά εκτέλεσης**: Η αναζήτηση στην cache πρέπει να εκτελείται **μετά** την εξουσιοδότηση CASL (`@nestjs-pipeline/casl:CaslBehavior`) για όλα τα ενεργά είδη αιτημάτων cache (`kinds: ['query']` από προεπιλογή). Αυτό εγγυάται ότι μη ταυτοποιημένοι ή μη εξουσιοδοτημένοι καλούντες δεν λαμβάνουν ποτέ αποθηκευμένες απαντήσεις.
- **Δυναμική αξιολόγηση**: Ο κανόνας σειράς αξιολογείται δυναμικά ανά handler. Για ανενεργά είδη αιτημάτων (π.χ. έναν command handler όπου η cache είναι προεπιλεγμένη μόνο για queries), οι περιορισμοί σειράς δεν επιβάλλονται.

### Invariants επικύρωσης <a id="validation-invariants"></a>

- **Κλήσιμο key factory**: Όποτε το caching είναι ενεργό για το είδος αιτήματος ενός handler, το `key` πρέπει να είναι μια κλήσιμη συνάρτηση (`typeof === 'function'`). Strings ή μη κλήσιμες τιμές απορρίπτονται άμεσα (fast fail) κατά το bootstrap.
- **Module defaults**: Καθολικές προεπιλογές εφαρμογής που παρέχονται στο `CacheModule.forRoot({ defaults: { ... } })` επιλύονται από το `CacheBehavior.resolveEffectiveOptions` και αξιολογούνται μαζί με τις επιλογές του handler κατά το bootstrap.

---

## Προσαρμοσμένος Logger <a id="custom-logger"></a>

Αποτυχίες του διαγνωστικού logger δεν αντικαθιστούν τα αποτελέσματα του handler ή τα σφάλματα του cache store.

Το `CacheBehavior` εκπέμπει γραμμές `debug` cache hit/miss και γραμμές `warn`/`error` αποτυχίας store μέσω του logger που έχει inject-αριστεί με το `LOGGING_BEHAVIOR_LOGGER`, καταφεύγοντας σε έναν τυπικό NestJS `Logger` όταν αυτό το token δεν είναι συνδεδεμένο. Το `CacheModule` καταγράφει το μήνυμα αρχικοποίησης του store μέσω ενός NestJS `Logger` όταν κατασκευάζεται η cache.

---

## Αναφορά API <a id="api-reference"></a>

```ts
import {
  CacheModule,
  CacheBehavior,
  cache,
  CACHE_DEFAULT_OPTIONS,
  PIPELINE_CACHE,
  CACHE_HIT_ITEM,
  CACHE_HIT_ITEM_TOKEN,
  CACHE_KEY_ITEM,
  CACHE_KEY_ITEM_TOKEN,
  CacheManagerAdapter,
  buildCache,
  buildCacheAttributes,
  buildKeyv,
  createPartitionedCacheKeyFactory,
  MissingCachePartitionError,
  type CachePartitionDimension,
  type IPipelineCache,
  type CacheModuleOptions,
  type CacheModuleAsyncOptions,
  type CacheBehaviorOptions,
  type CacheIntentOptions,
  type CacheStoreConfig,
  type CacheStoreType,
  type CacheKeyFactory,
  type CacheCondition,
  type PartitionedCacheKeyOptions,
} from '@nestjs-pipeline/cache';
```

---

## Άδεια χρήσης <a id="license"></a>

Διανέμεται υπό διπλή άδεια: **AGPLv3** (ανοιχτού κώδικα) ή **Εμπορική Άδεια (Commercial License)**. Δείτε τα [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) και
[`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt), ή επικοινωνήστε στο
aristotelis@ik.me.
