---
title: "@nestjs-pipeline/correlation"
description: "Διάδοση Correlation ID για το NestJS (HTTP, Bull, RabbitMQ, Kafka, gRPC, NATS, cron)"
editUrl: false
---

> **Από την έκδοση 0.5.0 αυτό το πακέτο συνεχίζει ως [`@cqrs-ddd/pipeline-correlation`](https://www.npmjs.com/package/@cqrs-ddd/pipeline-correlation).** Ο κώδικας, τα issues και
> τα releases βρίσκονται στο [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs), με τεκμηρίωση στο [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-correlation/).
> Οι εφαρμογές NestJS προσθέτουν το [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs). Οι εκδόσεις 0.1 έως 0.4 του
> `@nestjs-pipeline/correlation` παραμένουν στο npm αμετάβλητες, και η γραμμή 0.4.x λαμβάνει μόνο διορθώσεις (fixes).

Αυτόνομη διάδοση Correlation ID (correlation ID propagation) για εφαρμογές NestJS. Λειτουργεί με HTTP,
Bull/BullMQ, RabbitMQ, Kafka, NATS, gRPC, cron jobs και οποιοδήποτε προσαρμοσμένο transport.

Μέρος του monorepo [@nestjs-pipeline](/nestjs-pipeline/overview/).

## Πίνακας Περιεχομένων <a id="table-of-contents"></a>

- [Εγκατάσταση](#installation)
- [Χαρακτηριστικά](#features)
- [Γρήγορη εκκίνηση](#quick-start)
- [HTTP](#http)
- [Queue consumers και άλλα σημεία εισόδου](#queue-consumers-and-other-entry-points)
- [Αναφορά API](#api-reference)
- [Μετάβαση από την έκδοση 0.1.x](#migrating-from-01x)

## Εγκατάσταση <a id="installation"></a>

```bash
pnpm add @cqrs-ddd/pipeline-correlation @cqrs-ddd/nestjs @nestjs/common
```

Απαιτεί Node.js 22.12 ή νεότερο και `@nestjs/common` `^12.1.0`.

Το πακέτο έχει στην κατοχή του το correlation store και δεν εξαρτάται από κανένα άλλο πακέτο pipeline. Για να δώσετε
στα pipelines το correlation ID, περάστε το `correlationSource` στο `PipelineModule.forRoot`:

```typescript
import { PipelineModule } from '@cqrs-ddd/nestjs';
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';

PipelineModule.forRoot({
  sources: { correlationId: correlationSource },
});
```

Ένα pipeline λαμβάνει τότε το ID ως το `context.correlationId` του, και η κλήση `getCorrelationId()`
μέσα σε έναν handler επιστρέφει αυτό το ίδιο ID. Για HTTP ingress, εφαρμόστε το `CorrelationMiddleware` από το `@cqrs-ddd/nestjs`.

## Χαρακτηριστικά <a id="features"></a>

- **`getCorrelationId()`** — Ανάγνωση του ενεργού ID, ή παραγωγή νέου UUIDv7 (που παράγεται σε κάθε κλήση) όταν κανένα context δεν είναι ενεργό
- **`runWithCorrelationId(id, fn)`** — Εκτέλεση callback εντός ενός correlation context
- **`addCorrelationId(data)`** — Προσθήκη σφραγίδας με το τρέχον ID σε ένα payload (πλευρά παραγωγού - producer)
- **`correlationHeaders(key?)`** — Επιστροφή αντικειμένου headers για transports βασισμένα σε headers
- **`@WithCorrelation()`** — Decorator για μη-HTTP σημεία εισόδου (Bull, RabbitMQ, κ.λπ.)
- **`CorrelationFrom`** — Προκατασκευασμένοι extractors για AMQP, Kafka, NATS, gRPC
- **`HttpCorrelationMiddleware`** — NestJS middleware για HTTP correlation, με επικύρωση των IDs που παρέχονται από clients
- **`correlationSource`** — Το store ως πηγή context για τα `PipelineModule` και `JobContextModule`

## Γρήγορη εκκίνηση <a id="quick-start"></a>

### Πλευρά παραγωγού — προσθήκη σφραγίδας correlation ID

Χρησιμοποιήστε το `addCorrelationId(data)` για να επισυνάψετε το τρέχον correlation ID σε οποιοδήποτε
plain-object payload πριν από τη δημοσίευση ή την τοποθέτηση στην ουρά:

```ts
import { addCorrelationId } from '@nestjs-pipeline/correlation';

// Bull / BullMQ
await queue.add('send-email', addCorrelationId({ userId, email }));

// RabbitMQ (ClientProxy)
this.client.emit('user.created', addCorrelationId(payload));
```

> **⚠️ Απαιτείται απλό αντικείμενο (plain object).** Πίνακες, ημερομηνίες, maps, sets και class
> instances μπορούν να χάσουν τη δομή τους κατά το spread, επομένως το `addCorrelationId` τα απορρίπτει.
> Τυλίξτε τα πρώτα:
>
> ```ts
> // ❌ Εγείρει TypeError
> addCorrelationId([item1, item2]);
>
> // ✅ Σωστό
> addCorrelationId({ items: [item1, item2] });
> ```

Για transports βασισμένα σε headers (Kafka, NATS, gRPC), χρησιμοποιήστε αντ' αυτού το `correlationHeaders()`:

```ts
import { correlationHeaders } from '@nestjs-pipeline/correlation';

await producer.send({
  topic: 'orders',
  messages: [{ value: JSON.stringify(order), headers: correlationHeaders() }],
});
```

### Πλευρά καταναλωτή — εξαγωγή του correlation ID

Χρησιμοποιήστε το `@WithCorrelation()` σε οποιονδήποτε μη-HTTP handler για να επαναφέρετε το correlation
context:

```ts
import { WithCorrelation, getCorrelationId } from '@nestjs-pipeline/correlation';

// Bull (προεπιλεγμένη διαδρομή: data.correlationId, logs σε debug level)
@Process('send-email')
@WithCorrelation()
async handleSendEmail(job: Job) {
  const id = getCorrelationId(); // το ίδιο ID που σφράγισε ο παραγωγός
}

// Καταστολή του αρχικού log εκκίνησης
@Process('send-sms')
@WithCorrelation({ logLevel: 'none' })
async handleSendSms(job: Job) { }
```

Για transports με εγγενή headers, χρησιμοποιήστε τα προκαθορισμένα πρότυπα του `CorrelationFrom`:

```ts
import { CorrelationFrom } from '@nestjs-pipeline/correlation';

// RabbitMQ
@MessagePattern('user.created')
@WithCorrelation(CorrelationFrom.amqp())
async handle(@Payload() data: any, @Ctx() ctx: RmqContext) { }

// Kafka
@EventPattern('order.placed')
@WithCorrelation(CorrelationFrom.kafka())
async handle(@Payload() data: any, @Ctx() ctx: KafkaContext) { }
```

> **⚠️ Array payloads:** Η προεπιλεγμένη εξαγωγή dot-path αναμένει το πρώτο
> όρισμα να είναι αντικείμενο. Εάν ο handler σας λαμβάνει πίνακα, ο διακοσμητής
> καταγράφει μια προειδοποίηση και διατηρεί το τρέχον ID, ή δημιουργεί ένα νέο όταν δεν υπάρχει κανένα. Χρησιμοποιήστε
> την επιλογή `extract`:
>
> ```ts
> @WithCorrelation({ extract: (items) => items?.[0]?.correlationId })
> async handle(items: any[]) { }
> ```

## HTTP <a id="http"></a>

Δηλώστε το `HttpCorrelationMiddleware` ρητά· το `PipelineModule` δεν το εγκαθιστά αυτόματα.
Διαβάζει το header `x-correlation-id`, αποδέχεται την τιμή μόνο όταν είναι το πολύ 128
χαρακτήρες και ταιριάζει με το `DEFAULT_CORRELATION_ID_PATTERN`, και διαφορετικά παράγει ένα UUIDv7.
Αντηχεί το επιλεγμένο ID στο header απάντησης με το ίδιο όνομα και εκτελεί το υπόλοιπο
αίτημα μέσα σε αυτό.

```typescript
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HttpCorrelationMiddleware } from '@nestjs-pipeline/correlation';

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpCorrelationMiddleware).forRoutes('*');
  }
}
```

Για να αλλάξετε το header ή την πολιτική επικύρωσης, παρέχετε το `CORRELATION_OPTIONS` στο module
που εφαρμόζει το middleware:

```typescript
import {
  CORRELATION_OPTIONS,
  type CorrelationOptions,
  HttpCorrelationMiddleware,
} from '@nestjs-pipeline/correlation';

const correlationOptions: CorrelationOptions = {
  header: 'x-request-id',
  trimIncoming: true,
  maxLength: 36,
  validateIncoming: (id) => /^[0-9a-f-]{36}$/i.test(id),
};

@Module({
  providers: [{ provide: CORRELATION_OPTIONS, useValue: correlationOptions }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpCorrelationMiddleware).forRoutes('*');
  }
}
```

| Επιλογή | Προεπιλογή | Αποτέλεσμα |
| --- | --- | --- |
| `header` | `'x-correlation-id'` | Header προς ανάγνωση και αντήχηση. Ένα μη έγκυρο όνομα πεδίου HTTP εγείρει εξαίρεση κατά την κατασκευή· οποιαδήποτε μη συμβολοσειρική τιμή, συμπεριλαμβανομένου του `false`, επιλέγει την προεπιλογή. Δεν απενεργοποιεί το middleware. |
| `acceptIncoming` | `true` | Το `false` αγνοεί τα IDs των clients και παράγει πάντοτε ένα νέο |
| `trimIncoming` | `false` | Αφαίρεση κενών διαστημάτων πριν από την επικύρωση |
| `maxLength` | `128` | Μεγαλύτερα IDs αντικαθίστανται· πρέπει να είναι θετικός ασφαλής ακέραιος (safe integer) |
| `validateIncoming` | Έλεγχος `DEFAULT_CORRELATION_ID_PATTERN` | Αντικαθιστά τον έλεγχο pattern· επιστροφή `false` ή έγερση εξαίρεσης απορρίπτει το ID. Το `maxLength` εξακολουθεί να ισχύει. |

Εξερχόμενες HTTP κλήσεις προωθούν το ID με το `correlationHeaders()`:

```typescript
await fetch(url, { headers: { ...correlationHeaders(), 'content-type': 'application/json' } });
```

## Queue consumers και άλλα σημεία εισόδου <a id="queue-consumers-and-other-entry-points"></a>

Το `@WithCorrelation()` και το `runWithCorrelationId(id, fn)` επιτελούν το ίδιο έργο: εκτελούν την εργασία
μέσα στο δεδομένο ID, ή μέσα στο τρέχον ή σε ένα νέο ID όταν το ID λείπει. Κανένα από τα δύο
δεν επικυρώνει το ID· χρησιμοποιήστε το `correlationSource.accepts(id)` για IDs από μη έμπιστες πηγές.

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { CommandBus } from '@nestjs/cqrs';
import { Job } from 'bullmq';
import { WithCorrelation, type WithCorrelationId } from '@nestjs-pipeline/correlation';

@Processor('emails')
export class EmailProcessor extends WorkerHost {
  constructor(private readonly commandBus: CommandBus) {
    super();
  }

  @WithCorrelation()
  async process(job: Job<WithCorrelationId<{ userId: string }>>) {
    await this.commandBus.execute(new SendEmailCommand(job.data.userId));
  }
}
```

Χωρίς decorator, για παράδειγμα σε έναν χειροκίνητο βρόχο καταναλωτή:

```typescript
import { correlationSource, runWithCorrelationId } from '@nestjs-pipeline/correlation';

async function onMessage(message: { correlationId?: string; body: OrderPlaced }) {
  const incoming = message.correlationId;
  const id = incoming && correlationSource.accepts(incoming) ? incoming : undefined;
  await runWithCorrelationId(id, () => commandBus.execute(new ProjectOrder(message.body)));
}
```

Προσαρμοσμένη διαδρομή ή extractor, και cron εργασία που λαμβάνει νέο ID ανά εκτέλεση:

```typescript
@WithCorrelation('data.meta.requestId')
async process(job: Job) {}

@EventPattern('order.placed')
@WithCorrelation({ extract: (_data, ctx) => (ctx as KafkaContext).getMessage().headers?.['x-correlation-id']?.toString() })
async onOrder(@Payload() data: unknown, @Ctx() ctx: KafkaContext) {}

@Cron('0 * * * *')
@WithCorrelation({ logLevel: 'none' })
async hourlySync() {}
```

Για jobs που φέρουν επίσης tenant και principal, χρησιμοποιήστε αντ' αυτού τα `withJobContext` και `@InJobContext`
του [`@nestjs-pipeline/job-context`](/nestjs-pipeline/packages/nestjs-pipeline/job-context/).

## Αναφορά API <a id="api-reference"></a>

| Export | Τύπος | Περιγραφή |
|--------|------|-------------|
| `getCorrelationId()` | `() => string` | Ανάγνωση του τρέχοντος correlation ID, ή παραγωγή ενός UUIDv7 όταν δεν υπάρχει κανένα |
| `runWithCorrelationId(id, fn)` | `(id: string \| undefined, fn: () => T) => T` | Εκτέλεση ενός callback μέσα σε ένα συμπληρωμένο correlation context |
| `addCorrelationId(data)` | `(data: T) => WithCorrelationId<T>` | Προσθήκη σφραγίδας του τρέχοντος ID σε ένα plain-object payload· εγείρει `TypeError` διαφορετικά |
| `WithCorrelationId<T>` | Type | `T & { correlationId: string }` |
| `correlationHeaders(key?)` | `(key?: string) => Record<string, string>` | Επιστροφή αντικειμένου headers για transports βασισμένα σε headers |
| `@WithCorrelation(opts?)` | Decorator | Επαναφορά του correlation context σε μη-HTTP σημεία εισόδου |
| `CorrelationDecoratorOptions`, `CorrelationExtractor` | Types | `{ path?, extract?, logLevel?, logger? }` και η υπογραφή του extractor |
| `CorrelationFrom` | Object | Προκατασκευασμένοι extractors: `.amqp()`, `.kafka()`, `.nats()`, `.grpc()` |
| `HttpCorrelationMiddleware` | NestJS Middleware | Εξάγει/παράγει correlation ID από το HTTP `x-correlation-id` header· αποδέχεται εισερχόμενο ID μήκους το πολύ 128 χαρακτήρων που ταιριάζει με το `DEFAULT_CORRELATION_ID_PATTERN` εκτός αν το `CORRELATION_OPTIONS` παρακάμπτει τα `maxLength`/`validateIncoming` |
| `CORRELATION_OPTIONS`, `CorrelationOptions` | Token, type | Ρύθμιση παραμέτρων middleware |
| `DEFAULT_CORRELATION_HEADER` | Constant | `'x-correlation-id'` |
| `DEFAULT_CORRELATION_ID_MAX_LENGTH`, `DEFAULT_CORRELATION_ID_PATTERN` | Constants | Προεπιλεγμένο όριο μήκους εισερχόμενου ID (128) και σύνολο χαρακτήρων |
| `correlationSource` | Object | `{ current, run, create, accepts }` πάνω στο correlation store, για τα `PipelineModule.forRoot({ sources })` και `JobContextModule.forRoot`· το `current()` δεν παράγει τίποτα, το `create()` είναι το μοναδικό σημείο όπου κατασκευάζεται νέο ID, και το `accepts(id)` εφαρμόζει τον προεπιλεγμένο κανόνα μήκους και χαρακτήρων σε ένα ID που παραλαμβάνεται εξωτερικά |

### Ενσωμάτωση στο pipeline <a id="pipeline-integration"></a>

Με διαμορφωμένο το `correlationSource`, ένα pipeline λαμβάνει το τρέχον correlation ID όταν ξεκινά και εκτελεί τα behaviors
και τον handler του μέσα σε αυτό, ώστε το `getCorrelationId()` σε έναν handler να ισούται με το
`context.correlationId`, συμπεριλαμβανομένων των event handlers και των ένθετων commands που
αποστέλλει. Εκτός οποιουδήποτε scope, το pipeline λαμβάνει ένα νέο ID από το
`correlationSource.create()`. Χωρίς το `correlationSource` στο `sources`, ένα pipeline δεν
εκτελείται μέσα σε αυτό το store, επομένως το `getCorrelationId()` στον handler του δεν επιστρέφει το
`context.correlationId`.

## Μετάβαση από την έκδοση 0.1.x <a id="migrating-from-01x"></a>

Αυτά τα βήματα οδηγούν στην έκδοση 0.2.0. Για να φτάσετε στην 0.4.0, συνεχίστε με το [Αναβάθμιση από την 0.2.x](/nestjs-pipeline/upgrading/from-0-2/) και
το [Αναβάθμιση από την 0.3.x](/nestjs-pipeline/upgrading/from-0-3/) στο README του repository.

**Peer dependency.** Το `@nestjs/common` 10 δεν υποστηρίζεται πλέον· το εύρος peer dependencies είναι
`^11.0.0`.

**Τα `correlationIdFactory` και `correlationIdRunner` αντικαθίστανται από το `sources`.**

```typescript
// 0.1.x
PipelineModule.forRoot({
  correlationIdFactory: getCorrelationId,
  correlationIdRunner: runWithCorrelationId,
});

// 0.2.0
import { correlationSource } from '@nestjs-pipeline/correlation';

PipelineModule.forRoot({ sources: { correlationId: correlationSource } });
```

**Το `correlationStore` καταργείται.** Χρησιμοποιήστε τις συναρτήσεις πάνω στο store.

```typescript
// 0.1.x
correlationStore.run(id, () => this.commandBus.execute(command));
const current = correlationStore.getStore(); // string | undefined

// 0.2.0
await runWithCorrelationId(id, () => this.commandBus.execute(command));
const current = correlationSource.current(); // string | undefined, generates nothing
```

**Το `setCorrelationFallback` καταργείται.** Το `getCorrelationId()` εκτός ενός context πλέον παράγει
πάντοτε ένα UUIDv7. Εισέλθετε σε ένα context όπου ξεκινά η εργασία αντί να δηλώνετε fallback.

```typescript
// 0.1.x
setCorrelationFallback(() => otelTraceId());

// 0.2.0
await runWithCorrelationId(otelTraceId(), () => work());
```

**Το `uuidv7` μεταφέρθηκε στο `@cqrs-ddd/uuidv7`.**

```typescript
// 0.1.x
import { uuidv7 } from '@nestjs-pipeline/correlation';

// 0.2.0
import { uuidv7 } from '@cqrs-ddd/uuidv7';
```

**Το `context.correlationId` είναι μόνο για ανάγνωση (read-only)** και το `originalCorrelationId` καταργείται από το
pipeline context του `@nestjs-pipeline/core`. Ορίστε το ID στο σημείο εισόδου της εργασίας.

```typescript
// 0.1.x, in a behavior
context.correlationId = request.headers['x-request-id'];

// 0.2.0, at the entry point
{ provide: CORRELATION_OPTIONS, useValue: { header: 'x-request-id' } }
```

**Τα εισερχόμενα HTTP IDs επικυρώνονται.** Το `HttpCorrelationMiddleware` πλέον αντικαθιστά ένα ID μεγαλύτερο
από 128 χαρακτήρες ή εκτός του `DEFAULT_CORRELATION_ID_PATTERN`, μετατρέπει σε πεζά (lowercases) το διαμορφωμένο
header, εγείρει εξαίρεση σε μη έγκυρο όνομα header, και ορίζει το ID στην απάντηση. Για να συνεχίσετε
να αποδέχεστε οποιαδήποτε μη κενή τιμή:

```typescript
{ provide: CORRELATION_OPTIONS, useValue: { maxLength: 4096, validateIncoming: () => true } }
```

**Το `addCorrelationId` αποδέχεται μόνο απλά αντικείμενα (plain objects).** Η έκδοση 0.1.x απέρριπτε πίνακες· η 0.2.0
απορρίπτει επίσης class instances, `Date`, `Map` και άλλα μη απλά αντικείμενα.

```typescript
// 0.1.x accepted, 0.2.0 throws TypeError
addCorrelationId(new OrderPlaced(orderId));

// 0.2.0
addCorrelationId({ ...orderPlaced });
```
