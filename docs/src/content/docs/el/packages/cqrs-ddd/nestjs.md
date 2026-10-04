---
title: "@cqrs-ddd/nestjs"
description: "NestJS adapter για τα πακέτα @cqrs-ddd: εκτελεί τους @nestjs/cqrs handlers μέσω pipeline behaviors, τυποποιεί τις αποκρίσεις σφαλμάτων με το ErrorFilter, και διασυνδέει το correlation και το job context."
editUrl: false
---

[![npm version](https://img.shields.io/npm/v/@cqrs-ddd/nestjs.svg)](https://www.npmjs.com/package/@cqrs-ddd/nestjs)
[![License](https://img.shields.io/npm/l/@cqrs-ddd/nestjs.svg)](https://www.npmjs.com/package/@cqrs-ddd/nestjs)

Ο NestJS adapter για τα πακέτα [`@cqrs-ddd`](https://github.com/aristoteliss/ddd-cqrs).

Οι εφαρμογές διατηρούν το επίσημο module `@nestjs/cqrs` (`CommandBus`, `QueryBus`, `EventBus`, `@CommandHandler`, `@QueryHandler`, `@EventsHandler`, `EventPublisher`). Αυτό το πακέτο παρέχει τη διασύνδεση μεταξύ του dependency injection του NestJS και του `@cqrs-ddd/pipeline`:

- Το `PipelineModule.forRoot({ globalBehaviors, sources, diagnostics })` εντοπίζει κάθε `@nestjs/cqrs` handler κατά το bootstrap και τυλίγει την εκτέλεσή του με τη μεταγλωττισμένη αλυσίδα behaviors του.
- Το `ErrorFilter` (`APP_FILTER`) μετατρέπει σφάλματα πακέτου και domain σε τυπικά `HttpException` instances του NestJS με το κανονικό payload `{ statusCode, error, message }` και τα κατάλληλα headers (π.χ. `Retry-After`).
- Το `@cqrs-ddd/nestjs/correlation` παρέχει το `CorrelationMiddleware` για τη δέσμευση των HTTP correlation IDs στο ασύγχρονο context και στα headers απόκρισης.
- Το `@cqrs-ddd/nestjs/job-context` παρέχει το `JobContextModule.forRoot(...)` για τη διάδοση context tenant, correlation και principal σε επεξεργαστές παρασκηνιακών εργασιών (background job processors).

## Περιεχόμενα <a id="contents"></a>

- [Εγκατάσταση](#installation)
- [Αρχιτεκτονική & Μηχανισμοί](#architecture--mechanics)
- [PipelineModule](#pipelinemodule)
  - [Δήλωση Module](#module-registration)
  - [Εντοπισμός Handlers](#handler-discovery)
  - [Παροχή Behaviors στα Modules](#providing-behaviors-in-modules)
  - [Αυστηροί Διαγνωστικοί Έλεγχοι](#strict-diagnostic-checks)
- [Διαχείριση Σφαλμάτων](#error-handling)
  - [ErrorFilter](#errorfilter)
  - [Βοηθητικά Εργαλεία Άμεσης Μετατροπής](#direct-conversion-utilities)
  - [Τυποποιημένα Payloads Σφαλμάτων](#standard-error-payloads)
- [Correlation Middleware](#correlation-middleware)
- [Job Context Module](#job-context-module)
- [Παράδειγμα Πλήρους Ρύθμισης](#complete-setup-example)
- [Πρόσοψη Πακέτου (@nestjs-pipeline/cqrs-ddd)](#package-facade-nestjs-pipelinecqrs-ddd)
- [Άδεια χρήσης](#license)

## Εγκατάσταση <a id="installation"></a>

```bash
pnpm add @cqrs-ddd/nestjs @cqrs-ddd/pipeline @cqrs-ddd/core
# or
npm install @cqrs-ddd/nestjs @cqrs-ddd/pipeline @cqrs-ddd/core
```

### Peer Dependencies <a id="peer-dependencies"></a>

- Απαιτούμενα: `@nestjs/common` (>=12.0.0), `@nestjs/core` (>=12.0.0), `@nestjs/cqrs` (>=12.0.0), `@cqrs-ddd/pipeline` (^0.5.0), `@cqrs-ddd/core` (^0.5.0), Node.js >= 22.12.0.
- Προαιρετικά peers (μετατρέπονται αυτόματα από το `ErrorFilter` όταν είναι παρόντα):
  - `@cqrs-ddd/pipeline-zod`
  - `@cqrs-ddd/pipeline-casl`
  - `@cqrs-ddd/pipeline-feature-flags`
  - `@cqrs-ddd/pipeline-rate-limit`
  - `@cqrs-ddd/pipeline-idempotency`
  - `@cqrs-ddd/pipeline-correlation`
  - `@cqrs-ddd/pipeline-job-context`

## Αρχιτεκτονική & Μηχανισμοί <a id="architecture--mechanics"></a>

Το NestJS διαχειρίζεται το dependency injection, το routing, τη σύνθεση των modules και την αποστολή (dispatch) μέσω CQRS. Το `@cqrs-ddd/nestjs` ενσωματώνει τα behaviors του pipeline σε αυτό το μοντέλο εκτέλεσης:

```
                      HTTP / Job Ingress
                               │
                     [CorrelationMiddleware]
                               │
                     [CommandBus / QueryBus]
                               │
                  ┌────────────┴────────────┐
                  │    Handler Instance     │
                  │   (Wrapped at Startup)  │
                  ├─────────────────────────┤
                  │ Behavior 1 (Logging)    │
                  │ Behavior 2 (Idempotency)│
                  │ Behavior 3 (CASL Auth)  │
                  │         ...             │
                  │ Handler.execute()       │
                  └────────────┬────────────┘
                               │
                     [Domain Exceptions]
                               │
                         [ErrorFilter]
                               │
                     Standard NestJS Body
```

### Πώς Τυλίγονται οι Handlers <a id="how-handlers-are-wrapped"></a>

1. Κατά το bootstrap της εφαρμογής (`OnApplicationBootstrap`), το `PipelineBootstrap` αναζητά μέσω του `DiscoveryService` του NestJS όλους τους καταχωρισμένους providers.
2. Εντοπίζει τους handlers που είναι διακοσμημένοι με `@CommandHandler`, `@QueryHandler` και `@EventsHandler`.
3. Για κάθε handler, επιθεωρεί τα metadata του pipeline που επισυνάπτονται μέσω των `@UsePipeline` και `@SkipPipeline`.
4. Μεταγλωττίζει ένα ενιαίο πλάνο pipeline χρησιμοποιώντας το `compilePipelinePlan` από το `@cqrs-ddd/pipeline`, συνδυάζοντας καθολικά behaviors και behaviors ειδικά για τον handler.
5. Επιλύει το singleton instance κάθε απαιτούμενου behavior από το module container.
6. Τυλίγει τη μέθοδο `execute` στους command και query handlers (ή τη `handle` στους event handlers) απευθείας στο εντοπισμένο instance του handler χρησιμοποιώντας το `createPipelineRunner`.
7. Όταν η εφαρμογή τερματίζεται (`OnModuleDestroy`), οι αρχικές μέθοδοι των handlers αποκαθίστανται καθαρά.

## PipelineModule <a id="pipelinemodule"></a>

### Δήλωση Module <a id="module-registration"></a>

Καταχωρίστε το `PipelineModule.forRoot` στο root ή στο infrastructure module σας:

```typescript
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PipelineModule } from '@cqrs-ddd/nestjs';
import { LoggingBehavior } from '@cqrs-ddd/pipeline';
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      sources: {
        tenantId: tenantSource,
        correlationId: correlationSource,
      },
      globalBehaviors: [
        { scope: 'all', before: [LoggingBehavior] },
      ],
      diagnostics: 'strict', // 'strict' (default) | 'warn' | 'off'
    }),
  ],
})
export class AppModule {}
```

#### PipelineOptions <a id="pipelineoptions"></a>

| Επιλογή | Τύπος | Περιγραφή |
| --- | --- | --- |
| `globalBehaviors` | `GlobalBehaviorsOptions \| GlobalBehaviorsOptions[]` | Behaviors που τοποθετούνται καθολικά για `'all'`, `'commands'`, `'queries'`, ή `'events'`. |
| `sources` | `ContextSources` | Πηγές για γνωρίσματα context του pipeline (`tenantId`, `correlationId`, `principalId`, κ.λπ.). |
| `diagnostics` | `'strict' \| 'warn' \| 'off'` | Λειτουργία διαγνωστικών. Προεπιλογή: `'strict'`. |

### Εντοπισμός Handlers <a id="handler-discovery"></a>

Οι handlers δηλώνουν τα behaviors του pipeline χρησιμοποιώντας τον τυπικό decorator `@UsePipeline`:

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { IdempotencyBehavior } from '@cqrs-ddd/pipeline-idempotency';
import { CaslBehavior } from '@cqrs-ddd/pipeline-casl';
import { ZodValidationBehavior } from '@cqrs-ddd/pipeline-zod';

@CommandHandler(CreateUserCommand)
@UsePipeline(
  ZodValidationBehavior,
  IdempotencyBehavior,
  CaslBehavior,
)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand, User> {
  async execute(command: CreateUserCommand): Promise<User> {
    // Handler business logic executes inside the compiled pipeline
    return user;
  }
}
```

### Παροχή Behaviors στα Modules <a id="providing-behaviors-in-modules"></a>

Τα behaviors δημιουργούνται ως singleton providers εντός των modules που κατέχουν τις εξαρτήσεις τους. Το token του provider **πρέπει να είναι η ίδια η κλάση του behavior**:

```typescript
import { Module, Logger } from '@nestjs/common';
import { LoggingBehavior } from '@cqrs-ddd/pipeline';
import { IdempotencyBehavior, MemoryIdempotencyStore } from '@cqrs-ddd/pipeline-idempotency';

@Module({
  providers: [
    {
      provide: LoggingBehavior,
      useFactory: () => new LoggingBehavior(new Logger('Pipeline')),
    },
    {
      provide: IdempotencyBehavior,
      useFactory: () => new IdempotencyBehavior(new MemoryIdempotencyStore()),
    },
  ],
  exports: [LoggingBehavior, IdempotencyBehavior],
})
export class ReliabilityModule {}
```

### Αυστηροί Διαγνωστικοί Έλεγχοι <a id="strict-diagnostic-checks"></a>

Όταν είναι ενεργοποιημένο το `diagnostics: 'strict'` (η προεπιλογή), το `PipelineBootstrap` επιβάλλει κανόνες αρχιτεκτονικής ασφάλειας κατά την εκκίνηση και διακόπτει την αρχικοποίηση με αναλυτικά σφάλματα εάν αποτύχει οποιοσδήποτε έλεγχος:

1. **Ελλείπων Behavior Provider**: Εάν ένας handler απαιτεί ένα behavior αλλά κανένα module δεν το καταχώρισε ως provider υπό την κλάση του, το bootstrap αποτυγχάνει:
   ```
   Error: IdempotencyBehavior runs in the pipeline of CreateUserHandler, but no module provides it. Register it as a provider of the module that configures it.
   ```
2. **Διπλότυπος Behavior Provider**: Εάν πολλαπλά modules καταχωρίσουν provider για το ίδιο token behavior, το bootstrap αποτυγχάνει για να αποφευχθεί ασάφεια στη σειρά εισαγωγής:
   ```
   Error: LoggingBehavior is provided by ObservabilityModule and SharedModule; exactly one module provides each behavior, otherwise which instance a handler gets would depend on import order.
   ```
3. **Απαγόρευση Request-Scoped Handlers**: Εάν ένας handler ή οποιαδήποτε εξάρτησή του έχει scope αιτήματος (`Scope.REQUEST`), το bootstrap πετά εξαίρεση αμέσως. Οι handlers που εκτελούν pipeline behaviors πρέπει να είναι singletons· η πρόσβαση σε contextual πληροφορίες αιτήματος πρέπει να γίνεται μέσω πηγών context ασύγχρονου local storage:
   ```
   Error: CreateUserHandler runs pipeline behaviors but is request-scoped, itself or through a dependency; Nest builds it per request, so its pipeline would never run. Make it a singleton and read request data from async context.
   ```
4. **Συμβόλαια Behaviors**: Οι αναλλοίωτες συμβολαίου (όπως περιορισμοί σειράς, απαιτούμενες εξαρτήσεις ή τοποθέτηση caching behavior) επικυρώνονται μέσω του `validateBehaviorContracts`.

## Διαχείριση Σφαλμάτων <a id="error-handling"></a>

### ErrorFilter <a id="errorfilter"></a>

Το `ErrorFilter` είναι ένα καθολικό NestJS exception filter που επεκτείνει το `BaseExceptionFilter`. Συλλαμβάνει όλες τις εξαιρέσεις, ελέγχει αν το σφάλμα προέρχεται από το `@cqrs-ddd`, το αντιστοιχίζει στο κατάλληλο `HttpException`, εφαρμόζει τα απαραίτητα headers απόκρισης HTTP (όπως το `Retry-After`), και το προωθεί στο NestJS:

```typescript
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ErrorFilter } from '@cqrs-ddd/nestjs';

@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: ErrorFilter,
    },
  ],
})
export class AppModule {}
```

Μπορείτε επίσης να επεκτείνετε το `ErrorFilter` για να προσθέσετε μετασχηματισμούς σφαλμάτων ειδικούς για την εφαρμογή:

```typescript
import { Catch, ArgumentsHost } from '@nestjs/common';
import { ErrorFilter } from '@cqrs-ddd/nestjs';

@Catch()
export class DomainExceptionFilter extends ErrorFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    // Custom handling if needed, then delegate to ErrorFilter
    super.catch(exception, host);
  }
}
```

### Βοηθητικά Εργαλεία Άμεσης Μετατροπής <a id="direct-conversion-utilities"></a>

Το `@cqrs-ddd/nestjs` εξάγει αυτόνομες βοηθητικές συναρτήσεις για τη μετατροπή domain σφαλμάτων χωρίς τη διέλευση από το φίλτρο:

```typescript
import { httpAnswer, toHttpException, validationMessages } from '@cqrs-ddd/nestjs';

// 1. toHttpException
const exception = toHttpException(domainError);
if (exception) {
  throw exception;
}

// 2. httpAnswer (includes headers)
const answer = httpAnswer(new RateLimitExceededError({ limit: 10, windowMs: 60000, retryAfterMs: 5000 }));
if (answer) {
  console.log(answer.exception.getStatus()); // 429
  console.log(answer.headers);               // { 'Retry-After': '5' }
}

// 3. validationMessages
const messages = validationMessages({
  formErrors: ['Submission rejected'],
  fieldErrors: { email: ['Must be a valid email'], name: ['Required'] },
});
// ['Submission rejected', 'email: Must be a valid email', 'name: Required']
```

### Τυποποιημένα Payloads Σφαλμάτων <a id="standard-error-payloads"></a>

Όλα τα μετατρεπόμενα σφάλματα ταιριάζουν με το τυπικό περίβλημα (envelope) HTTP σφάλματος του NestJS:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": ["email: Must be a valid email"]
}
```

#### Πίνακας Αντιστοιχιών <a id="mappings-table"></a>

| Σφάλμα Πακέτου | Status Code | HTTP Status | Headers |
| --- | --- | --- | --- |
| `ZodValidationError` | 400 | Bad Request | — |
| `InvalidValueException` | 400 | Bad Request | — |
| `MissingTenantContextError` | 400 | Bad Request | — |
| `UnauthorizedActionException` | 403 | Forbidden | — |
| `FeatureDisabledError` | 403 / 404 | Forbidden / Not Found | — |
| `EntityNotFoundException` | 404 | Not Found | — |
| `ConcurrencyConflictError` | 409 | Conflict | — |
| `IdempotencyConflictError` | 409 | Conflict | — |
| `RateLimitExceededError` | 429 | Too Many Requests | `Retry-After: <seconds>` |
| `TransientOperationError` | 503 | Service Unavailable | — |

## Correlation Middleware <a id="correlation-middleware"></a>

Το `@cqrs-ddd/nestjs/correlation` παρέχει το `CorrelationMiddleware`, το οποίο διαβάζει τα εισερχόμενα correlation headers (π.χ. `x-correlation-id`), παράγει ένα UUIDv7 correlation ID εάν απουσιάζει, το δεσμεύει στο ασύγχρονο context εκτέλεσης, και ορίζει το correlation header στην εξερχόμενη απόκριση.

Καταχωρίστε το middleware στη μέθοδο `configure` του root module σας:

```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { CorrelationMiddleware } from '@cqrs-ddd/nestjs/correlation';

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationMiddleware)
      .forRoutes('*');
  }
}
```

## Job Context Module <a id="job-context-module"></a>

Το `@cqrs-ddd/nestjs/job-context` παρέχει το `JobContextModule` για την απρόσκοπτη ενσωμάτωση background workers (όπως επεξεργαστές BullMQ ή καταναλωτές Kafka) με το `@cqrs-ddd/pipeline-job-context`. Καταχωρίζει το principal του job, τη λίστα tenants, και τις πηγές context κατά το bootstrap της εφαρμογής και τα αποκαταχωρίζει κατά τον τερματισμό:

```typescript
import { Module } from '@nestjs/common';
import { JobContextModule } from '@cqrs-ddd/nestjs/job-context';
import { AuthsModule } from '../auths/auths.module.js';
import { SessionJobPrincipal } from '../auths/session-job-principal.js';
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';

@Module({
  imports: [
    JobContextModule.forRoot({
      imports: [AuthsModule],
      principal: SessionJobPrincipal,
      tenants: ['tenant_a', 'tenant_b'],
      sources: {
        tenantId: tenantSource,
        correlationId: correlationSource,
      },
    }),
  ],
})
export class BackgroundWorkerModule {}
```

## Παράδειγμα Πλήρους Ρύθμισης <a id="complete-setup-example"></a>

Ακολουθεί ένα πλήρες παράδειγμα ρύθμισης που παρουσιάζει τα `PipelineModule`, `ErrorFilter` και `CorrelationMiddleware`:

```typescript
import { Module, NestModule, MiddlewareConsumer, Logger } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { PipelineModule, ErrorFilter } from '@cqrs-ddd/nestjs';
import { CorrelationMiddleware } from '@cqrs-ddd/nestjs/correlation';
import { LoggingBehavior } from '@cqrs-ddd/pipeline';
import { CaslBehavior, CaslAuthorizer } from '@cqrs-ddd/pipeline-casl';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      sources: {
        tenantId: tenantSource,
        correlationId: correlationSource,
      },
      globalBehaviors: [
        { scope: 'all', before: [LoggingBehavior] },
      ],
      diagnostics: 'strict',
    }),
  ],
  providers: [
    {
      provide: LoggingBehavior,
      useFactory: () => new LoggingBehavior(new Logger('Pipeline')),
    },
    {
      provide: CaslBehavior,
      useFactory: (authorizer: CaslAuthorizer) => new CaslBehavior(authorizer),
      inject: [CaslAuthorizer],
    },
    {
      provide: APP_FILTER,
      useClass: ErrorFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationMiddleware)
      .forRoutes('*');
  }
}
```

## Πρόσοψη Πακέτου (@nestjs-pipeline/cqrs-ddd) <a id="package-facade-nestjs-pipelinecqrs-ddd"></a>

Για συμβατότητα με προηγούμενες εκδόσεις και ενιαία ονοματοδοσία στο monorepo, παρέχεται επίσης το πακέτο `@nestjs-pipeline/cqrs-ddd`. Αποτελεί μια πρόσοψη μηδενικού κώδικα (zero-code facade) που επανεξάγει απευθείας το `@cqrs-ddd/nestjs`:

```typescript
// Equivalent imports:
import { PipelineModule, ErrorFilter } from '@cqrs-ddd/nestjs';
import { PipelineModule, ErrorFilter } from '@nestjs-pipeline/cqrs-ddd';
```

## Άδεια χρήσης <a id="license"></a>

Αυτό το πακέτο αποτελεί μέρος του monorepo `nestjs-pipeline`. Δείτε τις λεπτομέρειες άδειας χρήσης του repository.
