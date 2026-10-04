---
title: "Αναβάθμιση από την έκδοση 0.1.x"
sidebar:
  order: 3
---

Η έκδοση 0.2.0 επιφέρει breaking changes στο API των πέντε πακέτων που υπήρχαν προηγουμένως στο npm:
`@nestjs-pipeline/core` 0.1.18, `/correlation`, `/opentelemetry`, `/zod` και `/casl`.
Κάθε αλλαγή παρατίθεται ανά πακέτο στο [CHANGELOG.md](/nestjs-pipeline/changelog/)· οι παρακάτω απαιτούν αλλαγή κώδικα στις περισσότερες εφαρμογές.

**1. Node.js 22 και NestJS 11.** Κάθε πακέτο δηλώνει `engines.node >=22`. Το Core απαιτεί
`@nestjs/common`, `@nestjs/core` και `@nestjs/cqrs` `^11.0.0`· τα `/correlation`,
`/opentelemetry`, `/zod` και `/casl` απαιτούν `@nestjs/common` `^11.0.0`, και τα τρία τελευταία
απαιτούν επίσης `@nestjs-pipeline/core` `^0.2.0` (ήταν `*`). Το Core εγκαθιστά πλέον τα
`@cqrs-ddd/uuidv7`, `@cqrs-ddd/untyped` και `@cqrs-ddd/safe-stringify` ως εξαρτήσεις (dependencies).

**2. Το tenant και το correlation id προέρχονται από τα `sources`.** Οι επιλογές module
`correlationIdFactory` και `correlationIdRunner` έχουν αφαιρεθεί. Περάστε αντ' αυτών τα stores των
`@nestjs-pipeline/correlation` (και, για multi-tenant εφαρμογές, του `@nestjs-pipeline/tenant`):

```typescript
// 0.1.x
import { getCorrelationId, runWithCorrelationId } from '@nestjs-pipeline/correlation';

PipelineModule.forRoot({
  correlationIdFactory: getCorrelationId,
  correlationIdRunner: runWithCorrelationId,
  globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
});

// 0.2.0
import { correlationSource } from '@nestjs-pipeline/correlation';
import { tenantSource } from '@nestjs-pipeline/tenant';

PipelineModule.forRoot({
  sources: { tenantId: tenantSource, correlationId: correlationSource },
  globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
});
```

Χωρίς `sources`, το bootstrap καταγράφει μια προειδοποίηση· το `sources: {}` την απενεργοποιεί όταν δεν χρησιμοποιείτε κανένα από τα δύο πακέτα.

**3. Τα `correlationStore` και `setCorrelationFallback` καταργήθηκαν.** Διαβάστε και ορίστε το ID μέσω των συναρτήσεων, οι οποίες διατηρούν το API τους (τα `HttpCorrelationMiddleware` και `addCorrelationId` αλλάζουν· δείτε τις [σημειώσεις μετάβασης του correlation](/nestjs-pipeline/packages/nestjs-pipeline/correlation/#migrating-from-01x)):

```typescript
// 0.1.x
import { correlationStore } from '@nestjs-pipeline/correlation';
correlationStore.run(job.id, () => this.commandBus.execute(command));
const id = correlationStore.getStore();

// 0.2.0
import { getCorrelationId, runWithCorrelationId } from '@nestjs-pipeline/correlation';
await runWithCorrelationId(job.id, () => this.commandBus.execute(command));
const id = getCorrelationId();
```

**4. Το correlation ID ενός εκτελούμενου pipeline είναι read-only.** Το `originalCorrelationId` έχει αφαιρεθεί, και ένα behavior δεν μπορεί πλέον να αναθέσει τιμή στο `context.correlationId`. Ορίστε το ID εκεί όπου εισέρχεται η εργασία: `HttpCorrelationMiddleware`, `@WithCorrelation()` ή `runWithCorrelationId()`.

```typescript
// 0.1.x — inside a behavior
context.correlationId = request.headers['x-request-id'];

// 0.2.0 — where the work enters
await runWithCorrelationId(message.properties.correlationId, () =>
  this.commandBus.execute(command),
);
```

**5. Τα βοηθητικά προγράμματα (utilities) μετακινούνται στα δικά τους πακέτα.** Το Core δεν εξάγει πλέον τα `uuidv7`, `isUuidV7` και `untyped`, και το `/correlation` δεν εξάγει πλέον το `uuidv7`:

```typescript
// 0.1.x
import { untyped, uuidv7 } from '@nestjs-pipeline/core';
import { uuidv7 } from '@nestjs-pipeline/correlation';

// 0.2.0
import { untyped } from '@cqrs-ddd/untyped';
import { isUuidV7, uuidv7 } from '@cqrs-ddd/uuidv7';
```

**6. Τα internals του Core δεν εξάγονται πλέον.** Τα `PipelineBootstrapService`,
`PIPELINE_MODULE_OPTIONS`, `PIPELINE_OPTIONS_REGISTRY`, `clearPipelineOptionsRegistry`,
`SET_RESPONSE` και `SET_ORIGINAL_CORRELATION_ID` είναι πλέον εσωτερικά. Ρυθμίστε το pipeline μέσω
του `PipelineModule.forRoot` ή του νέου `forRootAsync`:

```typescript
PipelineModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    bootstrapLogLevel: config.get('PIPELINE_LOG_LEVEL') ?? 'debug',
  }),
});
```

**7. Τα διαγνωστικά bootstrap είναι αυστηρά (strict) από προεπιλογή.** Η νέα επιλογή `diagnostics` έχει ως προεπιλογή το `'strict'`: ένας handler του οποίου το behavior δηλώνει ένα `PIPELINE_BEHAVIOR_CONTRACT` που το pipeline του handler δεν ικανοποιεί προκαλεί το bootstrap να παράγει `PipelineConfigurationError`, το οποίο παραθέτει κάθε handler, behavior και τη σχετική διόρθωση. Διορθώστε τον αναφερόμενο handler, ή χαλαρώστε τον έλεγχο ενόσω το κάνετε:

```typescript
PipelineModule.forRoot({ sources: {}, diagnostics: 'warn' }); // or 'off'
```

**8. Το `loggerProvider` πρέπει να παρέχει το `LOGGING_BEHAVIOR_LOGGER`.** Η επιλογή μπορούσε να είναι οποιοσδήποτε NestJS `Provider`· τώρα είναι `PipelineLoggerProvider`, του οποίου το `provide` πρέπει να είναι αυτό το token:

```typescript
// 0.1.x
PipelineModule.forRoot({ loggerProvider: { provide: 'LOGGER', useClass: PinoLogger } });

// 0.2.0
import { LOGGING_BEHAVIOR_LOGGER } from '@nestjs-pipeline/core';
PipelineModule.forRoot({
  loggerProvider: { provide: LOGGING_BEHAVIOR_LOGGER, useClass: PinoLogger },
});
```

**9. Ένα behavior χωρίς ρητό id αναγνωρίζεται από την κλάση του.** Το `getBehaviorId()`
επιστρέφει την κλάση, όχι το `cls.name`, και το `PIPELINE_BEHAVIOR_ID` είναι τιμή `Symbol.for`. Κώδικας
που συνέκρινε ids με strings πρέπει να συγκρίνει κλάσεις, ή να ορίσει ένα ρητό id:

```typescript
// 0.1.x
if (getBehaviorId(entry) === 'AuditBehavior') { /* ... */ }

// 0.2.0
if (getBehaviorId(entry) === AuditBehavior) { /* ... */ }
```

**10. Το `LoggingBehavior` καλύπτει (masks) ευαίσθητα πεδία από προεπιλογή.** Κλειδιά όπως `password`, `token`
και `refreshToken` (αγνοώντας πεζά/κεφαλαία, `_` και `-`) καταγράφονται ως `[REDACTED]`. Για να διατηρήσετε την
έξοδο του 0.1.x για έναν handler:

```typescript
@UsePipeline([LoggingBehavior, { redactSensitiveKeys: false }])
```

**11. `@nestjs-pipeline/zod`: Το `ZOD_SCHEMA` αφαιρέθηκε** (ήταν deprecated alias), και το `zod`
πρέπει να είναι `^4.3.0`.

```typescript
// 0.1.x
static readonly [ZOD_SCHEMA] = userCreatedSchema;
// 0.2.0
static readonly [ZOD_SCHEMA_KEY] = userCreatedSchema;
```

**12. Το `ZodValidationBehavior` εφαρμόζει τα αναλυμένα δεδομένα στο αίτημα.** Στο 0.1.x μόνο
επικύρωνε. Τώρα αναλύει ασύγχρονα (`safeParseAsync`), διαγράφει κλειδιά που το σχήμα αφαιρεί (strips),
και αναθέτει εξαναγκασμένες και προεπιλεγμένες τιμές στο αίτημα πριν εκτελεστεί ο handler. Ένα σχήμα
του οποίου η έξοδος ανώτατου επιπέδου δεν είναι απλό αντικείμενο (ένας πίνακας, ένας πρωταρχικός τύπος, ένα `Date`) απορρίπτεται
με `TypeError`. Ένας handler που διάβαζε άγνωστα ή ακατέργαστα πεδία πρέπει να τα δηλώνει στο
σχήμα. Μια κλάση που δημιουργήθηκε με το `createCommand()` ή το `createQuery()` διατηρεί την αρχική της είσοδο:

```typescript
// 0.2.0
import { getRawInput } from '@nestjs-pipeline/zod';
const raw = getRawInput(command);
```

**13. `@nestjs-pipeline/casl`: Μία ενιαία πηγή δικαιωμάτων αντικαθιστά τους providers.**
Οι επιλογές module `roleProvider`, `userCapabilityProvider`, `userContextResolver`,
`subjectContextPaths` και `defaultFieldsFromRequest` έχουν αφαιρεθεί, και το `@casl/ability` πρέπει να είναι
`^7.0.0`. Οι επιλογές του `CaslBehavior` `subjectFromRequest`, `subjectContextPaths`,
`fieldsFromRequest`, `skipCheck` και `prebuiltAbility` έχουν αφαιρεθεί, και το `rules` είναι υποχρεωτικό
και μη κενό. Τα tokens των providers (`CASL_ROLE_PROVIDER`, `CASL_USER_CAPABILITY_PROVIDER`,
`CASL_USER_CONTEXT_RESOLVER`, …), το `StaticRoleProvider` και το `buildAbilityFromRules` έχουν αφαιρεθεί,
και το `buildAbility(roles, user, …)` γίνεται `buildAbility(rules, principal)`. Υλοποιήστε το
`ICaslPermissionSource`, του οποίου το `load()` επιστρέφει τον καλούντα και τους κανόνες του, και ελέγξτε
οντότητες και πεδία στον handler με το `CaslAuthorizer`:

```typescript
// 0.1.x
CaslModule.forRoot({
  roleProvider: { useFactory: () => roleProvider },
  subjectContextPaths: ['sessionUser'],
  userCapabilityProvider: DatabaseUserCapabilityProvider,
});

@UsePipeline([CaslBehavior, { rules: [{ action: 'create', subject: 'Post' }] }])

// 0.2.0
@Injectable()
export class AppPermissionSource implements ICaslPermissionSource {
  constructor(private readonly grants: GrantRepository) {}

  async load(): Promise<CaslAuthorizationInput | null> {
    const session = currentSession();
    if (!session) return null; // unauthenticated: every gated handler is denied
    return {
      principal: { id: session.userId },
      rules: await this.grants.rulesFor(session.userId),
    };
  }
}

CaslModule.forRoot({
  imports: [AuthorizationModule],
  permissionSource: { useExisting: AppPermissionSource },
});

@UsePipeline(requires({ action: 'create', subject: 'Post' }))
```

**14. Μια άρνηση CASL προκαλεί `UnauthorizedActionException`, όχι `ForbiddenException`.** Επεκτείνει
το `Error`, επομένως χωρίς το φίλτρο του το NestJS απαντά με HTTP 500. Δηλώστε το φίλτρο για να διατηρήσετε
το 403:

```typescript
import { APP_FILTER } from '@nestjs/core';
import { UnauthorizedActionFilter } from '@nestjs-pipeline/casl';

@Module({
  providers: [{ provide: APP_FILTER, useClass: UnauthorizedActionFilter }],
})
export class AppModule {}
```

Κάθε README πακέτου διαθέτει μια πλήρη ενότητα μετάβασης:
[core](/nestjs-pipeline/packages/nestjs-pipeline/core/#migrating-from-01x),
[correlation](/nestjs-pipeline/packages/nestjs-pipeline/correlation/#migrating-from-01x),
[opentelemetry](/nestjs-pipeline/packages/nestjs-pipeline/opentelemetry/#migrating-from-01x),
[zod](/nestjs-pipeline/packages/nestjs-pipeline/zod/#migrating-from-01x),
[casl](/nestjs-pipeline/packages/nestjs-pipeline/casl/#migrating-from-01x),
[uuidv7](/nestjs-pipeline/packages/cqrs-ddd/uuidv7/#migrating-from-nestjs-pipelinecore-01x),
[untyped](/nestjs-pipeline/packages/cqrs-ddd/untyped/#migrating-from-nestjs-pipelinecore-01x) και
[safe-stringify](/nestjs-pipeline/packages/cqrs-ddd/safe-stringify/#migrating-from-nestjs-pipelinecore-01x).
