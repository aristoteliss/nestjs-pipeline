---
title: "@nestjs-pipeline/idempotency"
description: "Behavior idempotency για το NestJS pipeline — αποκλείει ατομικά ταυτόχρονα αντίγραφα και επαναλαμβάνει αποθηκευμένες επιτυχείς αποκρίσεις ανά κλειδί idempotency, μέσω ενός συνδέσιμου store (in-memory προεπιλογή, Redis/Postgres drop-in)."
editUrl: false
---

> **Από την έκδοση 0.5.0 το πακέτο αυτό συνεχίζει ως [`@cqrs-ddd/pipeline-idempotency`](https://www.npmjs.com/package/@cqrs-ddd/pipeline-idempotency).** Ο κώδικας, τα issues και
> οι εκδόσεις του βρίσκονται στο [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs), με τεκμηρίωση στο [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-idempotency/).
> Οι εφαρμογές NestJS προσθέτουν το [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs). Οι εκδόσεις 0.1 έως 0.4 του
> `@nestjs-pipeline/idempotency` παραμένουν στο npm αμετάβλητες, και η γραμμή 0.4.x λαμβάνει μόνο διορθώσεις.

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/idempotency.svg)](https://www.npmjs.com/package/@nestjs-pipeline/idempotency)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/idempotency.svg)](https://www.npmjs.com/package/@nestjs-pipeline/idempotency)

Behavior idempotency για το `@nestjs-pipeline/core` — αποτρέπει ατομικά διπλότυπα ταυτόχρονα αιτήματα που μοιράζονται το ίδιο κλειδί idempotency και **επαναλαμβάνει (replays) την αποθηκευμένη απόκριση** μετά από μια επιτυχή εκτέλεση. Με την προεπιλογή `releaseOnError: true`, οι αποτυχημένες εκτελέσεις απελευθερώνουν το κλειδί ώστε μια μετέπειτα επανάληψη (retry) να μπορεί να εκτελέσει ξανά τον handler.

Ανεξάρτητο από το store (Store-agnostic): εξαρτάται μόνο από ένα λιτό interface `IdempotencyStore`. Ένα **in-memory** store χωρίς εξωτερικές εξαρτήσεις αποτελεί την προεπιλογή· το **Redis** και η **Postgres** είναι έτοιμες λύσεις (drop-ins) για αναπτύξεις πολλαπλών instances. Οι απαντήσεις επανάληψης (replay) χρησιμοποιούν ένα κοινό συμβόλαιο JSON-snapshot σε κάθε ενσωματωμένο store.

---

## Table of Contents

- [Γιατί behavior (αντί για ιδιοκατασκευή)](#why-a-behavior-vs-hand-rolling)
- [Εγκατάσταση](#installation)
- [Ρύθμιση](#setup)
- [Η εγγραφή idempotency](#the-idempotency-record)
- [Αποθηκευτικοί χώροι (Stores)](#stores)
  - [Memory (προεπιλογή)](#memory-default)
  - [Redis (drop-in)](#redis-drop-in)
  - [Postgres (drop-in)](#postgres-drop-in)
  - [Custom store](#custom-store)
- [Συμπεριφορά](#behavior)
- [Παραμετροποίηση](#configuration)
- [Διαχωρισμένα κλειδιά](#partitioned-keys)
- [Σύνδεση replay με authorization](#binding-replay-to-authorization)
- [Fingerprinting & επαναχρησιμοποίηση κλειδιού](#fingerprinting--key-reuse)
- [Διαχείριση συγκρούσεων](#conflict-handling)
- [Behavior Contract & Διαγνωστικά Bootstrap](#behavior-contract--bootstrap-diagnostics)
- [Αναφορά API](#api-reference)
- [Άδεια χρήσης](#license)

---

## Γιατί behavior (αντί για ιδιοκατασκευή) <a id="why-a-behavior-vs-hand-rolling"></a>

Το idempotency είναι κλασικό cross-cutting concern: ο ίδιος έλεγχος «το έχω κάνει ήδη αυτό;»
απαιτείται σε κάθε handler που μεταβάλλει κατάσταση και ο οποίος ενδέχεται να επαναληφθεί από έναν πελάτη.
Η ενσωμάτωση του ελέγχου μέσα σε κάθε handler δημιουργεί σύζευξη με το storage αποφυγής διπλοτύπων
και είναι επιρρεπής σε λεπτά σφάλματα (race conditions μεταξύ ελέγχου και εγγραφής, μη επανάληψη της
αρχικής απόκρισης, διαρροή μερικών εγγραφών μετά από crash). Αυτό το behavior το συγκεντρώνει κεντρικά:

- **Ατομικός αποκλεισμός (Atomic exclusion)** — το κλειδί δεσμεύεται **ατομικά** πριν εκτελεστεί ο handler
  (`SET NX` στο Redis, conditional upsert στην Postgres), αποτρέποντας την ταυτόχρονη εκτέλεση
  δύο παράλληλων διπλότυπων αιτημάτων όσο η δέσμευση είναι ενεργή.
- **Επανάληψη απόκρισης (Response replay)** — μετά από επιτυχή εκτέλεση, η απόκριση αποθηκεύεται και
  επιστρέφεται σε μεταγενέστερα διπλότυπα αιτήματα χωρίς επανεκτέλεση του handler όσο η εγγραφή
  παραμένει ενεργή.
- **Πολιτική αποτυχίας** — οι αποτυχίες του handler απελευθερώνουν το κλειδί από προεπιλογή
  (`releaseOnError: true`), επιτρέποντας σε μετέπειτα retry να εκτελεστεί ξανά. Ορίστε
  `releaseOnError: false` όταν προτιμάται η διατήρηση της αποτυχημένης δέσμευσης.
- **Προστασία in-flight** — ένα διπλότυπο που φτάνει ενώ το αρχικό εκτελείται ακόμη
  λαμβάνει `409 Conflict` αντί να ανταγωνίζεται μαζί του.
- **Ασφάλεια payload** — ένα προαιρετικό fingerprint απορρίπτει ένα κλειδί που επαναχρησιμοποιείται με
  *διαφορετικό* σώμα (`422`), εντοπίζοντας bugs πελάτη και επιθέσεις επανάληψης (replay attacks).
- **Ένα μόνο σημείο επαφής (seam)** — το interface `IdempotencyStore`. Memory σήμερα, Redis ή Postgres
  τη στιγμή που θα επεκταθείτε σε περισσότερα από ένα instances, χωρίς καμία αλλαγή στους handlers.

---

## Εγκατάσταση <a id="installation"></a>

```bash
pnpm add @cqrs-ddd/pipeline-idempotency @cqrs-ddd/nestjs @cqrs-ddd/pipeline @nestjs/cqrs
```

**Peer dependencies:**

```bash
pnpm add @nestjs/common @nestjs/core reflect-metadata
```

Απαιτεί Node.js 22.12 ή νεότερο, `@nestjs/common` και `@nestjs/core` `^12.1.0`.

Τα ενσωματωμένα stores είναι δομημένα με *δομικούς τύπους (structurally typed)*, οπότε αυτό το πακέτο προσθέτει **μηδενικές βαριές
εξαρτήσεις**. Για το Redis store προσθέστε έναν `redis` client (`pnpm add redis`)· για
το Postgres store προσθέστε ένα `pg` `Pool`/`Client` (`pnpm add pg`)· το memory store
δεν χρειάζεται τίποτα επιπλέον.

---

## Ρύθμιση <a id="setup"></a>

Στην αρχιτεκτονική NestJS, δηλώστε το store σας και το `IdempotencyBehavior` ως **singleton providers** στο feature module σας (π.χ. `ReliabilityModule`). Η μηχανή του pipeline συνδέει το δηλωμένο instance κατά την εκκίνηση.

```typescript
import { Module, Logger } from '@nestjs/common';
import { PipelineModule } from '@cqrs-ddd/nestjs';
import {
  IdempotencyBehavior,
  MemoryIdempotencyStore,
} from '@cqrs-ddd/pipeline-idempotency';

@Module({
  imports: [
    // Συνδέει την ανακάλυψη handlers και την εκτέλεση του pipeline
    PipelineModule.forRoot(),
  ],
  providers: [
    // 1. Pluggable store instance
    {
      provide: MemoryIdempotencyStore,
      useFactory: () => new MemoryIdempotencyStore(),
    },
    // 2. Behavior provider δηλωμένος με το class token του
    {
      provide: IdempotencyBehavior,
      inject: [MemoryIdempotencyStore],
      useFactory: (store: MemoryIdempotencyStore) =>
        new IdempotencyBehavior(
          store,
          undefined, // Προεπιλεγμένες επιλογές behavior
          new Logger(IdempotencyBehavior.name),
        ),
    },
  ],
})
export class ReliabilityModule {}
```

Στη συνέχεια, ενεργοποιήστε το σε ένα command και ορίστε πώς παράγεται το κλειδί του χρησιμοποιώντας το `@UsePipeline` και το `idempotent()`:

```typescript
import { Body, Controller, Headers, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { idempotent } from '@cqrs-ddd/pipeline-idempotency';

class CreatePaymentCommand {
  constructor(
    readonly payment: PaymentInput,
    readonly idempotencyKey?: string,
  ) {}
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  create(
    @Body() body: PaymentInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.commandBus.execute(new CreatePaymentCommand(body, key));
  }
}

@CommandHandler(CreatePaymentCommand)
@UsePipeline(
  idempotent({
    keyFactory: (ctx) =>
      (ctx.request as CreatePaymentCommand).idempotencyKey,
    ttl: 86_400_000, // 24h (προεπιλογή)
  }),
)
export class CreatePaymentHandler {
  async execute(command: CreatePaymentCommand) {
    /* ταυτόχρονα διπλότυπα αποκλείονται· επιτυχείς αποκρίσεις επαναλαμβάνονται (replayed) */
  }
}
```

> Χρησιμοποιήστε το `idempotent({ inheritModuleKey: true })` μόνο όταν το module παρέχει το key factory.
> Η απλή μορφή tuple `@UsePipeline([IdempotencyBehavior, { ... }])` παραμένει διαθέσιμη ως εναλλακτική λύση διαφυγής.

Εναλλακτικά, ένα προηγούμενο pipeline behavior μπορεί να τοποθετήσει transport metadata στο
`context.items`. Ένας controller δεν μπορεί να μεταβάλει απευθείας το `PipelineContext`
επειδή ο πυρήνας το δημιουργεί αργότερα κατά την εκτέλεση του CQRS handler.

Ολοκληρωμένες εγγραφές αναπαράγονται (replay) πριν εκτελεστεί ο handler. Εάν ο handler εκτελεί
εξουσιοδότηση σε επίπεδο οντότητας ή φιλτράρισμα αποτελεσμάτων, παράγετε ένα namespaced κλειδί που
περιλαμβάνει τον tenant και το principal/security scope, για παράδειγμα
`` `${tenantId}:${principalId}:${clientKey}` ``. Ένα κλειδί που παρέχεται αποκλειστικά από τον πελάτη
δεν πρέπει ποτέ να μοιράζεται μεταξύ διαφορετικών security principals.

---

## Η εγγραφή idempotency <a id="the-idempotency-record"></a>

Κάθε δεσμευμένο κλειδί αποθηκεύει ένα `IdempotencyRecord`:

```typescript
interface IdempotencyRecord {
  key: string;                          // το κλειδί idempotency
  status: 'in_progress' | 'completed';  // κατάσταση κύκλου ζωής
  requestName: string;                  // π.χ. 'CreatePaymentCommand'
  claimId?: string;                     // μοναδικό token ιδιοκτησίας για ενεργή εγγραφή
  fingerprint?: string;                 // hash του αρχικού payload
  replayScope?: string;                 // scope εξουσιοδότησης με το οποίο συνδέεται το replay
  response?: JsonValue;                 // JSON snapshot που καταγράφεται για replay
  createdAt: string;                    // ISO-8601, κατά την πρώτη δέσμευση
  completedAt?: string;                 // ISO-8601, όταν ολοκληρώθηκε ο handler
}
```

Η εγγραφή δημιουργείται ως `in_progress` τη στιγμή που δεσμεύεται το κλειδί, και στη συνέχεια
μετατρέπεται σε `completed` με το καταγεγραμμένο `response` όταν ο handler επιτύχει.
Οι αποκρίσεις handler που χρησιμοποιούνται με idempotency πρέπει να ανήκουν αυστηρά στο πεδίο
φορητού JSON: `null`, booleans, πεπερασμένοι αριθμοί, strings, arrays, και record-like
αντικείμενα που περιέχουν μόνο αυτές τις τιμές. Το `Date` μετατρέπεται ρητά σε ISO string.
Περιπτώσεις μη αντιστρέψιμου native JSON όπως `Map`, `Set`, `RegExp`, `Error`, binary
views, μη πεπερασμένοι αριθμοί, εμφωλευμένο `undefined`, συναρτήσεις, symbols (συμπεριλαμβανομένων
ιδιοτήτων με symbol-keys), bigint, και κυκλικές αναφορές απορρίπτονται. Ένα `undefined` ανωτάτου επιπέδου
διατηρείται μόνο για επιτυχείς void handlers.
Προσαρμοσμένα αντικείμενα μπορούν να ορίσουν τη μέθοδο `toJSON()` ως δημόσιο συμβόλαιο σειριοποίησης.
Η επιστρεφόμενη αναπαράσταση επικυρώνεται αναδρομικά· εσωτερικά πεδία που εξαιρούνται από
το `toJSON()` (όπως τα symbols συμβάντων του NestJS aggregate) δεν σειριοποιούνται ούτε επικυρώνονται.
Μη υποστηριζόμενες τιμές και κύκλοι που εκτίθενται από αυτήν την αναπαράσταση εξακολουθούν να αποτυγχάνουν
κατά την επικύρωση.
Ο αρχικός καλών λαμβάνει την αρχική τιμή του handler· οι επόμενοι καλούντες λαμβάνουν
το JSON snapshot της (για παράδειγμα, ένα `Date` επιστρέφεται κατά το replay ως ISO string).

---

## Αποθηκευτικοί χώροι (Stores) <a id="stores"></a>

Το store είναι το μοναδικό τμήμα που εξαρτάται από το backend. Αντικαταστήστε το στο `IdempotencyModule`
χωρίς να αγγίξετε κανέναν handler.

### Memory (προεπιλογή) <a id="memory-default"></a>

`MemoryIdempotencyStore` — μηδενικές εξαρτήσεις, ένα `Map` με TTL ανά εγγραφή, περιορισμένη χωρητικότητα, και περιοδικό καθαρισμό. Ιδανικό για single instance, δοκιμές ή τοπική ανάπτυξη. Η κατάσταση **δεν** μοιράζεται μεταξύ διεργασιών, επομένως χρησιμοποιήστε Redis ή Postgres για αναπτύξεις με πολλαπλά instances.

```typescript
IdempotencyModule.forRoot(); // memory store, προεπιλεγμένο TTL 24 ωρών
```

Το προεπιλεγμένο store δημιουργείται ανά εφαρμογή και το χρονόμετρο καθαρισμού του σταματά κατά τον τερματισμό
της εφαρμογής. Ένα store που περνά ως παράμετρος `store` (ή κατασκευάζεται μέσω `forRootAsync`)
ανήκει στον καλούντα, ο οποίος καλεί το `destroy()` στο `MemoryIdempotencyStore` που δημιούργησε.
Νέες δεσμεύσεις απορρίπτονται μόλις συμπληρωθούν `maxEntries` μη ληγμένες εγγραφές, επομένως
παρακολουθείτε αυτό το σφάλμα στην παραγωγή· η αποτροπή διπλοτύπων γίνεται ανά διεργασία, οπότε
τα replicas χρειάζονται Redis ή Postgres store.

```typescript
import { Module, type OnApplicationShutdown } from '@nestjs/common';
import {
  IdempotencyModule,
  MemoryIdempotencyStore,
} from '@nestjs-pipeline/idempotency';

const store = new MemoryIdempotencyStore({ maxEntries: 50_000 });

@Module({ imports: [IdempotencyModule.forRoot({ store })] })
export class AppModule implements OnApplicationShutdown {
  onApplicationShutdown(): void {
    store.destroy();
  }
}
```

Διαμορφώσιμες επιλογές μέσω `new MemoryIdempotencyStore(options)`:
- `maxEntries` (`number`, προεπιλογή `10_000`): Μέγιστος αριθμός ενεργών εγγραφών πριν την επιβολή χωρητικότητας.
- `cleanupIntervalMs` (`number`, προεπιλογή `30_000`): Περιοδικό διάστημα χρονοδιακόπτη για εκκαθάριση ληγμένων εγγραφών.

> [!IMPORTANT]
> **Προστασία εκδίωξης ενεργών δεσμεύσεων (Active Claim Eviction Protection)**: Σε αντίθεση με τις LRU caches που απορρίπτουν σιωπηρά αυθαίρετες εγγραφές όταν γεμίσουν, το `MemoryIdempotencyStore` **αρνείται να εκδιώξει ενεργές ή μη ληγμένες δεσμεύσεις**. Όταν επιτευχθεί η μέγιστη χωρητικότητα, καθαρίζει πρώτα τις ληγμένες εγγραφές. Εάν η χωρητικότητα παραμένει εξαντλημένη, πετάει ρητό σφάλμα (`MemoryIdempotencyStore capacity reached: cannot evict active or unexpired claims`), αποτρέποντας συνθήκες ανταγωνισμού (race conditions) και διασφαλίζοντας ότι οι αυστηροί κανόνες του idempotency δεν παραβιάζονται ποτέ.

### Redis (drop-in) <a id="redis-drop-in"></a>

`RedisIdempotencyStore` — υποστηρίζεται από node-redis client (`redis` v4 ή νεότερο·
ελεγμένο με `@redis/client` 6). Ατομικές δεσμεύσεις μέσω `SET key value PX <ttl> NX`·
το TTL επιβάλλεται από το Redis.

Μια αποθηκευμένη τιμή που δεν αποτελεί έγκυρο JSON αποτυγχάνει άμεσα (fail-closed). Το `get()` πετάει σφάλμα, οπότε
το αίτημα αποτυγχάνει χωρίς να εκτελεστεί ο handler. Οι εγγραφές που ελέγχουν ιδιοκτησία
(`completeIfOwned`, `deleteIfOwned`) δεν μπορούν να αποδείξουν ιδιοκτησία της, οπότε την αφήνουν
ανέγγιχτη και επιστρέφουν `false`. Το κλειδί παραμένει μπλοκαρισμένο μέχρι να λήξει το TTL του ή
να το διαγράψει ένας διαχειριστής.

```typescript
import { createClient } from 'redis';
import {
  IdempotencyModule,
  RedisIdempotencyStore,
} from '@nestjs-pipeline/idempotency';

const client = createClient({ url: process.env.REDIS_URL });
await client.connect();

IdempotencyModule.forRoot({
  store: new RedisIdempotencyStore(client, { keyPrefix: 'idempotency:' }),
});
```

Σύνδεση ενός client διαχειριζόμενου από το DI μέσω του `forRootAsync`:

```typescript
import type { RedisClientType } from 'redis';

// Το REDIS_CLIENT είναι το provider token της ίδιας της εφαρμογής για συνδεδεμένο client.
IdempotencyModule.forRootAsync({
  imports: [RedisModule],
  inject: [REDIS_CLIENT],
  useFactory: (client: RedisClientType) =>
    new RedisIdempotencyStore(client, { keyPrefix: 'idempotency:' }),
});
```

### Postgres (drop-in) <a id="postgres-drop-in"></a>

`PostgresIdempotencyStore` — υποστηρίζεται από `pg` `Pool`/`Client`. Δεν απαιτεί πρόσθετη
υποδομή εάν εκτελείτε ήδη Postgres. Δημιουργήστε τον πίνακα μία φορά με
το `createIdempotencyTableSql()`· οι δεσμεύσεις είναι ατομικές μέσω
υπό συνθήκη `INSERT … ON CONFLICT (key) DO UPDATE`: ενεργές γραμμές παραμένουν
ανέγγιχτες, ενώ ληγμένες γραμμές αντικαθίστανται από τη νέα δέσμευση σε μία μόνο εντολή.

Η στήλη `response` είναι τύπου `TEXT` που περιέχει την απόκριση ως JSON, και όχι `jsonb`: το `jsonb`
απορρίπτει χαρακτήρες NUL και μη ζευγαρωμένα surrogates, οπότε μια απόκριση που τα περιείχε δεν θα
μπορούσε να ολοκληρωθεί. Ως JSON κείμενο, κάθε απόκριση που επιστρέφει ένας handler αποθηκεύεται και
αναπαράγεται με απόλυτη ακρίβεια.

```typescript
import { Pool } from 'pg';
import {
  IdempotencyModule,
  PostgresIdempotencyStore,
  createIdempotencyTableSql,
} from '@nestjs-pipeline/idempotency';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(createIdempotencyTableSql('idempotency_keys')); // εκτέλεση σε migration

IdempotencyModule.forRoot({
  store: new PostgresIdempotencyStore(pool, { table: 'idempotency_keys' }),
  defaults: { ttl: 3_600_000 }, // 1h
});
```

Με pool από το Nest DI (το `PG_POOL` είναι το token της ίδιας της εφαρμογής):

```typescript
IdempotencyModule.forRootAsync({
  imports: [DatabaseModule],
  inject: [PG_POOL],
  useFactory: (pool: Pool) => new PostgresIdempotencyStore(pool),
});
```

### Custom store <a id="custom-store"></a>

Υλοποιήστε το interface `IdempotencyStore` έξι μεθόδων για να υποστηρίξετε το idempotency με
οποιοδήποτε backend — DynamoDB, Memcached, μια υπηρεσία HTTP. Οι δύο λειτουργίες επίγνωσης ιδιοκτησίας
πρέπει να είναι ατομικές· μια ανάγνωση που ακολουθείται από ξεχωριστή εγγραφή/διαγραφή δεν επαρκεί:

```typescript
interface IdempotencyStore {
  get(key: string): MaybePromise<IdempotencyRecord | undefined>;
  /** Ατομική δέσμευση κλειδιού. Επιστρέφει false εάν υπάρχει ήδη ενεργή εγγραφή. */
  setIfAbsent(
    key: string,
    record: IdempotencyRecord,
    ttlMs: number,
  ): MaybePromise<boolean>;
  /** Ολοκλήρωση μόνο όσο το `claimId` εξακολουθεί να κατέχει την ενεργή in-progress εγγραφή. */
  completeIfOwned(
    key: string,
    claimId: string,
    record: IdempotencyRecord,
    ttlMs: number,
  ): MaybePromise<boolean>;
  /** Διαγραφή μόνο όσο το `claimId` εξακολουθεί να κατέχει την ενεργή εγγραφή. */
  deleteIfOwned(key: string, claimId: string): MaybePromise<boolean>;
  /** Άνευ όρων διαχειριστική αντικατάσταση. */
  set(key: string, record: IdempotencyRecord, ttlMs: number): MaybePromise<void>;
  /** Άνευ όρων διαχειριστική διαγραφή. */
  delete(key: string): MaybePromise<void>;
}
```

Τα `setIfAbsent`, `completeIfOwned`, και `deleteIfOwned` **πρέπει** να είναι ατομικά.
Τα ενσωματωμένα stores (memory, Redis, Postgres) υλοποιούν αυτές τις εγγυήσεις χρησιμοποιώντας
ένα μοναδικό `claimId` ανά in-progress εγγραφή, αποτρέποντας μια εκτέλεση που ξεπέρασε
το TTL της από το να αντικαταστήσει ή να απελευθερώσει μια νεότερη δέσμευση.

---

## Συμπεριφορά <a id="behavior"></a>

Για κάθε αίτημα εντός πεδίου εφαρμογής, το `IdempotencyBehavior`:

1. παράγει το κλειδί μέσω του `keyFactory`· εάν δεν παραχθεί, ο handler εκτελείται κανονικά·
2. εκθέτει το κλειδί στο context ως `IDEMPOTENCY_KEY_ITEM` (`Symbol`)·
3. δεσμεύει ατομικά το κλειδί (`status: 'in_progress'`)·
4. **δεσμεύτηκε** → εκτελεί τον handler, αποθηκεύει την εγγραφή `completed` με την
   απόκριση, και την επιστρέφει·
5. **δεν δεσμεύτηκε** → εξετάζει την υπάρχουσα εγγραφή:
   - καμία ενεργή εγγραφή (έληξε/εξαφανίστηκε μεταξύ δέσμευσης και ανάγνωσης) → δοκιμάζει ξανά
     την ατομική δέσμευση μία φορά·
   - εξακολουθεί να είναι `in_progress` → πετάει `IdempotencyConflictError` (`409`)·
   - `completed`, ίδιος τύπος αιτήματος και payload → **επαναλαμβάνει (replays)** την αποθηκευμένη απόκριση (ο handler
     δεν εκτελείται) και θέτει το `IDEMPOTENCY_REPLAYED_ITEM` (`Symbol`) σε
     `true`·
   - `completed`, διαφορετικός τύπος αιτήματος ή payload → πετάει
     `IdempotencyConflictError` (`422`).

Εάν ο handler πετάξει σφάλμα και το `releaseOnError` είναι `true` (προεπιλογή), το κλειδί
απελευθερώνεται ώστε ο πελάτης να μπορεί να δοκιμάσει ξανά και ο handler να εκτελεστεί εκ νέου. Το σφάλμα
του handler επανεκπέμπεται μετά την προσπάθεια καθαρισμού. Εάν αποτύχει ο ίδιος ο καθαρισμός, αυτή η
αποτυχία καταγράφεται και το αρχικό σφάλμα του handler εξακολουθεί να επανεκπέμπεται.

### Μετά την επιτυχή εκτέλεση του handler <a id="after-the-handler-has-already-succeeded"></a>

Οτιδήποτε αποτύχει αφού επιλυθεί το `next()` αποτελεί πρόβλημα **οριστικοποίησης (finalization)**, όχι
αποτυχία handler: τα side effects έχουν ήδη συμβεί. Και στις δύο περιπτώσεις πετάγεται
`IdempotencyCompletionError`, το οποίο φέρει `executionSucceeded: true`, την αρχική αιτία `cause`, και μια φάση `phase`:

| `phase` | Αιτία | Δέσμευση (Claim) |
| --- | --- | --- |
| `snapshot` | Η απόκριση δεν μπορεί να σειριοποιηθεί σε εγγραφή κατάλληλη για replay — κύκλος, συνάρτηση, `Map`, `bigint`. | **Διατηρείται** μέχρι το TTL. |
| `store` | Η εγγραφή ήταν σειριοποιήσιμη αλλά το store απέρριψε την εγγραφή. | **Διατηρείται** μέχρι το TTL. |

Η δέσμευση σκοπίμως δεν απελευθερώνεται σε καμία από τις δύο περιπτώσεις. Η απελευθέρωσή της θα επέτρεπε
στην αμέσως επόμενη επανάληψη να επαναλάβει side effects που έχουν ήδη εκτελεστεί. Η διατήρηση δεν αποτελεί
εγγύηση κατά των διπλοτύπων — απλώς αποτρέπει την άμεση επανείσοδο όσο η δέσμευση είναι ενεργή — επομένως
αντιμετωπίστε αυτό το σφάλμα ως σήμα συμφωνίας δεδομένων (reconciliation) και όχι ως κάτι που μπορεί να επαναληφθεί τυφλά.

Διαχειριστείτε το στο σημείο αποστολής του αιτήματος: αναφέρετε τη λειτουργία για
συμφωνία δεδομένων αντί να την επαναλάβετε.

```typescript
import { IdempotencyCompletionError } from '@nestjs-pipeline/idempotency';

try {
  return await commandBus.execute(command);
} catch (error) {
  if (error instanceof IdempotencyCompletionError) {
    logger.error(`idempotency ${error.phase} failed for key ${error.key}`);
    // Τα side effects εκτελέστηκαν· ο πελάτης δεν πρέπει να επαναλάβει τυφλά.
  }
  throw error;
}
```

Το `IdempotencyConflictFilter` αντιστοιχίζει μόνο το `IdempotencyConflictError`· ένα
`IdempotencyCompletionError` φτάνει στα δικά σας φίλτρα εξαιρέσεων.

Επικυρώστε το συμβόλαιο απόκρισης στα tests της εφαρμογής. Μην χαλαρώνετε τη σειριοποίηση
απλώς για να εξαφανιστεί αυτό το σφάλμα: μια απόκριση που δεν μπορεί να αποθηκευτεί δεν μπορεί να αναπαραχθεί,
με αποτέλεσμα ο επόμενος καλών να λάβει σιωπηρά διαφορετική συμπεριφορά από τον πρώτο.

---

## Παραμετροποίηση <a id="configuration"></a>

Οι επιλογές διαβάζονται ανά handler από το `@UsePipeline` και συγχωνεύονται πάνω από τις καθολικές
`defaults` του module.

| Επιλογή | Τύπος | Προεπιλογή | Περιγραφή |
| --- | --- | --- | --- |
| `keyFactory` | `(ctx) => string \| undefined` | — | Παράγει το κλειδί idempotency. Χωρίς αυτό (ή όταν επιστρέφει `undefined`) ο handler εκτελείται κανονικά. |
| `ttl` | θετικός ασφαλής ακέραιος | `86_400_000` | Διάρκεια ζωής δέσμευσης σε ms (24 ώρες). Η επιτυχής ολοκλήρωση επανεκκινεί αυτό το TTL για την εγγραφή replay. |
| `scope` | `('command' \| 'query' \| 'event' \| 'unknown')[]` | `['command']` | Σε ποια είδη αιτημάτων εφαρμόζεται η πολιτική. |
| `fingerprint` | `boolean` | `true` | Απόρριψη κλειδιού που επαναχρησιμοποιείται με διαφορετικό payload (`422`). |
| `replayScopeFactory` | `(ctx) => string \| undefined` | — | Σύνδεση του replay με το authorization scope του καλούντος όσο το κλειδί παραμένει σταθερό (`409` σε αναντιστοιχία). |
| `releaseOnError` | `boolean` | `true` | Απελευθέρωση κλειδιού όταν ο handler πετάει σφάλμα, ώστε τα retries να μπορούν να επανεκτελεστούν. |

---

## Διαχωρισμένα κλειδιά <a id="partitioned-keys"></a>

Ένα κλειδί αποτελεί όριο ασφαλείας: μια εύρεση επιστρέφει μια αποθηκευμένη απόκριση χωρίς να εκτελέσει
τον handler, οπότε δύο καλούντες που μοιράζονται ένα κλειδί μοιράζονται ένα αποτέλεσμα. Κατασκευάστε κλειδιά με το
`createPartitionedIdempotencyKeyFactory` αντί για χειροκίνητη συναρμολόγηση:

```typescript
import {
  createPartitionedIdempotencyKeyFactory,
  idempotent,
} from '@nestjs-pipeline/idempotency';

const createOrderKey = createPartitionedIdempotencyKeyFactory({
  version: 'v1',                    // namespace· αλλάξτε το μόνο σκόπιμα
  action: 'order.create',           // προεπιλογή στο όνομα του αιτήματος
  principal: (ctx) => ['user', currentUserId(ctx)],
  operation: (ctx) => (ctx.request as CreateOrderCommand).externalRef,
});

@UsePipeline(idempotent({ keyFactory: createOrderKey }))
export class CreateOrderHandler {}
```

Το κλειδί έχει τη μορφή `[version:][tenantId:]<principal…>:<action>:<operation>`, και το
βοηθητικό εργαλείο εγγυάται τρία πράγματα που δεν προσφέρει ένα χειροκίνητο template:

- **Escaping.** Κάθε τμήμα περνά από το `joinKeySegments` του
  `@cqrs-ddd/safe-stringify`, οπότε ένα email ή σύνθετο id που περιέχει `:`
  δεν μπορεί να προκαλέσει σύγκρουση δύο διαφορετικών λειτουργιών.
- **Κανένα κοινό fallback για το principal.** Ένας απών tenant ή principal πετάει
  `MissingIdempotencyPartitionError` πριν δεσμευτεί οτιδήποτε. Ένα placeholder
  όπως `'anonymous'` θα τοποθετούσε κάθε μη επιλυμένο καλούντα στο ίδιο namespace, όπου
  η ολοκληρωμένη λειτουργία ενός καλούντος θα επαναλαμβανόταν σε άλλον. Επιλύστε το principal από
  πιστοποιημένο (authenticated) context, ποτέ από πεδίο του request body.
- **Διακριτά είδη principal.** Το `principal` μπορεί να επιστρέψει πολλαπλά segments, οπότε
  το `['service', id]` και το `['user', id]` δεν μοιράζονται ποτέ το ίδιο namespace ακόμα και όταν τα ids
  είναι ίσα.

Ο tenant προέρχεται από το `context.tenantId` (που ορίζεται από το `@nestjs-pipeline/tenant`, ή οποιαδήποτε
ρύθμιση `sources`). Δύο επιλογές που κληρονομούνται από το `TenantPartitionOptions` του πυρήνα
το ελέγχουν:

- `includeTenant` (προεπιλογή `true`) — εάν το κλειδί περιέχει τμήμα tenant·
- `requireTenant` (προεπιλογή: η τιμή του `includeTenant`) — εάν ένας απών tenant
  πετάει `MissingIdempotencyPartitionError` με διάσταση `'tenant'`.

```typescript
// Ανάπτυξη μονού tenant: κανένα τμήμα tenant, τίποτα προς απαίτηση.
createPartitionedIdempotencyKeyFactory({
  includeTenant: false,
  principal: (ctx) => ['user', currentUserId(ctx)],
  operation: (ctx) => (ctx.request as CreateOrderCommand).externalRef,
});

// Μικτή κίνηση: διαχωρισμός ανά tenant όταν υπάρχει, αποδοχή αιτημάτων χωρίς tenant.
createPartitionedIdempotencyKeyFactory({
  requireTenant: false,
  principal: (ctx) => ['service', currentServiceId(ctx)],
  operation: (ctx) => (ctx.request as SyncCommand).batchId,
  onMissingOperation: 'skip',
});
```

Το `MissingIdempotencyPartitionError` κληρονομεί από το `MissingPartitionError` του core, οπότε ένα
φίλτρο στη βασική κλάση αντιστοιχίζει τα partition errors κάθε πακέτου pipeline.

Μια απούσα ταυτότητα λειτουργίας πετάει σφάλμα από προεπιλογή. Για προαιρετικό client header
`Idempotency-Key`, περάστε `onMissingOperation: 'skip'`: το factory τότε
επιστρέφει `undefined` και το αίτημα εκτελείται χωρίς αποτροπή διπλοτύπων — ωστόσο ένα απών
principal εξακολουθεί να πετάει σφάλμα.

Με την προεπιλεγμένη λειτουργία `'throw'`, το επιστρεφόμενο factory έχει τύπο
`(ctx) => string`, καθώς δεν παράγει ποτέ `undefined`.

Η μεταφορά ενός υφιστάμενου χειροκίνητου factory στο helper αλλάζει τα αποθηκευμένα κλειδιά μόνο
όπου ένα τμήμα περιέχει `:` ή `\`, ή όπου διαφέρει η ίδια η διάταξη. Όταν
συμβαίνει αυτό, ολοκληρωμένες λειτουργίες καθίστανται εκ νέου δεσμεύσιμες μέχρι να λήξουν οι εγγραφές τους·
προγραμματίστε την αλλαγή γύρω από το TTL ή αυξήστε σκόπιμα το `version`.

Κρατήστε τα δικαιώματα έξω από το κλειδί — δείτε την επόμενη ενότητα.

---

## Σύνδεση replay με authorization <a id="binding-replay-to-authorization"></a>

Ένα κλειδί idempotency προσδιορίζει μια *λειτουργία (operation)*, όχι μια απόκριση. Εάν τα δικαιώματα
ενσωματωθούν στο κλειδί, μια αλλαγή δικαιωμάτων παράγει νέο κλειδί και το ίδιο side
effect εκτελείται για δεύτερη φορά. Επομένως, το κλειδί παραμένει σταθερό και το replay συνδέεται
ξεχωριστά, με το `replayScopeFactory`:

```typescript
@UsePipeline([
  IdempotencyBehavior,
  {
    keyFactory: (ctx) => operationKey(ctx),        // σταθερή ταυτότητα λειτουργίας
    replayScopeFactory: (ctx) => scopeDigest(ctx), // με τι συνδέεται το replay
  },
])
export class CreatePaymentHandler {}
```

Το digest καταγράφεται όταν δεσμεύεται το κλειδί και αποθηκεύεται στην εγγραφή. Ένα μεταγενέστερο
διπλότυπο αναπαράγει την αποθηκευμένη απόκριση μόνο όταν το digest του ταιριάζει. Διαφορετικά, το
behavior πετάει `IdempotencyConflictError` με αιτία `replay_scope` (`409`) και:

- **δεν** επανεκτελεί τον handler — η λειτουργία έχει ήδη πραγματοποιηθεί·
- **δεν** διαγράφει την εγγραφή — η διαγραφή της θα επέτρεπε την επανεκτέλεση·
- **δεν** επιστρέφει την αποθηκευμένη απόκριση — το scope του καλούντος δεν ταιριάζει πλέον.

Μια εγγραφή αποθηκευμένη χωρίς digest απορρίπτεται με τον ίδιο τρόπο μόλις ρυθμιστεί
ένα factory, οπότε εγγραφές που γράφτηκαν πριν υπάρξει η πολιτική δεν μπορούν να αναπαραχθούν
τυφλά. Το factory εκτελείται **πριν** δεσμευτεί το κλειδί, οπότε η ρίψη σφάλματος σε περίπτωση απόντος
authorization context απορρίπτει το αίτημα χωρίς να δεσμεύσει τίποτα.

Επιστρέψτε ένα digest που καλύπτει κάθε διάσταση που πρέπει να ακυρώνει το replay — τους
ενεργούς κανόνες με τη σειρά τους, συμπεριλαμβανομένων πεδίων, αναστροφών και τιμών συνθηκών, συν
το αξιόπιστο context έναντι του οποίου επιλύονται αυτές οι συνθήκες. Η ισότητα scope ισχύει μόνο
για αποφάσεις που αντιπροσωπεύει το καταγεγραμμένο context: μια λειτουργία της οποίας η εξουσιοδότηση
εξαρτάται από κατάσταση πόρου που αλλάζει αργότερα χρειάζεται δικό της έλεγχο εξουσιοδότησης replay,
ή δεν πρέπει να κάνει replay αποτελεσμάτων καθόλου.

Το fingerprinting του payload παραμένει ανεξάρτητος έλεγχος: ένα αλλαγμένο σώμα παραμένει
`key_reuse` (`422`), ανεξάρτητα από το τι αναφέρει το scope.

---

## Fingerprinting & επαναχρησιμοποίηση κλειδιού <a id="fingerprinting--key-reuse"></a>

Ένα κλειδί idempotency είναι απομονωμένο στον τύπο αιτήματος που το δέσμευσε αρχικά· η επαναχρησιμοποίησή
του από άλλον τύπο command/query/event απορρίπτεται με `422` ακόμα και όταν το hash του
payload ταιριάζει. Με `fingerprint: true` (προεπιλογή), το behavior αποθηκεύει επίσης ένα σταθερό SHA-256 hash
του payload του αιτήματος (τα κλειδιά αντικειμένων ταξινομούνται, οπότε η σειρά των ιδιοτήτων δεν έχει σημασία). Εάν ένα
μεταγενέστερο αίτημα επαναχρησιμοποιήσει το κλειδί με **διαφορετικό** σώμα, απορρίπτεται με σύγκρουση
`422` `key_reuse` — εντοπίζοντας bugs πελάτη και επιθέσεις replay όπου αποστέλλεται το ίδιο
κλειδί με νέα δεδομένα.

Όταν το fingerprinting είναι ενεργοποιημένο, οποιαδήποτε αποθηκευμένη εγγραφή χωρίς fingerprint δεν είναι
επαληθεύσιμη και απορρίπτεται ως `key_reuse`· δεν αναπαράγεται ποτέ. Απενεργοποιήστε το
fingerprinting μόνο όταν το συμβόλαιο αποθήκευσης επιτρέπει σκόπιμα εγγραφές χωρίς fingerprint.

Το fingerprinting χρησιμοποιεί το ίδιο αυστηρό πεδίο JSON όπως και τα snapshots απόκρισης, οπότε
τιμές που το εγγενές `JSON.stringify()` θα κατέρρεε ή θα απέρριπτε σιωπηρά
απορρίπτονται πριν δεσμευτεί ένα κλειδί.

Απενεργοποιήστε το (`fingerprint: false`) όταν το κλειδί σας ταυτοποιεί ήδη πλήρως το
payload, ή εκθέστε το `fingerprintValue` για να υπολογίσετε ένα hash μόνοι σας.

---

## Διαχείριση συγκρούσεων <a id="conflict-handling"></a>

Το `IdempotencyConflictError` φέρει `key`, `requestName`, `reason`
(`'in_progress'` | `'key_reuse'` | `'replay_scope'`) και προτεινόμενο
`statusCode` (`409` / `422`).
Αντιστοιχίστε το σε απόκριση HTTP με το συνοδευτικό φίλτρο. Το Nest κάνει inject το `HttpAdapterHost` του,
και το φίλτρο απαντά μέσω αυτού του adapter (Express και Fastify, καθώς και για σφάλμα που ρίχτηκε
σε middleware):

```typescript
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { IdempotencyConflictFilter } from '@nestjs-pipeline/idempotency';

@Module({
  providers: [{ provide: APP_FILTER, useClass: IdempotencyConflictFilter }],
})
export class AppModule {}
```

Στο `main.ts`, περάστε τον host:
`app.useGlobalFilters(new IdempotencyConflictFilter(app.get(HttpAdapterHost)))`.
Χωρίς το φίλτρο, το Nest απαντά στο σφάλμα με ένα γενικό 500.

Σώμα απόκρισης:

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "A request with idempotency key \"…\" is already in progress for CreatePaymentCommand",
  "idempotencyKey": "…",
  "reason": "in_progress"
}
```

---

## Behavior Contract & Διαγνωστικά Bootstrap <a id="behavior-contract--bootstrap-diagnostics"></a>

Το `IdempotencyBehavior` υλοποιεί τα διαγνωστικά συμβολαίου behavior του `@nestjs-pipeline/core`:

### Περιορισμοί Διάταξης (Ordering Constraints) <a id="ordering-constraints"></a>

- **Σειρά εκτέλεσης**: Το idempotency πρέπει να εκτελείται **μετά** την εξουσιοδότηση CASL (`@nestjs-pipeline/casl:CaslBehavior`) για όλα τα ενεργά είδη αιτημάτων idempotency (`scope: ['command']` από προεπιλογή). Αυτό διασφαλίζει ότι μη εξουσιοδοτημένοι καλούντες δεν μπορούν να δεσμεύσουν κλειδιά idempotency ή να προκαλέσουν επαναλαμβανόμενες εκτελέσεις.
- **Δυναμική αξιολόγηση**: Ο κανόνας διάταξης αξιολογείται δυναμικά ανά handler με βάση το ισχύον `scope`. Εάν ένας handler χειρίζεται είδος αιτήματος εκτός του ισχύοντος scope (π.χ. query handler με προεπιλεγμένο command scope), οι περιορισμοί διάταξης δεν επιβάλλονται.

### Κανόνες Επικύρωσης (Validation Invariants) <a id="validation-invariants"></a>

- **Κλήσιμη συνάρτηση key factory για ρητό intent**: Όποτε το `IdempotencyBehavior` προσαρτάται ρητά σε έναν handler (μέσω `@UsePipeline(IdempotencyBehavior)` ή `@UsePipeline([IdempotencyBehavior, { ... }])`), πρέπει να παρέχεται μια κλήσιμη συνάρτηση `keyFactory: (context) => string` (`typeof === 'function'`) είτε μέσω των επιλογών του handler είτε μέσω των προεπιλογών του module. Παράλειψη ή μη κλήσιμες τιμές αποτυγχάνουν άμεσα κατά την εκκίνηση της εφαρμογής με `PipelineConfigurationError` σε κατάσταση `strict`.
- **Επίλυση προεπιλογών module**: Καθολικές προεπιλογές της εφαρμογής που παρέχονται στο `IdempotencyModule.forRoot({ defaults: { ... } })` συγχωνεύονται κάτω από τις επιλογές handler μέσω του `IdempotencyBehavior.resolveEffectiveOptions` και αξιολογούνται κατά τα διαγνωστικά bootstrap.

---

## Αναφορά API <a id="api-reference"></a>

**Module**

- `IdempotencyModule.forRoot(options?)` — `{ store?, defaults? }`· προεπιλέγει το
  memory store.
- `IdempotencyModule.forRootAsync(options)` — `{ useFactory, inject?, imports?, defaults? }`.

**Behavior**

- `IdempotencyBehavior` — το pipeline behavior.
- `IDEMPOTENCY_KEY_ITEM`, `IDEMPOTENCY_REPLAYED_ITEM`, `IDEMPOTENCY_OWNERSHIP_LOST_ITEM` — εξαγόμενα μοναδικά `Symbol` context item keys.
- `IDEMPOTENCY_KEY_ITEM_TOKEN`, `IDEMPOTENCY_REPLAYED_ITEM_TOKEN`, `IDEMPOTENCY_OWNERSHIP_LOST_ITEM_TOKEN` — typed tokens πάνω από τα ίδια κλειδιά, για το `getPipelineItem` του `@nestjs-pipeline/core`.
- `buildIdempotencyAttributes(context)` — τα attributes `idempotency.replayed` και, όταν χάθηκε η δέσμευση, `idempotency.ownership_lost`· `{}` όταν το behavior δεν εκτελέστηκε, και ποτέ το ίδιο το κλειδί. Χρησιμοποιήστε το για span attributes μέσω του `AttributesBehavior` του [`@nestjs-pipeline/opentelemetry`](/nestjs-pipeline/packages/nestjs-pipeline/opentelemetry/#attributes-from-other-behaviors), για audit `metadata`, ή σε γραμμή log· δεν απαιτεί πακέτο τηλεμετρίας.

**Stores**

- `MemoryIdempotencyStore` — προεπιλεγμένο, μηδενικών εξαρτήσεων.
- Επιλογές `MemoryIdempotencyStore` — `{ maxEntries?, cleanupIntervalMs? }`· το `destroy()` σταματά τον καθαρισμό.
- `RedisIdempotencyStore` — `(client, { keyPrefix? })`· `RedisClientLike`,
  `RedisIdempotencyStoreOptions`.
- `PostgresIdempotencyStore` — `(db, { table? })`· `createIdempotencyTableSql(table?)`,
  `PostgresIdempotencyStoreOptions`, `PostgresQueryableLike`, `PostgresQueryResultLike`,
  `PostgresRowLike`.

**Σφάλματα & φίλτρο**

- `IdempotencyConflictError` — `{ key, requestName, reason, statusCode }`·
  `IdempotencyConflictReason`.
- `IdempotencyCompletionError` — `{ key, claimId, cause, phase, executionSucceeded }`·
  `IdempotencyFinalizationPhase`.
- `IdempotencyConflictFilter` — το αντιστοιχίζει σε `409` / `422`.
- `MissingIdempotencyPartitionError` — `{ requestName, dimension, remedy }`, εκπέμπεται
  από το βοηθητικό partitioned key όταν λείπει ο tenant, το principal ή η λειτουργία.

**Helpers & tokens**

- `idempotent(options)` — type-safe intent builder που επιστρέφει `[IdempotencyBehavior, options]` με απαιτούμενο intent κλειδιού.
- `createPartitionedIdempotencyKeyFactory(options)` — factory κλειδιών tenant/principal/λειτουργίας
  με escaping και fail-closed διαχωρισμούς· δείτε τα [Διαχωρισμένα κλειδιά](#partitioned-keys).
- `fingerprintValue(value)`. Η κανονικοποιημένη σειριοποίηση (`stableStringify`,
  `joinKeySegments`) βρίσκεται στο `@cqrs-ddd/safe-stringify`· εισαγάγετέ την από εκεί.
- `IDEMPOTENCY_STORE`, `IDEMPOTENCY_DEFAULT_OPTIONS`, `DEFAULT_IDEMPOTENCY_TTL_MS`.

**Τύποι**

- `IdempotencyStore`, `IdempotencyRecord`, `IdempotencyStatus`,
  `IdempotencyRequestKind`, `IdempotencyBehaviorOptions`, `IdempotencyIntentOptions`,
  `IdempotencyKeyFactory`, `IdempotencyReplayScopeFactory`,
  `PartitionedIdempotencyKeyOptions`, `IdempotencyPrincipalFactory`,
  `IdempotencyOperationFactory`, `IdempotencyPartitionDimension`,
  `IdempotencyModuleOptions`, `IdempotencyModuleAsyncOptions`,
  `MemoryIdempotencyStoreOptions`, `JsonValue`, `MaybePromise`.

---

## Άδεια χρήσης <a id="license"></a>

Διπλή άδεια χρήσης υπό την **AGPL-3.0-or-later** ή **Εμπορική Άδεια (Commercial License)**.
Δείτε τα [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) και [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt).
