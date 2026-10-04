---
title: "@nestjs-pipeline/core"
description: "Βασική βιβλιοθήκη pipeline behaviors για το NestJS CQRS"
editUrl: false
---

> **Από την έκδοση 0.5.0 το πακέτο αυτό συνεχίζει ως [`@cqrs-ddd/pipeline`](https://www.npmjs.com/package/@cqrs-ddd/pipeline).** Ο κώδικας, τα issues και
> οι εκδόσεις του βρίσκονται στο [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs), με τεκμηρίωση στο [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline/).
> Οι εφαρμογές NestJS προσθέτουν το [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs). Οι εκδόσεις 0.1 έως 0.4 του
> `@nestjs-pipeline/core` παραμένουν στο npm αμετάβλητες, και η γραμμή 0.4.x λαμβάνει μόνο διορθώσεις.

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/core.svg)](https://www.npmjs.com/package/@nestjs-pipeline/core)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/core.svg)](https://www.npmjs.com/package/@nestjs-pipeline/core)

Pipeline behaviors για το **NestJS CQRS** — περιτυλίξτε κάθε command, query, και event handler με επαναχρησιμοποιήσιμα cross-cutting concerns χρησιμοποιώντας μια καθαρή αλυσίδα τύπου middleware.

Το peer contract του περιλαμβάνει επίσης τα τυπικά NestJS runtime peers
`reflect-metadata` και `rxjs`. Λειτουργεί με Express και Fastify.

---

## Table of Contents

- [Εγκατάσταση](#installation)
- [Μετάβαση από την έκδοση 0.1.x](#migrating-from-01x)
- [Δήλωση Module](#module-registration)
  - [forRoot()](#forroot)
  - [forFeature()](#forfeature)
  - [Ασύγχρονη δήλωση](#async-registration)
- [Ο Decorator @UsePipeline](#the-usepipeline-decorator)
- [Δημιουργία Custom Behavior](#writing-a-custom-behavior)
- [Pipeline Context](#pipeline-context)
  - [Ιδιότητες](#properties)
  - [Επιλογές Behavior](#behavior-options)
  - [Επικοινωνία μεταξύ Behaviors](#inter-behavior-communication)
- [Καθολικά Behaviors](#global-behaviors)
  - [Πεδίο εφαρμογής (Scoping)](#scoping)
  - [Αποφυγή διπλοτύπων (Deduplication)](#deduplication)
  - [Παράκαμψη καθολικών Behaviors (@SkipPipeline)](#skipping-global-behaviors-skippipeline)
- [Ενσωματωμένο LoggingBehavior](#built-in-loggingbehavior)
- [Tenant και correlation ID](#tenant-and-correlation-id)
  - [HTTP Αιτήματα](#http-requests)
  - [Μη-HTTP σημεία εισόδου](#non-http-entry-points)
  - [Decorator @WithCorrelation](#withcorrelation-decorator)
  - [Βοηθητικά εργαλεία στην πλευρά παραγωγού](#producer-side-utilities)
  - [Ανάγνωση του τρέχοντος Correlation ID](#reading-the-current-correlation-id)
  - [Εμφωλευμένα Commands και Sagas](#nested-commands-and-sagas)
- [Μοντέλο Εκτέλεσης](#execution-model)
- [Διαγνωστικά Bootstrap & Συμβόλαια Behaviors](#bootstrap-diagnostics--behavior-contracts)
- [Αναφορά API](#api-reference)
- [Άδεια χρήσης](#license)

---

## Εγκατάσταση <a id="installation"></a>

```bash
pnpm add @cqrs-ddd/pipeline @cqrs-ddd/nestjs @nestjs/cqrs
```

**Peer dependencies:**

```bash
pnpm add @nestjs/common @nestjs/core reflect-metadata rxjs
```

Απαιτεί Node.js 22.12 ή νεότερο, Nest 12.1 ή νεότερο.
Το `@cqrs-ddd/pipeline` παρέχει τη framework-neutral μηχανή του pipeline (`@UsePipeline`, `@SkipPipeline`, plan compilation, contracts), και το `@cqrs-ddd/nestjs` παρέχει την ενσωμάτωση bootstrap για το NestJS (`PipelineModule`, `PipelineBootstrap`).

---

## Μετάβαση από την έκδοση 0.1.x <a id="migrating-from-01x"></a>

Αυτά τα βήματα οδηγούν στην έκδοση 0.2.0. Για να φτάσετε στην 0.4.0, συνεχίστε με την [Αναβάθμιση από 0.2.x](/nestjs-pipeline/upgrading/from-0-2/) και
την [Αναβάθμιση από 0.3.x](/nestjs-pipeline/upgrading/from-0-3/) στο README του repository.

Η έκδοση 0.2.0 περιλαμβάνει τις ακόλουθες breaking changes για εφαρμογές στην 0.1.18. Η πλήρης λίστα
βρίσκεται στο [CHANGELOG](/nestjs-pipeline/changelog/) του repository.

**NestJS 11 και Node.js 22.** Τα peers `@nestjs/common`, `@nestjs/core` και
`@nestjs/cqrs` είναι `^11.0.0`· το NestJS 10 δεν υποστηρίζεται πλέον.

**Το `sources` αντικαθιστά τα `correlationIdFactory` και `correlationIdRunner`.**

```typescript
// 0.1.x
PipelineModule.forRoot({
  correlationIdFactory: getCorrelationId,
  correlationIdRunner: runWithCorrelationId,
});

// 0.2.0
import { correlationSource } from '@nestjs-pipeline/correlation';
import { tenantSource } from '@nestjs-pipeline/tenant';

PipelineModule.forRoot({
  sources: { tenantId: tenantSource, correlationId: correlationSource },
});
```

Η παράλειψη του `sources` καταγράφει ένα warning κατά το bootstrap· το `sources: {}` δηλώνει ρητά ότι η εφαρμογή
δεν χρησιμοποιεί κανένα από τα δύο stores.

**Το `context.correlationId` είναι πλέον μόνο για ανάγνωση (read-only), και το `originalCorrelationId` καταργήθηκε.** Ένα
behavior δεν μπορεί πλέον να αντικαταστήσει το ID ενός ενεργού pipeline. Ορίστε το εκεί όπου η εργασία εισέρχεται
στην εφαρμογή:

```typescript
// 0.1.x, μέσα σε ένα behavior
context.correlationId = context.request.messageId;
const original = context.originalCorrelationId;

// 0.2.0, στο σημείο εισόδου
import { runWithCorrelationId } from '@nestjs-pipeline/correlation';

await runWithCorrelationId(message.id, () => commandBus.execute(command));
// μέσα σε ένα behavior, το context.correlationId είναι πλέον message.id
```

**Εσωτερικά exports καταργήθηκαν.** Τα `PipelineBootstrapService`, `PIPELINE_MODULE_OPTIONS`,
`PIPELINE_OPTIONS_REGISTRY`, `clearPipelineOptionsRegistry`, `SET_RESPONSE` και
`SET_ORIGINAL_CORRELATION_ID` δεν γίνονται πλέον export. Ρυθμίστε το pipeline μέσω
του `forRoot` ή `forRootAsync`, και διαβάστε τις επιλογές του handler μέσω
του `context.getBehaviorOptions()`:

```typescript
// 0.1.x
const options = PIPELINE_OPTIONS_REGISTRY.get('CreateUserHandler');
afterEach(() => clearPipelineOptionsRegistry());

// 0.2.0, μέσα σε ένα behavior
const options = context.getBehaviorOptions<AuditOptions>(AuditBehavior);
```

**Βοηθητικές συναρτήσεις μεταφέρθηκαν στα πακέτα `@cqrs-ddd/*`.** Το core δεν τις επανεξάγει πλέον:

```typescript
// 0.1.x
import { isUuidV7, untyped, uuidv7 } from '@nestjs-pipeline/core';

// 0.2.0
import { isUuidV7, uuidv7 } from '@cqrs-ddd/uuidv7';
import { untyped } from '@cqrs-ddd/untyped';
import { safeStringify, stableStringify } from '@cqrs-ddd/safe-stringify';
```

**Το `LoggingBehavior` εφαρμόζει redaction σε ευαίσθητα κλειδιά από προεπιλογή.** Με ενεργοποιημένη την καταγραφή payload,
κλειδιά όπως τα `password`, `token`, `authorization` και `cardNumber` καταγράφονται ως
`[REDACTED]`. Απενεργοποιήστε το μόνο όταν τα μη επεξεργασμένα payloads αποτελούν ρητή απαίτηση:

```typescript
// Η 0.1.x κατέγραφε αυτές τις τιμές σε καθαρό κείμενο
@UsePipeline([LoggingBehavior, { excludeRequestObj: false }])

// 0.2.0, για επαναφορά της προηγούμενης συμπεριφοράς
@UsePipeline(logging({ excludeRequestObj: false, redactSensitiveKeys: false }))
```

**Η ταυτότητα ενός behavior είναι η κλάση του, όχι το όνομά του.** Χωρίς το `PIPELINE_BEHAVIOR_ID`,
δύο ξεχωριστές κλάσεις με το ίδιο όνομα αποτελούν πλέον δύο διαφορετικά behaviors, και το `getBehaviorId()`
επιστρέφει την κλάση αντί για string. Αντίγραφα του ίδιου behavior που φορτώνονται από διαφορετικές
εκδόσεις ή instances πακέτων ενοποιούνται (deduplicate) μόνο μέσω ρητού ID:

```typescript
// 0.2.0
export class AuditBehavior implements IPipelineBehavior {
  static readonly [PIPELINE_BEHAVIOR_ID] = '@acme/audit:AuditBehavior';
  // ...
}
```

**Το `loggerProvider` πρέπει να παρέχει το `LOGGING_BEHAVIOR_LOGGER`.** Η επιλογή είναι τυπικά δηλωμένη ως
`PipelineLoggerProvider` αντί για γενικό `Provider`:

```typescript
// 0.2.0
PipelineModule.forRoot({
  loggerProvider: { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: Logger },
});
```

**Τα διαγνωστικά του bootstrap προεπιλέγονται σε `'strict'`.** Οποιαδήποτε παραβίαση συμβολαίου behavior πετάει
`PipelineConfigurationError` κατά το `app.init()`. Χρησιμοποιήστε `diagnostics: 'warn'` κατά τη διόρθωση
υφιστάμενων δηλώσεων.

---

## Δήλωση Module <a id="module-registration"></a>

### forRoot() <a id="forroot"></a>

Εισαγάγετε το `PipelineModule` μία φορά στο ριζικό σας `AppModule`. Υπάρχουν δύο τρόποι κλήσης:

```typescript
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PipelineModule, LoggingBehavior } from '@nestjs-pipeline/core';

// ── Τρόπος 1: Πλήρες αντικείμενο επιλογών ──

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      // Τα καθολικά behaviors περιτυλίγουν αυτόματα κάθε handler
      globalBehaviors: {
        scope: 'all',                // 'commands' | 'queries' | 'events' | 'all'
        before: [LoggingBehavior],   // εκτελείται πρώτο (εξωτερικότερο)
        after:  [MetricsBehavior],   // εκτελείται πλησιέστερα στον handler
      },
      // Behaviors προς δήλωση στο DI (για αναφορές μέσω @UsePipeline)
      behaviors: [AuditBehavior],
    }),
  ],
})
export class AppModule {}

// ── Τρόπος 2: Απλός πίνακας (μόνο δήλωση στο DI) ──

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot([LoggingBehavior, AuditBehavior]),
  ],
})
export class AppModule {}

// Η μορφή πίνακα είναι ισοδύναμη με το { behaviors: [...] }:
// δηλώνει providers για αναφορές στο @UsePipeline, αλλά δεν κάνει τα
// behaviors αυτά να εκτελούνται καθολικά. Χρησιμοποιήστε το globalBehaviors για καθολική εκτέλεση.
```

### forFeature() <a id="forfeature"></a>

Δηλώστε behaviors που ανήκουν σε συγκεκριμένα feature modules σε επίπεδο όλης της εφαρμογής:

```typescript
import { Module } from '@nestjs/common';
import { PipelineModule } from '@nestjs-pipeline/core';

@Module({
  imports: [PipelineModule.forFeature([AuditBehavior, CachingBehavior])],
})
export class AuditModule {}
```

Το `PipelineModule` είναι καθολικό (global), και η αναζήτηση των pipeline behaviors καλύπτει ολόκληρο
το γράφημα της εφαρμογής. Μόλις εισαχθεί το `AuditModule`, τα `AuditBehavior` και `CachingBehavior` γίνονται
διαθέσιμα για αναφορές στο `@UsePipeline()` σε οποιοδήποτε module. Το `forFeature()`
είναι ένα οργανωτικό API δήλωσης· δεν παρέχει τοπική απομόνωση DI
σε επίπεδο feature.

Όταν ένα behavior κάνει inject υπηρεσίες από άλλο module, χρησιμοποιήστε τη μορφή αντικειμένου:

```typescript
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditDependenciesModule {}

@Module({
  imports: [
    PipelineModule.forFeature({
      imports: [AuditDependenciesModule],
      behaviors: [AuditBehavior], // κάνει inject το AuditService
    }),
  ],
})
export class AuditModule {}
```

Τα dependency modules πρέπει να κάνουν export τους providers που απαιτούνται από τα behaviors. Η απλή
τοποθέτηση αυτών των providers στο γονικό `AuditModule` δεν τους καθιστά ορατούς μέσα στο
`PipelineModule`. Η μορφή πίνακα παραμένει υποστηριζόμενη για behaviors των οποίων οι εξαρτήσεις
είναι ήδη διαθέσιμες (για παράδειγμα, από global modules).

Το `PipelineModuleFeatureOptions` ρυθμίζει αποκλειστικά τη δήλωση στο DI. Δηλώστε
το `forRoot()` ή `forRootAsync()` μία φορά για να αρχικοποιήσετε το pipeline. Ρυθμίστε τις επιλογές
εκτέλεσης του behavior με `@UsePipeline([AuditBehavior, { ... }])` ή με το root
`globalBehaviors`· η δήλωση ενός behavior με `forFeature()` δεν το εκτελεί αυτόματα
για κάθε handler.

### Ασύγχρονη δήλωση <a id="async-registration"></a>

Το Nest κατασκευάζει το γράφημα των providers πριν εκτελεστεί ένα async factory, επομένως τα δύο
πεδία του γραφήματος providers — `behaviors` και `loggerProvider` — δηλώνονται στην κλήση
του `forRootAsync()`, και δεν επιστρέφονται από το factory. Το factory επιστρέφει
το `PipelineRuntimeOptions`, το οποίο αντιστοιχεί στο `PipelineModuleOptions` χωρίς αυτά τα πεδία:

```typescript
PipelineModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],

  // Γράφημα providers — αξιολογείται πριν από το factory.
  behaviors: [LoggingBehavior, ZodValidationBehavior],
  loggerProvider: { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: MyLogger },

  // Runtime ρυθμίσεις — επιλύονται από injected providers.
  useFactory: (config: ConfigService) => ({
    diagnostics: config.get('PIPELINE_DIAGNOSTICS'),
    globalBehaviors: [{ scope: 'all', before: [LoggingBehavior] }],
  }),
});
```

Καθολικά behaviors που δεν εξαρτώνται από injected τιμές μπορούν να δηλωθούν
στατικά στην ίδια κλήση. Οι κλάσεις τους δηλώνονται ως providers, όπως και με το
`forRoot({ globalBehaviors })`, οπότε δεν χρειάζονται ξεχωριστή εγγραφή στο `behaviors`:

```typescript
PipelineModule.forRootAsync({
  inject: [ConfigService],
  globalBehaviors: [
    { scope: 'all', before: [logging({ requestResponseLogLevel: 'log' })] },
    { scope: 'commands', before: [[DeadLetterBehavior, { captureKinds: ['command'] }]] },
  ],
  useFactory: (config: ConfigService) => ({
    diagnostics: config.get('PIPELINE_DIAGNOSTICS'),
  }),
});
```

Οι στατικές ρυθμίσεις προηγούνται και οποιαδήποτε `globalBehaviors` επιστρέφει το factory
προσαρτώνται μετά από αυτές. Ένα behavior διατηρεί τη θέση της πρώτης του εμφάνισης
στον συνδυασμένο πίνακα· ένα μεταγενέστερο tuple για το ίδιο behavior παρέχει μόνο τις
επιλογές του. Ένα behavior που εμφανίζεται μόνο στις ρυθμίσεις που επιστρέφονται από το factory
πρέπει να εξακολουθεί να περιλαμβάνεται στο `behaviors`.

Η επιστροφή οποιουδήποτε από τα δύο πεδία από το factory προκαλεί `TypeError` κατά το bootstrap, οπότε μια
λίστα behaviors τοποθετημένη μέσα στο factory αποτυγχάνει κατά την εκκίνηση και όχι στο πρώτο
αίτημα.

Το δεύτερο παράδειγμα χρησιμοποιεί το intent helper `logging()`, εισαγόμενο από αυτό το πακέτο:

```typescript
import { logging, PipelineModule } from '@nestjs-pipeline/core';
```

Μια κλάση μπορεί να παρέχει τις επιλογές runtime αντί για factory. Το `useClass`
την αρχικοποιεί μέσα στο module του pipeline· το `useExisting` επαναχρησιμοποιεί έναν provider
που κάνει export ένα εισαγόμενο module:

```typescript
import { Injectable, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { correlationSource } from '@nestjs-pipeline/correlation';
import {
  LoggingBehavior,
  PipelineModule,
  type PipelineOptionsFactory,
  type PipelineRuntimeOptions,
} from '@nestjs-pipeline/core';
import { tenantSource } from '@nestjs-pipeline/tenant';

@Injectable()
export class PipelineConfig implements PipelineOptionsFactory {
  constructor(private readonly config: ConfigService) {}

  createPipelineOptions(): PipelineRuntimeOptions {
    return {
      diagnostics: this.config.get('PIPELINE_DIAGNOSTICS') ?? 'strict',
      bootstrapLogLevel: 'log',
      sources: { tenantId: tenantSource, correlationId: correlationSource },
    };
  }
}

@Module({
  imports: [
    PipelineModule.forRootAsync({
      imports: [ConfigModule],
      useClass: PipelineConfig,
      globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
    }),
  ],
})
export class AppModule {}
```

Το `extraProviders` προσθέτει providers στο pipeline module και τους εξάγει (export), για
εξαρτήσεις που απαιτεί η κλάση επιλογών ή τα behaviors και τις οποίες δεν παρέχει
κανένα εισαγόμενο module.

---

## Ο Decorator @UsePipeline <a id="the-usepipeline-decorator"></a>

Επαναλαμβανόμενες ταυτότητες behaviors εκτελούνται μία φορά στην πρώτη τους θέση. Το τελευταίο tuple
για τη συγκεκριμένη ταυτότητα παρέχει τις επιλογές του· μια απλή επανάληψη χωρίς επιλογές δεν διαγράφει τις υπάρχουσες επιλογές.
Οι αναφορές σε constructors αποτελούν την προεπιλεγμένη ταυτότητα. Ένα ρητό `PIPELINE_BEHAVIOR_ID`
ενοποιεί αντίγραφα του ίδιου behavior μεταξύ ξεχωριστά φορτωμένων πακέτων.
Λανθασμένες δηλώσεις, συμπεριλαμβανομένων των undefined κλάσεων από κυκλικά imports, προκαλούν
`TypeError` που αναφέρει τη θέση της δήλωσης. Το `@SkipPipeline` δέχεται αποκλειστικά κλάσεις.

Διακοσμήστε κλάσεις `@CommandHandler`, `@QueryHandler`, ή `@EventsHandler` για να συνδέσετε behaviors συγκεκριμένα για τον εκάστοτε handler:

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline, LoggingBehavior } from '@nestjs-pipeline/core';

// Απλή μορφή — απλή απαρίθμηση κλάσεων behavior
@CommandHandler(CreateUserCommand)
@UsePipeline(LoggingBehavior, AuditBehavior)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  async execute(command: CreateUserCommand): Promise<User> {
    // το domain logic σας
  }
}

// Μορφή typed intent builder — επιλογές με έλεγχο τύπων από addon πακέτα
@CommandHandler(CreateUserCommand)
@UsePipeline(
  authorize({ action: 'create', subject: 'User' }),
  rateLimit({ points: 5, keyFactory: (ctx) => `${ctx.requestName}:${ctx.request.clientIp}` }),
  idempotent({
    keyFactory: createPartitionedIdempotencyKeyFactory({
      action: 'user.create',
      principal: (ctx) => ['user', ctx.items.get(CURRENT_USER_ID) as string],
      operation: (ctx) => ctx.request.idempotencyKey,
    }),
  }),
  audit({ action: 'user.create' }),
)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  async execute(command: CreateUserCommand): Promise<User> {
    // το domain logic σας
  }
}

// Μορφή tuple — διέξοδος χαμηλού επιπέδου για απευθείας μεταβίβαση επιλογών σε συγκεκριμένα behaviors
@CommandHandler(CreateUserCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [AuditBehavior, { action: 'user.create', severity: 'high' }],
)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  async execute(command: CreateUserCommand): Promise<User> {
    // το domain logic σας
  }
}

// Event handler
@EventsHandler(UserCreatedEvent)
@UsePipeline(LoggingBehavior)
export class UserCreatedHandler implements IEventHandler<UserCreatedEvent> {
  handle(event: UserCreatedEvent): void {
    console.log(`User created: ${event.userId}`);
  }
}

// Query handler
@QueryHandler(GetUserQuery)
@UsePipeline(CachingBehavior)
export class GetUserHandler implements IQueryHandler<GetUserQuery> {
  async execute(query: GetUserQuery): Promise<User> {
    return this.userRepository.findById(query.userId);
  }
}
```

Τα behaviors εκτελούνται **από αριστερά προς τα δεξιά**: το πρώτο που αναγράφεται αποτελεί το εξωτερικότερο wrapper.

> Τα **Sagas** ΔΕΝ διακοσμούνται με `@UsePipeline` — αποτελούν reactive stream factories. Τα commands που εκπέμπει ένα saga διέρχονται από το `CommandBus` και συναντούν αυτόματα το pipeline του στοχευόμενου handler.

---

## Δημιουργία Custom Behavior <a id="writing-a-custom-behavior"></a>

Υλοποιήστε το interface `IPipelineBehavior`:

```typescript
import { Injectable } from '@nestjs/common';
import {
  IPipelineBehavior,
  IPipelineContext,
  NextDelegate,
} from '@nestjs-pipeline/core';

@Injectable()
export class MetricsBehavior implements IPipelineBehavior {
  constructor(private readonly metricsService: MetricsService) {}

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<any> {
    const start = performance.now();
    const labels = {
      kind: context.requestKind,     // 'command' | 'query' | 'event'
      name: context.requestName,     // 'CreateUserCommand'
      handler: context.handlerName,  // 'CreateUserHandler'
    };

    try {
      const result = await next();
      this.metricsService.record('pipeline.success', performance.now() - start, labels);
      return result;
    } catch (error) {
      this.metricsService.record('pipeline.failure', performance.now() - start, labels);
      throw error;
    }
  }
}
```

Η κλήση `next()` είναι αυτή που προωθεί την αλυσίδα. Ο κώδικας πριν το `next()` εκτελείται πριν από τον handler· ο κώδικας μετά εκτελείται κατόπιν:

```typescript
@Injectable()
export class TimingBehavior implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
    console.log(`→ Starting ${context.requestName}`);  // ΠΡΙΝ

    const result = await next();                        // Ο HANDLER ΕΚΤΕΛΕΙΤΑΙ ΕΔΩ

    console.log(`← Finished ${context.requestName}`);  // ΜΕΤΑ
    // το context.response είναι πλέον διαθέσιμο
    return result;
  }
}
```

---

## Pipeline Context <a id="pipeline-context"></a>

### Ιδιότητες <a id="properties"></a>

Κάθε behavior λαμβάνει το `IPipelineContext`:

| Ιδιότητα | Τύπος | Περιγραφή |
|---|---|---|
| `correlationId` | `string` | Αμετάβλητο (immutable) ID που καθορίζεται πριν ξεκινήσει η αλυσίδα behaviors |
| `tenantId` | `string \| undefined` | Ο τρέχων tenant κατά την έναρξη του pipeline· write-once |
| `request` | `TRequest` | Το instance του command / query / event |
| `requestType` | `Type<TRequest>` | Ο constructor της κλάσης (π.χ. `CreateUserCommand`) |
| `requestName` | `string` | Το όνομα της κλάσης σε string (π.χ. `"CreateUserCommand"`) |
| `handlerType` | `Type` | Ο constructor της κλάσης του handler |
| `handlerName` | `string` | Το όνομα της κλάσης του handler (π.χ. `"CreateUserHandler"`) |
| `requestKind` | `'command' \| 'query' \| 'event' \| 'unknown'` | Εντοπίζεται αυτόματα από τα metadata του `@nestjs/cqrs` |
| `startedAt` | `Date` | Χρονική σήμανση UTC έναρξης του pipeline |
| `response` | `TResponse \| undefined` | Ορίζεται αφού επιστρέψει το `next()`· `undefined` πριν εκτελεστεί ο handler |
| `items` | `Map<string \| symbol, unknown>` | Κοινόχρηστη δομή για επικοινωνία μεταξύ behaviors |

### Επιλογές Behavior <a id="behavior-options"></a>

Περάστε επιλογές ανά handler χρησιμοποιώντας τη μορφή tuple `[Behavior, { ... }]` και ανακτήστε τες με το `getBehaviorOptions()`:

```typescript
// Handler
@CommandHandler(CreateUserCommand)
@UsePipeline(
  [AuditBehavior, { action: 'user.create', severity: 'high' }],
)
export class CreateUserHandler { /* ... */ }

// Μέσα στο AuditBehavior
async handle(context: IPipelineContext, next: NextDelegate): Promise<any> {
  const opts = context.getBehaviorOptions<AuditOptions>(AuditBehavior);
  console.log(opts);  // → { action: 'user.create', severity: 'high' }
  return next();
}
```

Τα **maps** καθολικών επιλογών και επιλογών handler συνδυάζονται. Όταν το ίδιο behavior εμφανίζεται
και στα δύο επίπεδα, ο handler κληρονομεί τις καθολικές επιλογές και τροποποιεί τα πεδία
που ονομάζει ρητά — `{ ...global, ...handler }` — ενώ το behavior διατηρεί τη θέση του
στην καθολική αλυσίδα. Η συγχώνευση είναι βάθους ενός επιπέδου (shallow): ο ορισμός ενός εμφωλευμένου αντικειμένου
όπως το `retry` αντικαθιστά εξ ολοκλήρου αυτό το αντικείμενο αντί να συγχωνεύεται μέσα σε αυτό.

### Επικοινωνία μεταξύ Behaviors <a id="inter-behavior-communication"></a>

Χρησιμοποιήστε ένα κοινόχρηστο `PipelineItemToken<T>` για να μεταβιβάσετε δεδομένα με αυστηρούς τύπους μεταξύ behaviors. Ορίστε
και κάντε export το token μία φορά· κάθε κλήση `createPipelineItem` δημιουργεί ένα ξεχωριστό
symbol, ακόμα και όταν τα ονόματα συμπίπτουν.

```typescript
import {
  createPipelineItem, getPipelineItem, setPipelineItem,
  requirePipelineItem, hasPipelineItem,
  type IPipelineContext,
} from '@nestjs-pipeline/core';

export const CURRENT_USER_ID = createPipelineItem<string>('currentUserId');

export function populateIdentity(context: IPipelineContext, userId: string) {
  setPipelineItem(context, CURRENT_USER_ID, userId);
}

export function readIdentity(context: IPipelineContext) {
  const optional = getPipelineItem(context, CURRENT_USER_ID); // string | undefined
  const present = hasPipelineItem(context, CURRENT_USER_ID); // boolean
  const required = requirePipelineItem(
    context, CURRENT_USER_ID, 'Run the identity behavior before this consumer.',
  ); // string
  return { optional, present, required };
}
```

| Accessor | Συμπεριφορά |
|---|---|
| `createPipelineItem<T>(name, key?)` | Δημιουργεί ένα token· ένα ρητό string ή symbol διατηρεί την ταυτότητα ενός υπάρχοντος κλειδιού |
| `getPipelineItem(context, token)` | Επιστρέφει `T \| undefined` |
| `setPipelineItem(context, token, value)` | Γράφει μια τιμή ελεγχόμενη βάσει του τύπου του token |
| `requirePipelineItem(context, token, customMessage?)` | Πετάει `MissingPipelineItemError` για απούσα ή `undefined` τιμή |
| `hasPipelineItem(context, token)` | Χρησιμοποιεί παρουσία στο map· επιστρέφει `true` για ρητά αποθηκευμένο `undefined` |

Το `MissingPipelineItemError` εκθέτει τα `itemName`, `requestName`, και `handlerName`.
Το μήνυμά του περιλαμβάνει και τα τρία μαζί με υπόδειξη επίλυσης· το `customMessage` προσθέτει λεπτομέρειες.
Οι απαιτούμενες αναγνώσεις επιστρέφουν `null`, `false`, `0`, και κενά strings αμετάβλητα. Οι καταναλωτές
πρέπει να επικυρώνουν αυτές τις τιμές ξεχωριστά εάν η πολιτική τους τις απαγορεύει.

Το ακατέργαστο `Map<string | symbol, unknown>` παραμένει διαθέσιμο. Περιτυλίξτε υπάρχοντα κλειδιά για
διαμοιρασμό δεδομένων με ενσωματώσεις χωρίς να αντικαταστήσετε τα εξαγόμενα symbols τους:

```typescript
const EXISTING_KEY = Symbol('principal');
const PRINCIPAL = createPipelineItem<{ id: string }>('principal', EXISTING_KEY);
context.items.set(EXISTING_KEY, { id: 'user-1' });
const principal = requirePipelineItem(context, PRINCIPAL);
```

Όλοι οι accessors δέχονται επίσης raw strings ή symbols· οι αναγνώσεις τότε προεπιλέγουν σε `unknown`
εκτός εάν ο καλών δώσει type argument. Οι τύποι δεν επικυρώνουν εγγραφές στο raw map κατά το
runtime. Οι απαιτούμενες αναγνώσεις επιβάλλουν παρουσία, όχι authentication ή authorization.
Ρητά κλειδιά μοιράζονται εγγραφές όταν είναι ίσα· μόνο τα προεπιλεγμένα symbol keys αποτρέπουν συγκρούσεις.
Το token API χρησιμοποιεί το βοηθητικό `NoInfer` του TypeScript (TypeScript 5.4 ή νεότερο).

---

## Καθολικά Behaviors <a id="global-behaviors"></a>

### Πεδίο εφαρμογής (Scoping) <a id="scoping"></a>

Τα καθολικά behaviors μπορούν να περιοριστούν σε συγκεκριμένα είδη handlers. Περάστε ένα μεμονωμένο αντικείμενο ή έναν πίνακα για έλεγχο ανά είδος:

```typescript
// Όλα τα είδη handlers (μεμονωμένο αντικείμενο)
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'all',
    before: [LoggingBehavior],
    after:  [MetricsBehavior],
  },
})

// Μόνο Commands
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'commands',
    before: [AuditBehavior],
  },
})

// Μόνο Queries
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'queries',
    before: [CachingBehavior],
  },
})

// Μόνο Events
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'events',
    before: [LoggingBehavior],
  },
})

// Μορφή πίνακα — διαφορετικά scopes για διαφορετικά είδη handlers
PipelineModule.forRoot({
  globalBehaviors: [
    { scope: 'commands', before: [AuditBehavior] },
    { scope: 'queries',  before: [CachingBehavior] },
    { scope: 'all',      after:  [LoggingBehavior] },
  ],
})
```

Μπορούν να περαστούν επιλογές σε καθολικά behaviors χρησιμοποιώντας τη μορφή tuple:

```typescript
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'all',
    before: [
      [LoggingBehavior, { metricLogLevel: 'verbose', requestResponseLogLevel: 'debug' }],
    ],
  },
})
```

### Αποφυγή διπλοτύπων (Deduplication) <a id="deduplication"></a>

Όταν το ίδιο behavior εμφανίζεται τόσο στις καθολικές ρυθμίσεις όσο και σε ρυθμίσεις επιπέδου handler,
εκτελείται μία φορά, στην καθολική του θέση στην αλυσίδα, με τις καθολικές επιλογές ενημερωμένες από
τα πεδία του handler. Τα καθολικά αντίγραφα ενοποιούνται αυτόματα:

```typescript
// Καθολικό: LoggingBehavior με προεπιλεγμένες επιλογές
PipelineModule.forRoot({
  globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
})

// Handler: παρακάμπτει επιλογές χωρίς να μετακινεί το καθολικό behavior
@CommandHandler(CreateUserCommand)
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'log' }])
export class CreateUserHandler { /* ... */ }

// Τελική αλυσίδα: [LoggingBehavior στη θέση global-before, καθολικές επιλογές
// συγχωνευμένες με τις επιλογές handler] → handler
```

Μια επαναδήλωση κληρονομεί τις καθολικές επιλογές αντί να τις διαγράφει, οπότε ένας
handler δηλώνει μόνο ό,τι διαφέρει:

```typescript
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'all',
    before: [[TraceBehavior, { tracerName: 'users-api', recordRequest: true }]],
  },
})

// Κληρονομεί και τα δύο πεδία — αυτός είναι ο φυσικός τρόπος για να δηλωθεί "ναι, παρακολούθησε και αυτόν
// τον handler".
@UsePipeline(TraceBehavior)
export class GetUserHandler { /* ... */ }

// Κληρονομεί το tracerName: 'users-api' και παρακάμπτει μόνο το recordRequest.
@UsePipeline([TraceBehavior, { recordRequest: false }])
export class NoisyHandler { /* ... */ }
```

Δεν υπάρχει opt-out token. Για να εκτελεστεί ένα behavior με τις προεπιλογές του πακέτου παρά
τη ρύθμιση σε επίπεδο εφαρμογής, δηλώστε αυτές τις τιμές ρητά — ένας handler που
απορρίπτει σιωπηρά τη ρύθμιση της εφαρμογής είναι ακριβώς το σφάλμα που αποτρέπει
αυτή η κληρονομικότητα.

Τοποθετήστε υποχρεωτικά behaviors ελέγχου ταυτότητας/εξουσιοδότησης (authentication/authorization) στο καθολικό `before`.
Η θέση τους παραμένει έξω από behaviors caching/idempotency σε επίπεδο handler που
μπορούν να επιστρέψουν αποτέλεσμα χωρίς να καλέσουν το `next()`.

Αυτό προστατεύει μόνο την εξουσιοδότηση που εκτελείται από το εξωτερικό behavior. Εάν ο
handler εκτελεί αργότερα ελέγχους επιπέδου οντότητας ή φιλτράρισμα πεδίων απόκρισης, τα κλειδιά
caching και idempotency πρέπει να διαχωρίζονται ανά tenant, principal,
και permission scope, καθώς μια επιστροφή από τη μνήμη cache δεν εκτελεί τον handler.

### Παράκαμψη καθολικών Behaviors (@SkipPipeline) <a id="skipping-global-behaviors-skippipeline"></a>

Για να εξαιρέσετε πλήρως ένα ή περισσότερα καθολικά ρυθμισμένα behaviors από την εκτέλεση σε έναν συγκεκριμένο handler, διακοσμήστε την κλάση του handler με το `@SkipPipeline`:

```typescript
import { SkipPipeline } from '@nestjs-pipeline/core';

@CommandHandler(InternalRebuildCommand)
@SkipPipeline(AuditBehavior)
export class InternalRebuildHandler implements ICommandHandler<InternalRebuildCommand> {
  async execute(command: InternalRebuildCommand) {
    // Το AuditBehavior δεν εκτελείται.
    // Τα υπόλοιπα καθολικά behaviors (π.χ. LoggingBehavior) εκτελούνται στην κανονική τους σειρά.
  }
}
```

Μπορούν να παραλειφθούν πολλά behaviors ταυτόχρονα, και ο decorator συνδυάζεται με
το `@UsePipeline` για άλλα behaviors:

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { logging, SkipPipeline, UsePipeline } from '@nestjs-pipeline/core';

@CommandHandler(HealthProbeCommand)
@SkipPipeline(AuditBehavior, MetricsBehavior)
@UsePipeline(logging({ metricLogLevel: 'debug' }))
export class HealthProbeHandler implements ICommandHandler<HealthProbeCommand> {
  async execute(): Promise<void> {}
}
```

Βασικοί κανόνες:
- **Όλα τα behaviors παραλείπονται:** Ο handler εκτελείται χωρίς να δημιουργείται νέο pipeline context. Request-scoped handlers παραμένουν απομονωμένοι όταν πολλαπλές Nest εφαρμογές μοιράζονται την ίδια κλάση handler, συμπεριλαμβανομένης της σειράς εκκίνησης και τερματισμού της εφαρμογής.
- **Καμία μετακίνηση θέσεων:** Η παράλειψη ενός behavior δεν μετατοπίζει ούτε αλλάζει τη σειρά των υπόλοιπων behaviors.
- **Fail-fast σε αντίφαση:** Η ταυτόχρονη δήλωση `@SkipPipeline(B)` και `@UsePipeline(B)` (ή η παροχή επιλογών για το `B`) αποτελεί αντιφατική ρύθμιση και προκαλεί άμεση αποτυχία κατά το bootstrap με ρητό σφάλμα.
- **Τύποι handlers:** Υποστηρίζεται σε command, query, και event handlers τόσο σε singleton όσο και σε request-scoped κύκλους ζωής.

---

## Ενσωματωμένο LoggingBehavior <a id="built-in-loggingbehavior"></a>

Αποτυχίες καταγραφής και σειριοποίησης payload δεν αποτρέπουν την εκτέλεση ούτε αντικαθιστούν
το αποτέλεσμα ή το σφάλμα του handler. Το `next()` καλείται ακριβώς μία φορά. Τα `optionalParams` των σφαλμάτων
υπόκεινται στον ίδιο αποκλεισμό κλειδιών και redaction όπως και τα payloads αιτημάτων/αποκρίσεων. Ελεύθερα μηνύματα
σφαλμάτων και stack traces δεν υπόκεινται σε redaction ανά πεδίο· μην τοποθετείτε διαπιστευτήρια σε αυτά.

Το πακέτο περιλαμβάνει το `LoggingBehavior` για δομημένη καταγραφή pipeline μέσω του NestJS `Logger`:

```typescript
import { LoggingBehavior } from '@nestjs-pipeline/core';

PipelineModule.forRoot({
  globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
})
```

**Επιλογές** (`LoggingBehaviorOptions`):

| Επιλογή | Τύπος | Προεπιλογή | Περιγραφή |
|---|---|---|---|
| `metricLogLevel` | `LogLevel \| 'none'` | `'log'` | Επίπεδο log για μηνύματα χρονισμού/διάρκειας |
| `requestResponseLogLevel` | `LogLevel \| 'none'` | `'debug'` | Επίπεδο log για payloads αιτημάτων/αποκρίσεων |
| `errorLogLevel` | `LogLevel \| 'none'` | `'error'` | Επίπεδο log κατά την εμφάνιση σφάλματος |
| `mapLogLevel` | `Map<ErrorClass, LogLevel \| 'none'>` | `undefined` | Ειδικά επίπεδα log αντιστοιχισμένα ανά κλάση εξαίρεσης (υπερισχύει η πιο συγκεκριμένη ταύτιση στην αλυσίδα prototype) |
| `excludeKeys` | `string[]` | `[]` | Κλειδιά προς παράλειψη από τα logs αιτήματος/απόκρισης (υποστηρίζει dot notation για εμφωλευμένες ιδιότητες, π.χ. `'ctx.sessionUser'`) |
| `redactKeys` | `string[]` | `[]` | Πρόσθετα κλειδιά ή dot-paths που καλύπτονται με `[REDACTED]`· σε αντίθεση με το `excludeKeys`, η ιδιότητα παραμένει στο payload |
| `redactSensitiveKeys` | `boolean` | `true` | Καλύπτει τα `DEFAULT_REDACT_KEYS` του `@cqrs-ddd/safe-stringify` (passwords, tokens, authorization, cookies, API keys, δεδομένα καρτών). Η ταύτιση αγνοεί πεζά/κεφαλαία, `_` και `-` |
| `excludeRequestObj` | `boolean` | `true` | Εάν είναι true, παραλείπει πλήρως το αντικείμενο αιτήματος από τα logs (εμφανίζει placeholder) |
| `excludeResponseObj` | `boolean` | `true` | Εάν είναι true, παραλείπει πλήρως το αντικείμενο απόκρισης από τα logs (εμφανίζει placeholder) |
| `logFormat` | `'text' \| 'structured'` | `'text'` | Μορφή εξόδου για logs αιτήματος/απόκρισης/μετρικών/σφαλμάτων. Το `'text'` εκπέμπει ένα μεμονωμένο string· το `'structured'` εκπέμπει ένα plain object payload (π.χ. `{ msg, request }` για request/response, `{ message, stack, ... }` για σφάλματα) — κατάλληλο για structured loggers όπως το `nestjs-pino`/pino που σειριοποιούν αντικείμενα σε πεδία JSON |

Όταν ο περιτυλιγμένος handler πετάει εξαίρεση, η καταγεγραμμένη εγγραφή σφάλματος εμπλουτίζεται επίσης με:
- το `stack` του σφάλματος, εάν πρόκειται για instance του `Error`·
- τα `optionalParams` του σφάλματος, εάν η ριφθείσα τιμή ορίζει τέτοια — κανονικοποιημένα σε πίνακα και συγχωνευμένα στο καταγεγραμμένο payload, ώστε οποιοδήποτε επιπλέον context φέρει μια εξαίρεση πέρα από το `message`/`stack` να φτάνει στα logs.

Το αρχικό σφάλμα επανεκπέμπεται πάντα αμετάβλητο μετά την καταγραφή, οπότε το `LoggingBehavior` απλώς παρατηρεί αποτυχίες — δεν τις αποκρύπτει ποτέ.

Παρέχετε τον δικό σας logger μέσω της επιλογής `loggerProvider`, της οποίας το token `provide`
πρέπει να είναι το `LOGGING_BEHAVIOR_LOGGER` (για παράδειγμα με το `nestjs-pino`, του οποίου το global
`LoggerModule` εξάγει το `Logger`):

```typescript
import { Module } from '@nestjs/common';
import { Logger, LoggerModule } from 'nestjs-pino';
import {
  LOGGING_BEHAVIOR_LOGGER,
  LoggingBehavior,
  PipelineModule,
} from '@nestjs-pipeline/core';

@Module({
  imports: [
    LoggerModule.forRoot(),
    PipelineModule.forRoot({
      globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
      bootstrapLogLevel: 'verbose',
      loggerProvider: { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: Logger },
    }),
  ],
})
export class AppModule {}
```

Η καταγραφή payload είναι απενεργοποιημένη από προεπιλογή. Όταν ενεργοποιείται, τα ευαίσθητα κλειδιά καλύπτονται
εκτός εάν το `redactSensitiveKeys` οριστεί σε `false`:

```typescript
@CommandHandler(RegisterCardCommand)
@UsePipeline(
  logging({
    excludeRequestObj: false,
    excludeKeys: ['ctx.sessionUser'],        // αφαιρείται από την έξοδο
    redactKeys: ['profile.email', 'iban'],   // διατηρείται, η τιμή αντικαθίσταται από [REDACTED]
  }),
)
export class RegisterCardHandler { /* ... */ }
// Request: {"cardNumber":"[REDACTED]","iban":"[REDACTED]","profile":{"email":"[REDACTED]"}}
```

Τα επίπεδα log του Nest αντιστοιχίζονται στο pino ως εξής:
`verbose` → `trace`, `debug` → `debug`, `log` → `info`, `warn` → `warn`, `error` → `error`, `fatal` → `fatal`.

```typescript
import { logging } from '@nestjs-pipeline/core';

// Παράκαμψη επιλογών ανά handler
@CommandHandler(CreateUserCommand)
@UsePipeline(logging({ requestResponseLogLevel: 'log' }))
export class CreateUserHandler { /* ... */ }

// Αντιστοίχιση συγκεκριμένων εξαιρέσεων σε διαφορετικά επίπεδα log (π.χ. καταγραφή παραβιάσεων περιορισμών ως warnings)
@UsePipeline(logging({ 
  mapLogLevel: new Map([
    [UniqueConstraintException, 'warn'],
    [NotFoundException, 'debug'],
  ]) 
}))

// Απενεργοποίηση καταγραφής payload, διατήρηση μετρικών
@UsePipeline(logging({ requestResponseLogLevel: 'none' }))

// Σίγαση όλων των logs
@UsePipeline(logging({ metricLogLevel: 'none', requestResponseLogLevel: 'none', errorLogLevel: 'none' }))

// Εκπομπή δομημένων αντικειμένων αντί για strings (π.χ. για nestjs-pino)
@UsePipeline(logging({ logFormat: 'structured' }))
```

**Έξοδος** (επιτυχία, προεπιλεγμένο `logFormat: 'text'`, με προεπιλεγμένα `excludeRequestObj`/`excludeResponseObj`):

```
[CreateUserHandler] Request: [exclude request obj]
[CreateUserHandler] [019728a3-...] COMMAND CreateUserCommand → CreateUserHandler completed in 12.34ms
[CreateUserHandler] Response: [exclude response obj]
```

Με `excludeRequestObj: false, excludeResponseObj: false`:

```
[CreateUserHandler] Request: {"username":"jane","email":"jane@example.com"}
[CreateUserHandler] [019728a3-...] COMMAND CreateUserCommand → CreateUserHandler completed in 12.34ms
[CreateUserHandler] Response: {"id":"...","username":"jane"}
```

**Έξοδος** (σφάλμα, προεπιλεγμένο `logFormat: 'text'`):

```
[CreateUserHandler] [019728a3-...] COMMAND CreateUserCommand → CreateUserHandler failed after 2.10ms: Error: User already exists
```

**Έξοδος** (`logFormat: 'structured'`):

Με `logFormat: 'structured'`, τα ίδια γεγονότα εκπέμπονται ως plain objects αντί για strings — εξαιρετικά πρακτικό για loggers όπως το `nestjs-pino` που σειριοποιούν αντικείμενα σε πεδία JSON:

```typescript
// Request
{ msg: 'Request → CreateUserHandler', request: '[exclude request obj]' }

// Metric (σε επιτυχία)
{
  msg: '[019728a3-...] COMMAND CreateUserCommand → CreateUserHandler completed in 12.34ms',
  correlationId: '019728a3-...',
  requestKind: 'command',
  requestName: 'CreateUserCommand',
  handlerName: 'CreateUserHandler',
  durationMs: 12.34,
}

// Response
{ msg: 'Response ← CreateUserHandler', response: '[exclude response obj]' }

// Error
{
  message: '[019728a3-...] COMMAND CreateUserCommand → CreateUserHandler failed after 2.10ms: Error: User already exists',
  stack: 'Error: User already exists\n    at ...',
  // ...οποιαδήποτε optionalParams έφερε το σφάλμα συγχωνεύονται εδώ
}
```

---

## Tenant και correlation ID <a id="tenant-and-correlation-id"></a>

Το core δεν διατηρεί δικό του tenant ή correlation store. Κάθε τιμή διαθέτει μια πηγή, ένα
`ContextSource` (`current()` και `run(value, fn)`), που παρέχεται στην επιλογή module `sources`.
Τα πακέτα [`@nestjs-pipeline/tenant`](/nestjs-pipeline/packages/nestjs-pipeline/tenant/)
και
[`@nestjs-pipeline/correlation`](/nestjs-pipeline/packages/nestjs-pipeline/correlation/)
κατέχουν αυτά τα stores και δεν εξαρτώνται από τίποτα εδώ· τα εξάγουν ως `tenantSource` και
`correlationSource`:

```typescript
import { correlationSource } from '@nestjs-pipeline/correlation';
import { tenantSource } from '@nestjs-pipeline/tenant';

PipelineModule.forRoot({
  sources: { tenantId: tenantSource, correlationId: correlationSource },
});
```

Η εφαρμογή στη συνέχεια χρησιμοποιεί το API τους: `runWithTenant`, `currentTenantId`,
`HttpCorrelationMiddleware`, `runWithCorrelationId`, `getCorrelationId`,
`@WithCorrelation`. Χωρίς το `sources`, το bootstrap καταγράφει ένα warning μόλις περιτυλιχθούν οι handlers,
καθώς οι handlers δεν μπορούν να διαβάσουν το tenant ή το correlation ID του pipeline· περάστε
`sources: {}` για σκόπιμη εκτέλεση χωρίς αυτά (ή ορίστε `diagnostics: 'off'`).

Όταν ξεκινά ένα pipeline, γεμίζει το context του:

- `context.correlationId` — το τρέχον ID της πηγής, ή ένα νέο από το `create()` της·
  χωρίς πηγή, εκείνο του pipeline στο οποίο είναι εμφωλευμένο, ή ένα νέο `uuidv7()`·
- `context.tenantId` — ο τρέχων tenant της πηγής· χωρίς πηγή, εκείνος του
  pipeline στο οποίο είναι εμφωλευμένο· διαφορετικά κανένας. Είναι write-once.

Τα behaviors και ο handler εκτελούνται στη συνέχεια εντός των δύο πηγών διατηρώντας αυτές τις τιμές, οπότε μια
εμφωλευμένη αποστολή (saga, `eventBus.publish()`, ένα command από handler) τις κληρονομεί,
και η κλήση `getCorrelationId()` ή `currentTenantId()` βαθιά μέσα στον handler επιστρέφει αυτό στο οποίο βασίστηκαν
τα behaviors. Ένα pipeline που αποστέλλεται μέσα σε στενότερο `runWithTenant` υιοθετεί αυτόν τον
tenant.

```typescript
import { runWithCorrelationId } from '@nestjs-pipeline/correlation';
import { runWithTenant } from '@nestjs-pipeline/tenant';

await runWithTenant('tenant_a', () =>
  runWithCorrelationId(job.id, () => commandBus.execute(new SyncCommand())),
);
```

Χωρίς tenant, behaviors με tenant scope (cache, idempotency, rate limit) αποτυγχάνουν άμεσα (fail closed).

Ένα behavior διαβάζει και τις δύο τιμές από το context του. Ένα behavior που βασίζει κοινόχρηστη κατάσταση
σε tenant δομεί το τμήμα tenant με το `tenantSegments`, το οποίο πετάει τη δοσμένη
υποκλάση `MissingPartitionError` όταν απουσιάζει απαιτούμενος tenant:

```typescript
import {
  MissingPartitionError,
  type IPipelineContext,
  type TenantPartitionOptions,
  tenantSegments,
} from '@nestjs-pipeline/core';

export class MissingQuotaPartitionError extends MissingPartitionError<'tenant'> {
  constructor(requestName: string, dimension: 'tenant', remedy: string) {
    super('Quota', requestName, dimension, remedy);
  }
}

export function quotaKey(context: IPipelineContext, options: TenantPartitionOptions = {}) {
  return [...tenantSegments(context, options, MissingQuotaPartitionError), context.requestName]
    .map((segment) => encodeURIComponent(segment ?? ''))
    .join(':');
}
```

Ένα απλούστερο behavior μπορεί να ελέγξει τον tenant απευθείας:

```typescript
import { Injectable } from '@nestjs/common';
import type {
  IPipelineBehavior,
  IPipelineContext,
  NextDelegate,
} from '@nestjs-pipeline/core';

@Injectable()
export class TenantRequiredBehavior implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate): Promise<unknown> {
    if (context.tenantId === undefined) {
      throw new Error(`${context.requestName} requires a tenant (${context.correlationId})`);
    }
    return next();
  }
}
```

### HTTP Αιτήματα <a id="http-requests"></a>

Η εξαγωγή correlation ID για HTTP παρέχεται από το `@nestjs-pipeline/correlation`. Εγκαταστήστε το και εφαρμόστε το middleware:

```typescript
import { HttpCorrelationMiddleware } from '@nestjs-pipeline/correlation';

@Module({ /* ... */ })
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpCorrelationMiddleware).forRoutes('*');
  }
}
```

```bash
curl -X POST http://localhost:3000/users \
  -H 'x-correlation-id: req-abc-123' \
  -H 'Content-Type: application/json' \
  -d '{"name": "Jane", "email": "jane@example.com"}'
```

### Μη-HTTP σημεία εισόδου <a id="non-http-entry-points"></a>

Για ουρές Bull, RabbitMQ, Kafka, cron jobs, κ.λπ., χρησιμοποιήστε τα εργαλεία από το `@nestjs-pipeline/correlation`:

```typescript
import { uuidv7 } from '@cqrs-ddd/uuidv7';
import { runWithCorrelationId } from '@nestjs-pipeline/correlation';

// Επεξεργαστής ουράς Bull
@Process('send-email')
async handleSendEmail(job: Job) {
  return runWithCorrelationId(job.data.correlationId, async () => {
    await this.commandBus.execute(new SendEmailCommand(job.data));
  });
}

// Cron job
@Cron('0 * * * *')
async hourlySync() {
  return runWithCorrelationId(uuidv7(), () =>
    this.commandBus.execute(new SyncCommand()),
  );
}
```

### Decorator @WithCorrelation <a id="withcorrelation-decorator"></a>

Αντί να καλείτε χειροκίνητα το `runWithCorrelationId`, χρησιμοποιήστε τον method decorator `@WithCorrelation()` από το `@nestjs-pipeline/correlation`:

```typescript
import { WithCorrelation, CorrelationFrom, getCorrelationId } from '@nestjs-pipeline/correlation';

// ── Bull (διαβάζει από job.data.correlationId από προεπιλογή) ──
@Process('send-email')
@WithCorrelation()
async handleSendEmail(job: Job) {
  const id = getCorrelationId();
  await this.commandBus.execute(new SendEmailCommand(job.data));
}

// ── RabbitMQ (ιδιότητες AMQP) ──
@MessagePattern('user.created')
@WithCorrelation(CorrelationFrom.amqp())
async handle(@Payload() data: any, @Ctx() ctx: RmqContext) {
  await this.commandBus.execute(new SyncUserCommand(data));
}

// ── Kafka (headers μηνύματος) ──
@EventPattern('order.placed')
@WithCorrelation(CorrelationFrom.kafka())
async handle(@Payload() data: any, @Ctx() ctx: KafkaContext) {
  await this.commandBus.execute(new ProcessOrderCommand(data));
}

// ── NATS / gRPC ──
@WithCorrelation(CorrelationFrom.nats())
@WithCorrelation(CorrelationFrom.grpc())

// ── Cron (χωρίς ID στα ορίσματα → παράγει αυτόματα uuidv7) ──
@Cron('0 * * * *')
@WithCorrelation()
async hourlySync() {
  await this.commandBus.execute(new SyncCommand());
}
```

### Βοηθητικά εργαλεία στην πλευρά παραγωγού <a id="producer-side-utilities"></a>

Κατά την εισαγωγή εργασιών σε ουρές ή τη δημοσίευση μηνυμάτων, αποτυπώστε το τρέχον correlation ID στο payload ή στα headers:

```typescript
import { addCorrelationId, correlationHeaders } from '@nestjs-pipeline/correlation';

// Bull / BullMQ — αποτύπωση στο payload δεδομένων
await queue.add('send-email', addCorrelationId({ userId, email }));
// → { userId, email, correlationId: '019728a3-...' }

// Kafka — αποτύπωση ως message headers
await producer.send({
  topic: 'orders',
  messages: [{ value: JSON.stringify(order), headers: correlationHeaders() }],
});

// HTTP (εξερχόμενο)
await fetch(url, { headers: { ...correlationHeaders(), 'content-type': 'application/json' } });
```

### Ανάγνωση του τρέχοντος Correlation ID <a id="reading-the-current-correlation-id"></a>

Χρησιμοποιήστε το `getCorrelationId()` από το `@nestjs-pipeline/correlation` οπουδήποτε στο ασύγχρονο call stack:

```typescript
import { getCorrelationId } from '@nestjs-pipeline/correlation';

const id = getCorrelationId(); // διαβάζει από το async-local context, επιστρέφει uuidv7() αν δεν βρει
```

### Εμφωλευμένα Commands και Sagas <a id="nested-commands-and-sagas"></a>

Τα θυγατρικά pipelines κληρονομούν αυτόματα το `correlationId` του γονέα μέσω του `AsyncLocalStorage`:

```typescript
// Αυτό το saga εκπέμπει command — θα κληρονομήσει το correlationId
// από το pipeline context του event handler
@Saga()
orderCreated = (events$: Observable<any>): Observable<ICommand> =>
  events$.pipe(
    ofType(OrderCreatedEvent),
    map((event) => new SendConfirmationCommand({ orderId: event.orderId })),
  );
```

---

## Μοντέλο Εκτέλεσης <a id="execution-model"></a>

```
┌─ global before ──┐   ┌── @UsePipeline ──┐   ┌─ global after ──┐
│ LoggingBehavior  │ → │ AuditBehavior    │ → │ MetricsBehavior │ → handler.execute()
└──────────────────┘   └──────────────────┘   └─────────────────┘
                    ← η απόκριση διαδίδεται πίσω μέσω της αλυσίδας ←
```

| Φάση | Πηγή | Θέση |
|---|---|---|
| Καθολικό `before` | `globalBehaviors.before` | Εξωτερικότερη (εκτελείται πρώτη) |
| Επίπεδο Handler | `@UsePipeline(...)` | Μεσαία |
| Καθολικό `after` | `globalBehaviors.after` | Εσωτερικότερη (πλησιέστερα στον handler) |
| Handler | `execute()` / `handle()` | Πυρήνας |

**Διαδικασία Bootstrap:**

1. Το `PipelineBootstrapService` εκτελείται κατά το `OnApplicationBootstrap`.
2. Ανακαλύπτει τους command, query και event handlers μέσω του `DiscoveryService` του Nest. Ένας
   provider θεωρείται handler όταν η κλάση του φέρει τα metadata που καταγράφει το `@CommandHandler`,
   `@QueryHandler` ή `@EventsHandler`, ο κανόνας που εφαρμόζει το Nest CQRS κατά την
   καταχώρηση handlers. Εάν το εγκατεστημένο `@nestjs/cqrs` καταγράφει αυτά τα metadata με
   μη αναμενόμενο τρόπο, το bootstrap αποτυγχάνει αντί να αφήσει τους handlers απροστάτευτους.
3. Για κάθε handler με `@UsePipeline` ή αντίστοιχα καθολικά behaviors: υπολογίζει τα τελικά metadata των behaviors/handler, επιλύει τα singleton instances των behaviors, και περιτυλίγει τη μέθοδο `execute()` / `handle()`. Behaviors που δεν μπορούν να επιλυθούν ως singletons επισημαίνονται για δυναμική επίλυση.
4. Τα ανεξάρτητα από το αίτημα metadata υπολογίζονται μία φορά κατά την εκκίνηση. Η κοινή διαδρομή αποκλειστικά με singletons επαναχρησιμοποιεί προ-επιλυμένα instances χωρίς reflection ανά αίτημα ή αναζήτηση στο DI· behaviors με request scope ή transient επιλύονται ανά κλήση με `moduleRef.resolve()` και το ισχύον Nest context ID.
5. Απαιτεί Nest και Nest CQRS 12. Request-scoped και transient handlers
   (`Scope.REQUEST`, `Scope.TRANSIENT`) βασίζονται στο `AsyncContext`, το οποίο προηγούμενες
   εκδόσεις του CQRS δεν παρείχαν.

---

### Κύκλος ζωής και κληρονομικότητα <a id="lifecycle-and-inheritance"></a>

Εάν το bootstrap του pipeline αποτύχει, επαναφέρει τις μεθόδους και τα hooks instances του Nest που
εγκατέστησε πριν επανεκπέμψει το αρχικό σφάλμα. Ο τερματισμός της εφαρμογής αφαιρεί μόνο
τους runners της συγκεκριμένης εφαρμογής. Κληρονομημένες μέθοδοι handler διατηρούν τους αρχικούς τους
property descriptors και την κληρονομικότητα prototype μετά τον καθαρισμό. Ένα override handler
μπορεί να καλέσει `super.execute(request)` χωρίς να εισέλθει ξανά στο pipeline του προγόνου.

Η κυριότητα dispatch παρακολουθείται ξεχωριστά για τα `execute` και `handle`, συμπεριλαμβανομένης της
περίπτωσης όπου ένας scoped provider χειρίζεται τόσο commands όσο και events. Καλέστε handlers μέσω
των buses του Nest CQRS. Ένα scoped instance που κατασκευάζεται χειροκίνητα δεν έχει καταγεγραμμένη
κυριότητα εφαρμογής: χρησιμοποιεί τη μοναδική δηλωμένη αλυσίδα όταν δεν υπάρχει ασάφεια, και πετάει σφάλμα
αντί να εκτελέσει τον handler χωρίς pipeline όταν πολλαπλές εφαρμογές μοιράζονται το
prototype του.

Εσωτερικά, το `pipeline-plan.ts` συνθέτει δηλώσεις και επιλογές, το
`pipeline-contracts.ts` επικυρώνει τα συμβόλαια, και το `pipeline-runner.ts` δημιουργεί το
context αιτήματος και εκτελεί την αλυσίδα. Το `PipelineBootstrapService` κατέχει το discovery,
την επίλυση providers του Nest, την εγκατάσταση μεθόδων και τον καθαρισμό. Αυτά τα εργαλεία είναι
εσωτερικά και δεν εξάγονται από το σημείο εισόδου του πακέτου.

## Διαγνωστικά Bootstrap & Συμβόλαια Behaviors <a id="bootstrap-diagnostics--behavior-contracts"></a>

Το `@nestjs-pipeline/core` περιλαμβάνει έναν μηχανισμό άμεσων διαγνωστικών κατά το bootstrap που επικυρώνει περιορισμούς διάταξης των behaviors και δηλωτικές σταθερές ρυθμίσεων κατά το `OnApplicationBootstrap`.

### Diagnostics Modes <a id="diagnostics-modes"></a>

Ρυθμίστε το `diagnostics` στο `PipelineModule.forRoot()`:

| Κατάσταση (Mode) | Συμπεριφορά |
|---|---|
| `'strict'` *(προεπιλογή)* | Συλλέγει όλες τις παραβιάσεις σε όλους τους handlers και πετάει `PipelineConfigurationError` κατά το `app.init()`, αποτυγχάνοντας άμεσα πριν εξυπηρετηθεί κίνηση. |
| `'warn'` | Καταγράφει μορφοποιημένα διαγνωστικά warnings μέσω του Nest `Logger` αλλά επιτρέπει την ολοκλήρωση του bootstrap. |
| `'off'` | Παρακάμπτει πλήρως τον έλεγχο συμβολαίων. |

```typescript
PipelineModule.forRoot({
  diagnostics: 'strict', // 'strict' | 'warn' | 'off'
})
```

### IPipelineBehaviorContract <a id="ipipelinebehaviorcontract"></a>

Τα behaviors δηλώνουν κανόνες ασφάλειας και σχετικούς περιορισμούς διάταξης προσαρτώντας το αναγνωρισμένο symbol `PIPELINE_BEHAVIOR_CONTRACT`:

```typescript
import {
  IPipelineBehavior,
  IPipelineBehaviorContract,
  IPipelineContext,
  NextDelegate,
  PIPELINE_BEHAVIOR_CONTRACT,
  PipelineBehaviorDiagnostic,
  PipelineBehaviorValidationContext,
} from '@nestjs-pipeline/core';

export class CustomSecurityBehavior implements IPipelineBehavior {
  static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract = {
    // Περιορισμός σχετικής διάταξης: στατικός κανόνας ή δυναμική συνάρτηση του handler context
    order: (context: PipelineBehaviorValidationContext) => {
      // π.χ. επιβολή σειράς μόνο για commands
      if (context.requestKind === 'command') {
        return { after: ['CaslBehavior'] };
      }
      return undefined;
    },

    // Ντετερμινιστική επικύρωση επιλογών
    validate: (context: PipelineBehaviorValidationContext): PipelineBehaviorDiagnostic[] | undefined => {
      if (!context.effectiveOptions?.secretKey) {
        return [{
          handlerName: context.handlerName,
          behaviorName: CustomSecurityBehavior.name,
          message: 'CustomSecurityBehavior requires secretKey',
          fix: 'Provide secretKey in handler @UsePipeline options or module defaults.',
        }];
      }
      return undefined;
    },
  };

  async handle(context: IPipelineContext, next: NextDelegate) {
    return next();
  }
}
```

### Προτεραιότητα Επιλογών & Τελικές Επιλογές (Effective Options) <a id="option-precedence--effective-options"></a>

Κατά τον έλεγχο επιλογών στο bootstrap, η υπηρεσία bootstrap επιλύει τις τελικές επιλογές με την ακριβή σειρά προτεραιότητας που εφαρμόζεται στο runtime:
1. Προεπιλογές module: Μέσω του dynamic module addon `forRoot({ defaults: { ... } })` ή των επιλογών του module.
2. Καθολικές επιλογές pipeline: Δηλωμένες στο `PipelineModule.forRoot({ globalBehaviors: [ ... ] })`.
3. Επιλογές ανά handler: Προσαρτημένες μέσω του `@UsePipeline([Behavior, { ... }])` στην κλάση του handler.

Εάν ένα behavior υλοποιεί τη μέθοδο `resolveEffectiveOptions(rawMergedOptions)`, το bootstrap
την καλεί όταν είναι διαθέσιμο ένα singleton instance. Τα scoped behaviors δεν διαθέτουν
instance αιτήματος κατά το bootstrap: τα στατικά συμβόλαιά τους λαμβάνουν τις ακατέργαστες συγχωνευμένες
επιλογές handler/καθολικές και `behaviorInstance: undefined`. Συμβόλαια που βασίζονται αποκλειστικά σε instance
και προεπιλογές που εξαρτώνται από αίτημα δεν μπορούν να ελεγχθούν άμεσα. Scoped υλοποιήσεις
πρέπει να επικυρώνουν ρυθμίσεις που εξαρτώνται από το αίτημα μέσα στο `handle()`· οι στατικοί validators
πρέπει να λαμβάνουν υπόψη την απουσία του instance.

---

## Αναφορά API <a id="api-reference"></a>

### Exports <a id="exports"></a>

| Export | Τύπος | Περιγραφή |
|---|---|---|
| `PipelineModule` | Module | Εγγραφή μέσω `.forRoot()`, `.forRootAsync()` και `.forFeature()` |
| `UsePipeline` | Decorator | Προσάρτηση behaviors σε CQRS handlers |
| `SkipPipeline` | Decorator | Εξαίρεση καθολικών behaviors από συγκεκριμένο CQRS handler |
| `IPipelineBehavior` | Interface | Συμβόλαιο behavior: `handle(context, next)` |
| `IPipelineContext` | Interface | Πλούσιο context εκτέλεσης |
| `NextDelegate` | Τύπος | `() => Promise<TResponse>` |
| `BasePipelineContext` | Κλάση | Επεκτάσιμη βάση — υπερβείτε την εάν χρειάζεστε προσαρμοσμένα contexts |
| `PipelineContext` | Κλάση | Συγκεκριμένο context που δημιουργείται ανά κλήση |
| `LoggingBehavior` | Κλάση | Ενσωματωμένη δομημένη καταγραφή |
| `LoggingBehaviorOptions` | Interface | Επιλογές για το `LoggingBehavior` (`metricLogLevel`, `requestResponseLogLevel`, `errorLogLevel`, `mapLogLevel`, `excludeKeys`, `redactKeys`, `redactSensitiveKeys`, `excludeRequestObj`, `excludeResponseObj`, `logFormat`) |
| `ErrorClass` | Τύπος | Κλάση σφάλματος που χρησιμοποιείται ως κλειδί στο `mapLogLevel`· ταιριάζει επίσης και τις υποκλάσεις της |
| `logging` | Συνάρτηση | Typed intent builder που επιστρέφει `[LoggingBehavior, options]` για το `@UsePipeline` |
| `LoggingIntentOptions` | Τύπος | Ψευδώνυμο (alias) για το `LoggingBehaviorOptions` |
| `pipelineStore` | `AsyncLocalStorage` | Πρόσβαση στο τρέχον context του pipeline |
| `TenantPartitionOptions`, `tenantSegments` | Τύπος, συνάρτηση | Το τμήμα tenant ενός διαχωρισμένου κλειδιού και οι επιλογές του, κοινόχρηστο για key factories των cache, idempotency και rate-limit |
| `MissingPartitionError` | Κλάση | Βάση των partition errors των πακέτων (`MissingCachePartitionError`, …): `{ requestName, dimension, remedy }` |
| `ContextSource`, `CorrelationSource`, `ContextSources` | Τύποι | Η επιλογή `sources`: από πού αντλούν τα pipelines το tenant και correlation ID τους· μια πηγή correlation διαθέτει επίσης `create()` |
| `PipelineModuleOptions` | Interface | Επιλογές για το `PipelineModule.forRoot()` |
| `PipelineModuleAsyncOptions`, `PipelineOptionsFactory`, `PipelineRuntimeOptions` | Τύποι | Επιλογές `forRootAsync()`, συμβόλαιο factory `useClass`/`useExisting`, και τι επιστρέφει το factory |
| `PipelineModuleFeatureOptions` | Interface | Μορφή αντικειμένου του `forFeature()`: `{ imports, behaviors }` |
| `PipelineLoggerProvider` | Τύπος | Ένας provider του οποίου το `provide` είναι το `LOGGING_BEHAVIOR_LOGGER` |
| `LOGGING_BEHAVIOR_LOGGER` | Symbol | Injection token του logger που χρησιμοποιεί το `LoggingBehavior` |
| `GlobalBehaviorsOptions` | Interface | Ρύθμιση καθολικών behaviors |
| `GlobalBehaviorScope` | Τύπος | `'commands' \| 'queries' \| 'events' \| 'all'` |
| `PipelineItemToken<T>` | Interface | Τυπικό κλειδί στο context map |
| `createPipelineItem`, `getPipelineItem`, `setPipelineItem`, `requirePipelineItem`, `hasPipelineItem` | Συναρτήσεις | Accessors για typed context items |
| `MissingPipelineItemError` | Κλάση | Απαιτούμενο item απουσιάζει ή είναι undefined |
| `PipelineHandlerMeta` | Interface | Προϋπολογισμένα metadata του handler |
| `PIPELINE_BEHAVIOR_CONTRACT` | Symbol | Symbol key για δήλωση συμβολαίων behavior σε κλάσεις behavior |
| `PIPELINE_BEHAVIOR_ID` | Symbol | Προσαρμοσμένο κλειδί ταυτότητας για deduplication και συμβόλαιο behaviors |
| `PipelineConfigurationError` | Κλάση | Σφάλμα που εκπέμπεται όταν τα διαγνωστικά συμβολαίων bootstrap εντοπίσουν προβλήματα |
| `PipelineBehaviorDiagnostic` | Interface | Δομή μεμονωμένου διαγνωστικού ζητήματος |
| `IPipelineBehaviorOptionsResolver` | Interface | Προαιρετική μέθοδος instance `resolveEffectiveOptions` που συγχωνεύει προεπιλογές module· τα διαγνωστικά bootstrap περνούν το αποτέλεσμά της στους contract validators ως `effectiveOptions` |
| `PipelineBehaviorValidationContext` | Interface | Context επιθεώρησης handler και επιλογών που παρέχεται στους contract validators |
| `PIPELINE_SKIPPED_BEHAVIORS_METADATA` | Symbol | Κλειδί metadata για κλάσεις behaviors που παραλείφθηκαν |
| `SET_TENANT_ID` | Symbol | Write-once symbol setter για το `tenantId`, για custom runners που κατασκευάζουν context· η ανάθεση διαφορετικού tenant πετάει σφάλμα |
| `PipelineBehaviorEntry`, `PipelineBehaviorTuple` | Τύποι | `Type<TBehavior> \| [Type<TBehavior>, TOptions]`, και το tuple μόνο του, όπως επιστρέφονται από intent helpers |
| `getBehaviorId`, `BehaviorId` | Συνάρτηση, τύπος | Η ταυτότητα που χρησιμοποιείται για deduplication: `PIPELINE_BEHAVIOR_ID` όταν ορίζεται, αλλιώς η ίδια η κλάση |
| `PIPELINE_BEHAVIORS_METADATA`, `PIPELINE_BEHAVIORS_OPTIONS_METADATA` | Symbols | Κλειδιά metadata που εγγράφονται από το `@UsePipeline` |
| `IPipelineBehaviorContract`, `PipelineBehaviorOrder`, `PipelineBehaviorOrderRule` | Τύποι | Ένα συμβόλαιο behavior και οι κανόνες διάταξής του |
| `toPostgresJson` | Συνάρτηση | Αντικαθιστά τους χαρακτήρες NUL και τα μεμονωμένα surrogates που απορρίπτει το PostgreSQL `jsonb` σε JSON κείμενο με U+FFFD· χρησιμοποιείται από το Postgres audit sink και το dead-letter transport |

Οι serializers και τα βοηθητικά key-segment (`stableStringify`, `safeStringify`, …) προέρχονται από το
[`@cqrs-ddd/safe-stringify`](/nestjs-pipeline/packages/cqrs-ddd/safe-stringify/),
και το `uuidv7` από το `@cqrs-ddd/uuidv7`· εισαγάγετέ τα από εκεί.

**Πεδία `PipelineModuleOptions`:**

| Πεδίο | Τύπος | Περιγραφή |
|---|---|---|
| `behaviors` | `Type[]` | Κλάσεις behaviors προς δήλωση στο DI· η δήλωση από μόνη της δεν τα εκτελεί καθολικά |
| `globalBehaviors` | `GlobalBehaviorsOptions \| GlobalBehaviorsOptions[]` | Αυτόματη περιτύλιξη των αντίστοιχων handlers |
| `diagnostics` | `'strict' \| 'warn' \| 'off'` | Κατάσταση επαλήθευσης συμβολαίων behavior στο bootstrap (προεπιλογή `'strict'`) |
| `bootstrapLogLevel` | `LogLevel \| 'none'` | Επίπεδο log για μηνύματα bootstrap (προεπιλογή `'debug'`) |
| `loggerProvider` | `PipelineLoggerProvider` | Προσαρμοσμένος DI provider του οποίου το token `provide` πρέπει να είναι `LOGGING_BEHAVIOR_LOGGER` (δηλώνεται και εξάγεται) |
| `sources` | `ContextSources` | Από πού λαμβάνουν τα pipelines το tenant και correlation ID τους, όπως `tenantSource` και `correlationSource` |

---

## Άδεια χρήσης <a id="license"></a>

Διπλή άδεια χρήσης υπό την **AGPLv3** και **Εμπορική Άδεια (Commercial License)**. Δείτε τα αρχεία [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) και [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt) στη ρίζα για λεπτομέρειες.

Επικοινωνία: **aristotelis@ik.me**
