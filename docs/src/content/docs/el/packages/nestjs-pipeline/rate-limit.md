---
title: "@nestjs-pipeline/rate-limit"
description: "Behavior ορίων ρυθμού (rate limiting) για το NestJS pipeline — ανεξάρτητο από backend, βασισμένο στο rate-limiter-flexible (memory, Redis/Valkey, Mongo, SQL drop-ins)."
editUrl: false
---

> **Από την έκδοση 0.5.0 το πακέτο αυτό συνεχίζει ως [`@cqrs-ddd/pipeline-rate-limit`](https://www.npmjs.com/package/@cqrs-ddd/pipeline-rate-limit).** Ο κώδικας, τα issues και
> οι εκδόσεις του βρίσκονται στο [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs), με τεκμηρίωση στο [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-rate-limit/).
> Οι εφαρμογές NestJS προσθέτουν το [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs). Οι εκδόσεις 0.1 έως 0.4 του
> `@nestjs-pipeline/rate-limit` παραμένουν στο npm αμετάβλητες, και η γραμμή 0.4.x λαμβάνει μόνο διορθώσεις.

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/rate-limit.svg)](https://www.npmjs.com/package/@nestjs-pipeline/rate-limit)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/rate-limit.svg)](https://www.npmjs.com/package/@nestjs-pipeline/rate-limit)

Behavior ορίων ρυθμού (rate-limiting) για το `@nestjs-pipeline/core` — καταναλώνει πόντους (points) από έναν κάδο (bucket) πριν εκτελεστεί ένας command, query, ή event handler, και πετάει `RateLimitExceededError` (→ HTTP `429`) όταν ο κάδος εξαντληθεί.

Περιορίζει ένα **command**, όχι ένα HTTP route: το ίδιο όριο ισχύει από οπουδήποτε κι αν αποσταλεί το command — έναν HTTP controller, έναν queue worker, gRPC, ένα προγραμματισμένο job — με κλειδί βασισμένο στον tenant, τον καλούντα ή οποιοδήποτε πεδίο του command. Δείτε το [Πότε να χρησιμοποιήσετε αυτό, και πότε το `@nestjs/throttler`](#when-to-use-this-and-when-nestjsthrottler).

Ανεξάρτητο από backend: εξαρτάται μόνο από ένα λιτό interface `RateLimiterLike`, το οποίο ικανοποιείται από κάθε backend του [`rate-limiter-flexible`](https://www.npmjs.com/package/rate-limiter-flexible) — **memory**, **Redis/Valkey**, **Mongo**, **Postgres**, **MySQL**. Το interface είναι δομημένο με *δομικούς τύπους (structurally typed)*, οπότε αυτό το πακέτο προσθέτει **μηδενικές βαριές εξαρτήσεις**· περνάτε τον δικό σας limiter. Μην υλοποιείτε χειροκίνητα distributed rate limiting — το `rate-limiter-flexible` παρέχει ατομικούς μετρητές και χρονικά παράθυρα χωρίς συνθήκες ανταγωνισμού.

---

## Table of Contents

- [Πότε να χρησιμοποιήσετε αυτό, και πότε το `@nestjs/throttler`](#when-to-use-this-and-when-nestjsthrottler)
- [Γιατί rate-limiter-flexible](#why-rate-limiter-flexible)
- [Εγκατάσταση](#installation)
- [Ρύθμιση](#setup)
- [Backends](#backends)
- [Συμπεριφορά](#behavior)
- [Παραμετροποίηση](#configuration)
- [Στρατηγική κλειδιών](#keying-strategy)
- [Κόστος ανά command](#cost-per-command)
- [Φίλτρο HTTP 429](#http-429-filter)
- [Fail-open έναντι fail-closed](#fail-open-vs-fail-closed)
- [Behavior Contract & Διαγνωστικά Bootstrap](#behavior-contract--bootstrap-diagnostics)
- [Αναφορά API](#api-reference)
- [Άδεια χρήσης](#license)

---

## Πότε να χρησιμοποιήσετε αυτό, και πότε το `@nestjs/throttler` <a id="when-to-use-this-and-when-nestjsthrottler"></a>

Το `@nestjs/throttler` είναι ένα HTTP guard. Περιορίζει τα αιτήματα στην περίμετρο (edge), ανά route και
πελάτη, πριν υπάρξει οποιοδήποτε command. Κρατήστε το για προστασία από καταιγισμό αιτημάτων (flood protection) στο HTTP
API σας.

Αυτό το behavior περιορίζει ένα **command ή query στο command bus**. Βλέπει ό,τι δεν μπορεί
να δει το guard: το ίδιο το command, και τον tenant και principal στο context του
pipeline. Χρησιμοποιήστε το για επιχειρησιακά quotas που πρέπει να ισχύουν σε κάθε transport.

| | `@nestjs/throttler` | `@nestjs-pipeline/rate-limit` |
|---|---|---|
| Εκτελείται στο | επίπεδο HTTP (guard) | command bus (pipeline behavior) |
| Καλύπτει | HTTP (και WebSocket/GraphQL με adapters) | κάθε αποστολή: HTTP, queue workers, gRPC, cron jobs, άλλους handlers |
| Κλειδιά βάσει | route και πελάτη (IP, custom tracker) | οτιδήποτε στο context: tenant, principal, πεδία του command |
| Κόστος | ένα αίτημα, μία καταμέτρηση | σταθερό ή υπολογιζόμενο ανά command (`points`) |
| Τυπική χρήση | "το πολύ 100 αιτήματα ανά λεπτό ανά IP" | "ένας tenant μπορεί να εισαγάγει το πολύ 10 000 εγγραφές ανά ώρα" |

Συνδυάζονται αρμονικά: throttler στην περίμετρο κατά των floods, αυτό το behavior για ποσοστώσεις
ανά command. Ένα command που περιορίζεται εδώ περιορίζεται ανεξάρτητα από το ποιο σημείο εισόδου
το απέστειλε, οπότε ένας queue worker δεν μπορεί να παρακάμψει ένα quota που σέβεται ένας
HTTP controller:

```typescript
const perTenant = createPartitionedRateLimitKeyFactory(() => undefined, {
  onMissingPartition: 'request', // ένας κάδος ανά tenant: <tenant>:<requestName>
});

@CommandHandler(ImportUsersCommand)
@UsePipeline(
  rateLimit({
    keyFactory: perTenant,
    points: (ctx) => (ctx.request as ImportUsersCommand).rows.length,
  }),
)
export class ImportUsersHandler { /* ... */ }

// HTTP
@Post('imports')
importUsers(@Body() body: ImportUsersDto) {
  return this.commandBus.execute(new ImportUsersCommand(body.rows));
}

// Queue worker: ισχύει το ίδιο ακριβώς quota.
@Processor('imports')
export class ImportWorker extends WorkerHost {
  process(job: Job<ImportUsersDto>) {
    return this.commandBus.execute(new ImportUsersCommand(job.data.rows));
  }
}
```

Το `RateLimitExceededError` είναι ανεξάρτητο από το transport: το συνοδευτικό φίλτρο το αντιστοιχίζει σε HTTP
429, και ένας worker μπορεί να διαβάσει το `msBeforeNext` για να καθυστερήσει μια επανάληψη.

---

## Γιατί rate-limiter-flexible <a id="why-rate-limiter-flexible"></a>

Το σωστό rate limiting απαιτεί **ατομικούς (atomic)** μετρητές ώστε τα ταυτόχρονα αιτήματα να μην μπορούν
να υπερβούν το όριο ενός παραθύρου — πρόκειται για πρόβλημα κατανεμημένων συστημάτων που δεν πρέπει να επιλύετε
χειροκίνητα. Το `rate-limiter-flexible` παρέχει μετρητές χωρίς συνθήκες ανταγωνισμού σε memory, Redis,
Mongo, και SQL με ένα ενιαίο API `consume(key, points)`. Αυτό το behavior περιτυλίγει αυτήν τη
μοναδική κλήση μέσα στο pipeline και αντιστοιχίζει έναν εξαντλημένο κάδο σε ένα σφάλμα με συγκεκριμένο τύπο.

---

## Εγκατάσταση <a id="installation"></a>

```bash
pnpm add @cqrs-ddd/pipeline-rate-limit @cqrs-ddd/nestjs @cqrs-ddd/pipeline @nestjs/cqrs rate-limiter-flexible
```

**Peer dependencies:**

```bash
pnpm add @nestjs/common @nestjs/core reflect-metadata
```

Απαιτεί Node.js 22.12 ή νεότερο, `@nestjs/common` και `@nestjs/core` `^12.1.0`.

> Το `rate-limiter-flexible` **δεν** αποτελεί σκληρή εξάρτηση αυτού του πακέτου — περνάτε
> το δικό σας instance limiter, επομένως φορτώνεται μόνο το backend που πραγματικά χρησιμοποιείτε. Έχει
> ελεγχθεί με το `rate-limiter-flexible` 11, το οποίο πετάει σφάλμα όταν ένας limiter δημιουργείται
> χωρίς πεπερασμένα `points` ή `duration`.

---

## Ρύθμιση <a id="setup"></a>

Στο module αξιοπιστίας σας (reliability module), ρυθμίστε τον rate limiter σας και παρέχετε το `RateLimitBehavior` ως singleton provider:

```typescript
import { Module, Logger } from '@nestjs/common';
import { PipelineModule } from '@cqrs-ddd/nestjs';
import {
  RateLimitBehavior,
  type RateLimiterLike,
} from '@cqrs-ddd/pipeline-rate-limit';
import { RateLimiterMemory } from 'rate-limiter-flexible';

export const RATE_LIMITER = Symbol('RATE_LIMITER');

@Module({
  imports: [
    PipelineModule.forRoot(),
  ],
  providers: [
    {
      provide: RATE_LIMITER,
      useFactory: () =>
        new RateLimiterMemory({
          points: 10, // 10 πόντοι ανά δευτερόλεπτο
          duration: 1,
        }),
    },
    {
      provide: RateLimitBehavior,
      inject: [RATE_LIMITER],
      useFactory: (limiter: RateLimiterLike) =>
        new RateLimitBehavior(
          limiter,
          undefined, // Προεπιλεγμένες επιλογές behavior
          new Logger(RateLimitBehavior.name),
        ),
    },
  ],
})
export class ReliabilityModule {}
```

Ενεργοποιήστε το ανά handler μέσω του `@UsePipeline(rateLimit(...))`, ή ρυθμίστε το `RateLimitBehavior` κάτω από το `globalBehaviors` στο `PipelineModule.forRoot`:

```typescript
import { rateLimit } from '@nestjs-pipeline/rate-limit';

@CommandHandler(CreateUserCommand)
@UsePipeline(
  rateLimit({
    points: 1,
    keyFactory: (ctx) => `${ctx.requestName}:${(ctx.request as CreateUserCommand).clientIp}`,
  }),
)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {}
```

> Χρησιμοποιήστε το `rateLimit({ inheritModuleKey: true })` μόνο όταν το module παρέχει το key factory.
> Η απλή μορφή tuple `@UsePipeline([RateLimitBehavior, { ... }])` παραμένει διαθέσιμη ως εναλλακτική λύση διαφυγής.

Το `IPipelineContext.request` είναι το CQRS command/query/event, και όχι αίτημα Express ή
Fastify. Εάν μια τιμή μεταφοράς όπως η διεύθυνση IP αποτελεί μέρος της
πολιτικής, αντιγράψτε την στο command/query στο όριο μεταφοράς (ή τοποθετήστε την στο
`context.items` από ένα προγενέστερο behavior) πριν εκτελεστεί το `RateLimitBehavior`.

---

## Backends <a id="backends"></a>

Η αλλαγή του backend είναι υπόθεση **μιας γραμμής** — διαφέρει μόνο ο limiter που περνάτε
στο `forRoot`/`forRootAsync`. Οι handlers παραμένουν ανέγγιχτοι.

### Memory (μεμονωμένο instance / tests) <a id="memory-single-instance--tests"></a>

```typescript
import { RateLimiterMemory } from 'rate-limiter-flexible';

RateLimitModule.forRoot({
  limiter: new RateLimiterMemory({ points: 10, duration: 1 }),
});
```

### Redis / Valkey (κοινόχρηστο μεταξύ instances) <a id="redis--valkey-shared-across-instances"></a>

```typescript
import { RateLimiterRedis } from 'rate-limiter-flexible';

RateLimitModule.forRootAsync({
  inject: [REDIS_CLIENT],
  useFactory: (redis) =>
    new RateLimiterRedis({ storeClient: redis, points: 100, duration: 60 }),
});
```

### Mongo / Postgres / MySQL <a id="mongo--postgres--mysql"></a>

```typescript
import { RateLimiterPostgres } from 'rate-limiter-flexible';

RateLimitModule.forRootAsync({
  inject: [PG_POOL],
  useFactory: (pool) =>
    new RateLimiterPostgres({ storeClient: pool, points: 100, duration: 60 }),
});
```

---

## Συμπεριφορά <a id="behavior"></a>

Για κάθε αίτημα, το `RateLimitBehavior`:

1. Επιλύει τις τελικές επιλογές (προεπιλογές module ← επιλογές ανά handler) και το
   [κόστος](#cost-per-command) του αιτήματος. Ένα κόστος `0` εκτελεί τον handler χωρίς
   να καλέσει τον limiter.
2. Κατασκευάζει το κλειδί του κάδου μέσω της [στρατηγικής κλειδιών](#keying-strategy) (με το `keyPrefix`
   όταν έχει οριστεί) και το αποθηκεύει κάτω από το `RATE_LIMIT_KEY_ITEM_TOKEN`.
3. Καλεί τη μέθοδο `limiter.consume(key, points)`, στον limiter του handler εάν έχει δοθεί,
   διαφορετικά σε εκείνον του module.
   - **Επιτρέπεται** → αποθηκεύει το αποτέλεσμα κάτω από το `RATE_LIMIT_ITEM_TOKEN` και εκτελεί
     τον handler.
   - **Υπέρβαση ορίου** → αποθηκεύει το απορριφθέν αποτέλεσμα κάτω από το `RATE_LIMIT_ITEM_TOKEN` και
     πετάει [`RateLimitExceededError`](#http-429-filter).
   - **Σφάλμα store** (π.χ. το Redis δεν αποκρίνεται) → [fail-open ή fail-closed](#fail-open-vs-fail-closed).

Ένα μεταγενέστερο behavior ή ο handler μπορεί να διαβάσει και τις δύο τιμές μέσω των typed tokens:

```typescript
import { getPipelineItem, type IPipelineContext } from '@nestjs-pipeline/core';
import {
  RATE_LIMIT_ITEM_TOKEN,
  RATE_LIMIT_KEY_ITEM_TOKEN,
} from '@nestjs-pipeline/rate-limit';

function quotaHeaders(context: IPipelineContext) {
  const result = getPipelineItem(context, RATE_LIMIT_ITEM_TOKEN);
  return {
    key: getPipelineItem(context, RATE_LIMIT_KEY_ITEM_TOKEN),
    remaining: result?.remainingPoints,
    resetInMs: result?.msBeforeNext,
  };
}
```

---

## Παραμετροποίηση <a id="configuration"></a>

Επιλογές ανά handler μέσω του `rateLimit(options)` (ή της απλής μορφής tuple
`@UsePipeline([RateLimitBehavior, options])`), με shallow συγχώνευση πάνω από τις καθολικές
`defaults` του module (υπερισχύει ο handler):

| Επιλογή | Τύπος | Προεπιλογή | Περιγραφή |
|---|---|---|---|
| `points` | `number \| (ctx) => number` | `1` | Κόστος αυτού του αιτήματος: ένας μη αρνητικός ασφαλής ακέραιος, ή συνάρτηση υπολογισμού του. Το `0` δεν χρεώνει τίποτα. Δείτε το [Κόστος ανά command](#cost-per-command). |
| `keyFactory` | `(ctx) => string` | **απαιτείται** | Κατασκευάζει το κλειδί του κάδου. Δεν υπάρχει προεπιλογή: δείτε τη [Στρατηγική κλειδιών](#keying-strategy). |
| `keyPrefix` | `string` | — | Προσαρτάται στην αρχή ως `"<prefix>:<key>"`· τα `:` και `\` μέσα στο prefix γίνονται escape, το κλειδί όχι. |
| `limiter` | `RateLimiterLike` | injected | Παράκαμψη limiter ανά handler (αυστηρότερη/χαλαρότερη πολιτική). |
| `failOpen` | `boolean` | `true` | Σε περίπτωση σφάλματος **του store**, αποδοχή (`true`) ή απόρριψη (`false`). |

Προεπιλογές σε επίπεδο module, συμπεριλαμβανομένου κοινού key factory που κληρονομούν οι handlers με
`rateLimit({ inheritModuleKey: true })`:

```typescript
RateLimitModule.forRoot({
  limiter,
  defaults: {
    keyPrefix: 'api',
    failOpen: false,
    keyFactory: createPartitionedRateLimitKeyFactory(
      (ctx) => ctx.items.get('userId') as string | undefined,
    ),
  },
});

@CommandHandler(UpdateProfileCommand)
@UsePipeline(rateLimit({ inheritModuleKey: true, points: 2 }))
export class UpdateProfileHandler { /* ... */ }
```

Το `forRootAsync` δέχεται `useFactory`, `inject` και `imports` για τον limiter, καθώς και
στατικό `defaults`. Και τα δύο δηλώνουν το module καθολικά (globally).

---

## Στρατηγική κλειδιών <a id="keying-strategy"></a>

Το **κλειδί** αποτελεί τον κάδο του rate-limit. Το `keyFactory` **απαιτείται** — δεν υπάρχει
προεπιλογή. Η προφανής επιλογή, `ctx.requestName`, αποτελεί έναν μοναδικό κάδο που μοιράζεται κάθε
καλών σε κάθε tenant, οπότε ένας κακόβουλος πελάτης αποκλείει όλους τους υπόλοιπους. Ένας limiter του οποίου
η προεπιλογή μετατρέπει έναν επιτιθέμενο σε γενική διακοπή υπηρεσίας είναι χειρότερος από την απουσία limiter, επειδή
δίνει την ψευδαίσθηση προστασίας.

Για όρια ανά καλούντα, προτιμήστε το ενσωματωμένο factory. Κατασκευάζει τη μορφή
`<tenant>:<caller>:<requestName>`, αφαιρεί τα κενά από το αναγνωριστικό του καλούντος, και κάνει escape κάθε
τμήμα, ώστε
ο tenant `a:b` με principal `c` να μην μπορεί να συγκρουστεί με τον tenant `a` και principal
`b:c`, ενώ αποτυγχάνει άμεσα (fail-closed) όταν απουσιάζει κάποια απαιτούμενη διάσταση:

```typescript
import { createPartitionedRateLimitKeyFactory } from '@nestjs-pipeline/rate-limit';

// Ανά πιστοποιημένο καλούντα, με επίγνωση tenant. Πετάει MissingRateLimitPartitionError
// όταν είτε ο tenant είτε ο καλών δεν μπορούν να επιλυθούν.
{ keyFactory: createPartitionedRateLimitKeyFactory((ctx) => ctx.items.get('callerId') as string) }

// Ανάπτυξη μεμονωμένου tenant — δηλώστε το ρητά, αντί να αφήσετε τον tenant να εξαφανιστεί.
{ keyFactory: createPartitionedRateLimitKeyFactory(readCallerId, { includeTenant: false }) }

// Επιτρέπεται ανώνυμη κίνηση: υποχωρεί σε έναν κάδο που εξακολουθεί να έχει scope στον tenant.
{ keyFactory: createPartitionedRateLimitKeyFactory(readCallerId, { onMissingPartition: 'request' }) }
```

| `PartitionedRateLimitKeyOptions` | Προεπιλογή | Αποτέλεσμα |
|---|---|---|
| `includeTenant` | `true` | Προσθέτει το `context.tenantId` ως πρώτο τμήμα. |
| `requireTenant` | τιμή του `includeTenant` | Πετάει `MissingRateLimitPartitionError` όταν λείπει ο tenant· το `false` γράφει ένα απόν τμήμα. |
| `onMissingPartition` | `'throw'` | Το `'request'` υποχωρεί σε `<tenant>:<requestName>` όταν ο καλών επιλύεται σε κενή τιμή. |

Το `MissingRateLimitPartitionError` έχει `dimension` τύπου `'tenant'` ή `'caller'`.

Ένας σκόπιμα καθολικός κάδος εξακολουθεί να υποστηρίζεται· αρκεί να οριστεί ρητά:

```typescript
{ keyFactory: (ctx) => ctx.requestName }
```

---

## Κόστος ανά command <a id="cost-per-command"></a>

Τα παρακάτω παραδείγματα υποθέτουν key factories όπως:

```typescript
const perCaller = createPartitionedRateLimitKeyFactory(
  (ctx) => ctx.items.get('userId') as string | undefined,
);
const perTenant = createPartitionedRateLimitKeyFactory(() => undefined, {
  onMissingPartition: 'request', // ένας κάδος ανά tenant: <tenant>:<requestName>
});
```

Κάθε command αποφασίζει πόσο κοστίζει μία εκτέλεση. Η χωρητικότητα του limiter (`points`
και `duration` του instance `rate-limiter-flexible`) αποτελεί τον προϋπολογισμό· η
επιλογή `points` του behavior αποτελεί την τιμή χρέωσης:

```typescript
// Σταθερό: ένα login κοστίζει 5 πόντους από τον ίδιο προϋπολογισμό από τον οποίο μια ενημέρωση προφίλ καταναλώνει 1.
rateLimit({ keyFactory: perCaller, points: 5 })

// Υπολογιζόμενο ανά αίτημα: ένας πόντος ανά εισαγόμενη γραμμή.
rateLimit({
  keyFactory: perTenant,
  points: (ctx) => (ctx.request as ImportUsersCommand).rows.length,
})

// Δωρεάν για ορισμένα αιτήματα: το 0 δεν χρεώνει τίποτα (δεν κατασκευάζεται κλειδί, ο limiter δεν καλείται).
rateLimit({
  keyFactory: perCaller,
  points: (ctx) => ((ctx.request as SearchQuery).cached ? 0 : 1),
})
```

- Το κόστος πρέπει να είναι μη αρνητικός ασφαλής ακέραιος. Μια σταθερή μη έγκυρη τιμή αποτυγχάνει
  κατά το bootstrap της εφαρμογής με `PipelineConfigurationError`· μια συνάρτηση που επιστρέφει
  μη έγκυρη τιμή πετάει `TypeError` πριν κληθεί ο limiter, οπότε ένα εσφαλμένο
  κόστος δεν χρεώνεται ποτέ σιωπηρά ως `1`.
- Ένα κόστος μεγαλύτερο από τη χωρητικότητα του limiter δεν μπορεί να περάσει ποτέ, ανεξάρτητα από τον χρόνο αναμονής.
  Το `RateLimitExceededError` φέρει τόσο τα `points` (που ζητήθηκαν) όσο και το `limit` (χωρητικότητα), οπότε
  αυτή η περίπτωση είναι απολύτως εμφανής.
- Για να δώσετε σε ένα command τον δικό του προϋπολογισμό αντί για μερίδιο του module, περάστε έναν
  `limiter` ειδικά για αυτόν τον handler.

---

## Φίλτρο HTTP 429 <a id="http-429-filter"></a>

Το `RateLimitExceededFilter` αντιστοιχίζει το `RateLimitExceededError` σε HTTP
`429 Too Many Requests` και θέτει header `Retry-After`. Το Nest κάνει inject το
`HttpAdapterHost` του, και το φίλτρο απαντά μέσω αυτού του adapter (Express και Fastify, καθώς
και για σφάλμα που ρίχτηκε σε middleware):

```typescript
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { RateLimitExceededFilter } from '@nestjs-pipeline/rate-limit';

@Module({
  providers: [{ provide: APP_FILTER, useClass: RateLimitExceededFilter }],
})
export class AppModule {}
```

Στο `main.ts`, περάστε τον host:
`app.useGlobalFilters(new RateLimitExceededFilter(app.get(HttpAdapterHost)))`.

Σώμα απόκρισης:

```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded for CreateUserCommand (key: ...); retry after 3s",
  "retryAfter": 3
}
```

Το `RateLimitExceededError` φέρει `key`, `requestName`, `msBeforeNext`,
`retryAfterSeconds` (τουλάχιστον `1`), `remainingPoints`, `points` και `limit` για προσαρμοσμένη
διαχείριση. Το `limit` είναι η ιδιότητα `points` του limiter, `undefined` όταν ο limiter
δεν εκθέτει τέτοια. Το φίλτρο χρησιμοποιεί `header()` (Fastify) ή `setHeader()` (Express),
και `json()` ή `send()`.

Εκτός HTTP, συλλάβετε το σφάλμα και επαναπρογραμματίστε την εκτέλεση, για παράδειγμα σε έναν BullMQ worker:

```typescript
import { DelayedError, type Job } from 'bullmq';
import { RateLimitExceededError } from '@nestjs-pipeline/rate-limit';

async process(job: Job<ImportUsersDto>, token?: string) {
  try {
    return await this.commandBus.execute(new ImportUsersCommand(job.data.rows));
  } catch (error) {
    if (!(error instanceof RateLimitExceededError)) throw error;
    await job.moveToDelayed(Date.now() + error.msBeforeNext, token);
    throw new DelayedError();
  }
}
```

---

## Fail-open έναντι fail-closed <a id="fail-open-vs-fail-closed"></a>

Το `consume()` **απορρίπτει με αποτέλεσμα** σε μια κανονική υπέρβαση ορίου, αλλά **απορρίπτει με
απλό `Error`** όταν αποτυγχάνει το ίδιο το υποκείμενο store (π.χ. το Redis είναι μη προσβάσιμο). Η
επιλογή `failOpen` ελέγχει αποκλειστικά το δεύτερο:

- `failOpen: true` (προεπιλογή) — καταγράφει ένα warning και επιτρέπει στο αίτημα να περάσει. Ο
  logger είναι αυτός που έχει συνδεθεί στο `LOGGING_BEHAVIOR_LOGGER` του `@nestjs-pipeline/core`,
  ή ένας Nest `Logger` όταν δεν έχει συνδεθεί κανένας.
  Ευνοεί τη **διαθεσιμότητα (availability)**: μια διακοπή του store δεν θα ρίξει το API σας.
- `failOpen: false` — καταγράφει ένα σφάλμα και διαδίδει το αρχικό σφάλμα. Ευνοεί την **αυστηρή προστασία**: κανένα
  αίτημα δεν παρακάμπτει τον limiter, με κόστος την αποτυχία όταν το store δεν λειτουργεί.

---

## Behavior Contract & Διαγνωστικά Bootstrap <a id="behavior-contract--bootstrap-diagnostics"></a>

Το `RateLimitBehavior` υλοποιεί τα διαγνωστικά συμβολαίου behavior του `@nestjs-pipeline/core`:

### Κανόνες Επικύρωσης (Validation Invariants) <a id="validation-invariants"></a>

- **Απαιτείται κλήσιμη συνάρτηση key factory**: Όποτε το `RateLimitBehavior` δηλώνεται σε έναν handler ή καθολικά στο `PipelineModule.forRoot({ globalBehaviors })`, πρέπει να παρέχεται μια κλήσιμη συνάρτηση `keyFactory: (context) => string` (`typeof === 'function'`) είτε μέσω των επιλογών handler (`rateLimit({ keyFactory })`) είτε μέσω των καθολικών προεπιλογών του module (`RateLimitModule.forRoot({ defaults: { keyFactory } })`).
- **Επιβολή στο Bootstrap**: Η δήλωση του `RateLimitBehavior` χωρίς κλήσιμο key factory (π.χ. περνώντας string, μη κλήσιμη τιμή, ή παραλείποντάς το όταν δεν υπάρχει προεπιλογή module) αποτυγχάνει άμεσα κατά την εκκίνηση της εφαρμογής με `PipelineConfigurationError` στην κατάσταση διαγνωστικών `strict` (την προεπιλογή του `PipelineModule`)· η κατάσταση `'warn'` το καταγράφει αντί να αποτύχει.
- **Έγκυρο σταθερό κόστος**: ένα σταθερό `points` πρέπει να είναι μη αρνητικός ασφαλής ακέραιος, ή το `points` πρέπει να είναι συνάρτηση· οτιδήποτε άλλο αποτυγχάνει κατά την εκκίνηση με `PipelineConfigurationError`. Ένα υπολογιζόμενο κόστος ελέγχεται ανά αίτημα.
- **Επίλυση προεπιλογών module**: Προεπιλογές σε επίπεδο εφαρμογής που παρέχονται στο `RateLimitModule.forRoot({ defaults: { ... } })` συγχωνεύονται κάτω από τις επιλογές handler μέσω του `RateLimitBehavior.resolveEffectiveOptions` και αξιολογούνται κατά τα διαγνωστικά bootstrap.

---

## Αναφορά API <a id="api-reference"></a>

| Export | Τύπος | Περιγραφή |
|---|---|---|
| `RateLimitBehavior` | Κλάση | Pipeline behavior — καταναλώνει πόντους πριν από τον handler |
| `rateLimit` | Συνάρτηση | Type-safe intent builder που επιστρέφει `[RateLimitBehavior, options]` απαιτώντας κλειδί ή ρητή κληρονομικότητα |
| `RateLimitIntentOptions` | Τύπος | Επιλογές για το `rateLimit(...)` με απαιτούμενο intent κλειδιού |
| `RateLimitModule` | Κλάση | `forRoot(options)` / `forRootAsync(options)` |
| `RateLimitExceededError` | Κλάση | Εκπέμπεται όταν ένας κάδος εξαντληθεί· φέρει τα `points` που ζητήθηκαν και το `limit` |
| `RateLimitExceededFilter` | Κλάση | Αντιστοιχίζει το σφάλμα σε HTTP 429 + `Retry-After` |
| `RateLimiterLike` | Interface | Δομική μορφή limiter: `consume(key, points?)` |
| `RateLimiterResLike` | Interface | Δομικό αποτέλεσμα του `rate-limiter-flexible` |
| `RateLimitBehaviorOptions` | Interface | `{ points?, keyFactory?, keyPrefix?, limiter?, failOpen? }` |
| `RateLimitCostFactory` | Τύπος | `(ctx) => number`, κόστος ανά αίτημα για τα `points` |
| `RateLimitModuleOptions` / `RateLimitModuleAsyncOptions` | Interface | Επιλογές δήλωσης του module |
| `RateLimitKeyFactory` | Τύπος | `(ctx) => string`, το κλειδί του κάδου |
| `createPartitionedRateLimitKeyFactory` | Συνάρτηση | Factory κλειδιών `<tenant>:<caller>:<requestName>` με διαφυγή χαρακτήρων και επίγνωση tenant |
| `PartitionedRateLimitKeyOptions` | Interface | `{ includeTenant?, requireTenant?, onMissingPartition? }` |
| `RateLimitPartitionFactory` | Τύπος | `(ctx) => string \| undefined`, το αναγνωριστικό του καλούντος |
| `MissingRateLimitPartitionError` / `RateLimitPartitionDimension` | Κλάση / Τύπος | Εκπέμπεται όταν λείπει απαιτούμενος tenant ή καλών |
| `buildRateLimitKey` | Συνάρτηση | Επιλύει το κλειδί του κάδου από context + options· πετάει `TypeError` χωρίς `keyFactory` |
| `RATE_LIMITER` / `RATE_LIMIT_DEFAULT_OPTIONS` | Token | Injection tokens |
| `RATE_LIMIT_ITEM` / `RATE_LIMIT_KEY_ITEM` | Symbol | Εξαγόμενα μοναδικά Symbol keys στο `context.items` που τίθενται ανά αίτημα |
| `RATE_LIMIT_ITEM_TOKEN` / `RATE_LIMIT_KEY_ITEM_TOKEN` | `PipelineItemToken` | Typed tokens πάνω από τα ίδια κλειδιά (`RateLimiterResLike` / `string`), για το `getPipelineItem` |
| `buildRateLimitAttributes` | Συνάρτηση | Το attribute `rate_limit.remaining_points`, για attributes span μέσω του `AttributesBehavior` του [`@nestjs-pipeline/opentelemetry`](/nestjs-pipeline/packages/nestjs-pipeline/opentelemetry/#attributes-from-other-behaviors), audit `metadata` ή logs· `{}` όταν το behavior δεν εκτελέστηκε ή το store δεν ανέφερε πόντους. Το κλειδί δεν περιλαμβάνεται ποτέ |

---

## Άδεια χρήσης <a id="license"></a>

Διπλή άδεια χρήσης υπό την **AGPLv3** και **Εμπορική Άδεια (Commercial License)**. Δείτε τα [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) και [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt) στη ρίζα για λεπτομέρειες.

Επικοινωνία: **aristotelis@ik.me**
