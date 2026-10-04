---
title: "@nestjs-pipeline/feature-flags"
description: "Feature-flag gating behavior για το NestJS pipeline — ανεξάρτητο από providers μέσω του OpenFeature (Unleash, Flagsmith, LaunchDarkly, …)."
editUrl: false
---

> **Από την έκδοση 0.5.0 αυτό το πακέτο συνεχίζει ως [`@cqrs-ddd/pipeline-feature-flags`](https://www.npmjs.com/package/@cqrs-ddd/pipeline-feature-flags).** Ο κώδικας, τα issues και
> τα releases βρίσκονται στο [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs), με τεκμηρίωση στο [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-feature-flags/).
> Οι εφαρμογές NestJS προσθέτουν το [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs). Οι εκδόσεις 0.1 έως 0.4 του
> `@nestjs-pipeline/feature-flags` παραμένουν στο npm αμετάβλητες, και η γραμμή 0.4.x λαμβάνει μόνο διορθώσεις (fixes).

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/feature-flags.svg)](https://www.npmjs.com/package/@nestjs-pipeline/feature-flags)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/feature-flags.svg)](https://www.npmjs.com/package/@nestjs-pipeline/feature-flags)

Feature-flag **gating** behavior για το `@nestjs-pipeline/core` — τυλίξτε οποιονδήποτε command, query ή event handler πίσω από μια boolean σημαία και κάντε short-circuit (ή χρησιμοποιήστε fallback) όταν είναι απενεργοποιημένη.

Provider-agnostic από σχεδιασμό: επικοινωνεί αποκλειστικά με το API του **[OpenFeature](https://openfeature.dev)**, επομένως η υποκείμενη πηγή αποτελεί ένα drop-in υποκατάστατο. Το **Unleash** χρησιμοποιείται στα παρακάτω παραδείγματα, και το **Flagsmith** (ή LaunchDarkly, ένα τοπικό αρχείο, …) αποτελεί αντικατάσταση μίας γραμμής — οι handlers σας δεν αλλάζουν ποτέ.

---

## Πίνακας Περιεχομένων <a id="table-of-contents"></a>

- [Γιατί το OpenFeature;](#why-openfeature)
- [Εγκατάσταση](#installation)
- [Ρύθμιση](#setup)
  - [1. Δήλωση FeatureFlagBehavior provider](#1-register-featureflagbehavior-provider)
  - [2. Πύλη ελέγχου σε handler](#2-gate-a-handler)
- [Drop-in αντικατάσταση: Flagsmith](#drop-in-replacement-flagsmith)
- [Συμπεριφορά](#behavior)
- [Ρύθμιση παραμέτρων](#configuration)
  - [Επιλογές](#options)
  - [Προεπιλογές σε επίπεδο module](#module-wide-defaults)
  - [Targeting Context](#targeting-context)
  - [Ομαλή υποχώρηση (Graceful Fallback)](#graceful-fallback)
  - [Αντιστοίχιση του σφάλματος σε HTTP](#mapping-the-error-to-http)
- [Προσαρμοσμένος Logger](#custom-logger)
- [Behavior Contract & Bootstrap Diagnostics](#behavior-contract--bootstrap-diagnostics)
- [Αναφορά API](#api-reference)
- [Άδεια χρήσης](#license)

---

## Γιατί το OpenFeature; <a id="why-openfeature"></a>

Το [OpenFeature](https://openfeature.dev) είναι ένα vendor-neutral **πρότυπο** του CNCF για
την αξιολόγηση feature flags. Αυτό το πακέτο βασίζεται στο `@openfeature/server-sdk`, επομένως:

- **Γενικό (Generic)** — οι handlers εξαρτώνται από ένα flag *key*, ποτέ από ένα vendor SDK.
- **Εναλλάξιμο (Swappable)** — αλλάξτε τον provider σε ένα μόνο σημείο (`forRoot`) για μετακίνηση μεταξύ
  Unleash, Flagsmith, LaunchDarkly, GO Feature Flag, μεταβλητών περιβάλλοντος κ.λπ.
- **Δοκιμάσιμο (Testable)** — κατευθύνετέ το σε έναν in-memory provider στα tests.

---

## Εγκατάσταση <a id="installation"></a>

```bash
pnpm add @cqrs-ddd/pipeline-feature-flags @cqrs-ddd/nestjs @cqrs-ddd/pipeline @nestjs/cqrs @openfeature/server-sdk
```

**Peer dependencies:**

```bash
pnpm add @nestjs/common @nestjs/core reflect-metadata
```

Απαιτεί Node.js 22.12 ή νεότερο, `@nestjs/common` και `@nestjs/core` `^12.1.0`,
και `@openfeature/server-sdk` `^1.13.0`.

Συν **έναν** OpenFeature provider για το backend σας, π.χ. Unleash:

```bash
pnpm add @openfeature/unleash-provider
```

---

## Ρύθμιση <a id="setup"></a>

### 1. Δήλωση FeatureFlagBehavior provider <a id="1-register-featureflagbehavior-provider"></a>

Στο reliability module σας, αρχικοποιήστε τον client του OpenFeature και παρέχετε το `FeatureFlagBehavior`:

```typescript
// reliability.module.ts
import { Module, Logger } from '@nestjs/common';
import { PipelineModule } from '@cqrs-ddd/nestjs';
import {
  createFeatureFlagClient,
  FeatureFlagBehavior,
} from '@cqrs-ddd/pipeline-feature-flags';
import { UnleashProvider } from '@openfeature/unleash-provider';

const FEATURE_FLAGS = {
  provider: new UnleashProvider({
    url: 'https://unleash.example.com/api',
    appName: 'my-app',
    token: process.env.UNLEASH_TOKEN!,
  }),
};

@Module({
  imports: [
    PipelineModule.forRoot(),
  ],
  providers: [
    {
      provide: FeatureFlagBehavior,
      useFactory: async () =>
        new FeatureFlagBehavior(
          await createFeatureFlagClient(FEATURE_FLAGS),
          undefined, // Global default options
          { environment: process.env.NODE_ENV ?? 'development' },
          new Logger(FeatureFlagBehavior.name),
        ),
    },
  ],
})
export class ReliabilityModule {}
```

> Το module αναμένει την ετοιμότητα του provider (`setProviderAndWait`) κατά το bootstrap από
> προεπιλογή, ώστε το πρώτο αίτημα να βλέπει ήδη σωστές τιμές flags. Ορίστε
> `waitForReady: false` για δήλωση χωρίς καθυστέρηση της εκκίνησης.

Το registry των providers του OpenFeature λειτουργεί σε επίπεδο διεργασίας (process-wide). Ένας `provider` χωρίς `domain`
γίνεται ο provider του default domain, επομένως δύο εφαρμογές στην ίδια διεργασία
που δηλώνουν από έναν αντικαθιστούν η μία την άλλη· δώστε σε κάθε εφαρμογή το δικό της
`domain`, ή περάστε έναν δικό σας `client`. Κατά τον τερματισμό της εφαρμογής, το module
αντικαθιστά τον provider που δήλωσε με τον no-op provider του OpenFeature, ο οποίος
τον κλείνει εκτός αν κάποιο άλλο domain εξακολουθεί να τον χρησιμοποιεί· ένας provider που έχει εν τω μεταξύ
αντικατασταθεί, καθώς και ένας παρεχόμενος `client`, αφήνονται στον ιδιοκτήτη τους. Το module δεν
καλεί ποτέ το καθολικό `OpenFeature.close()`.

### 2. Πύλη ελέγχου σε handler <a id="2-gate-a-handler"></a>

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import { featureFlag } from '@nestjs-pipeline/feature-flags';

@CommandHandler(NewCheckoutCommand)
@UsePipeline(featureFlag({ flag: 'new-checkout' }))
export class NewCheckoutHandler implements ICommandHandler<NewCheckoutCommand> {
  async execute(command: NewCheckoutCommand): Promise<Receipt> {
    // Εκτελείται μόνο όταν η σημαία 'new-checkout' είναι ενεργοποιημένη για αυτό το αίτημα.
    return this.checkout.run(command);
  }
}
```

> Η ακατέργαστη μορφή tuple `@UsePipeline([FeatureFlagBehavior, { flag: 'new-checkout' }])` εξακολουθεί να υποστηρίζεται ως escape hatch.

Όταν το `new-checkout` είναι **ανενεργό (off)**, ο handler δεν εκτελείται ποτέ — το behavior εγείρει
`FeatureDisabledError` (ή επιστρέφει το δικό σας `fallback`).

---

## Drop-in αντικατάσταση: Flagsmith <a id="drop-in-replacement-flagsmith"></a>

Η αλλαγή providers απαιτεί αλλαγή **μίας γραμμής** στο `forRoot` — κανένας handler δεν επηρεάζεται:

```typescript
import { FlagsmithProvider } from '@openfeature/flagsmith-provider';

FeatureFlagsModule.forRoot({
  provider: new FlagsmithProvider({
    environmentKey: process.env.FLAGSMITH_KEY!,
  }),
});
```

Το flag key (`'new-checkout'`) και κάθε decorator `@UsePipeline` παραμένουν ακριβώς
τα ίδια.

---

## Συμπεριφορά <a id="behavior"></a>

Για κάθε αίτημα, το `FeatureFlagBehavior`:

1. Επιλύει τις ισχύουσες επιλογές (module defaults ← επιλογές ανά handler).
2. Εάν **δεν έχει ρυθμιστεί `flag`** → διέρχεται απευθείας (no-op).
3. Κατασκευάζει ένα targeting [context](#targeting-context) από το αίτημα.
4. Αξιολογεί τις boolean λεπτομέρειες μέσω του OpenFeature. Το `errorPolicy: 'use-default'` χρησιμοποιεί
   το `defaultValue` (προεπιλογή `false`)· το `'throw'` εγείρει `FeatureFlagEvaluationError`.
   Εάν έχει οριστεί `allowedVariants`, μια τιμή true απαιτεί επίσης μια επιτρεπόμενη παραλλαγή (variant).
5. Καταγράφει την τιμή, το flag key και τη λεπτομερή απόφαση υπό εξαγόμενα κλειδιά Symbol
   στο `context.items`: `FEATURE_FLAG_ITEM`, `FEATURE_FLAG_KEY_ITEM`, και
   `FEATURE_FLAG_DECISION_ITEM`.
6. **Ενεργό** → εκτελεί τον handler. **Ανενεργό** → επιστρέφει `fallback(context)` εάν
   έχει οριστεί, διαφορετικά εγείρει `FeatureDisabledError`.

---

## Ρύθμιση παραμέτρων <a id="configuration"></a>

### Επιλογές <a id="options"></a>

Επιλογές ανά handler μέσω `@UsePipeline(featureFlag(options))` ή `@UsePipeline([FeatureFlagBehavior, options])`:

| Επιλογή | Τύπος | Προεπιλογή | Περιγραφή |
|---|---|---|---|
| `flag` | `string` | — | Boolean flag key για πύλη ελέγχου. Παραλείψτε το για no-op. |
| `defaultValue` | `boolean` | `false` | Τιμή που χρησιμοποιείται όταν η αξιολόγηση αποτυγχάνει / το κλειδί είναι άγνωστο. |
| `fallback` | `(ctx) => unknown \| Promise<unknown>` | — | Επιστρέφεται όταν είναι απενεργοποιημένο, αντί έγερσης εξαίρεσης. |
| `context` | `(ctx) => EvaluationContext` | — | Επιπλέον targeting context για αυτόν τον handler. |
| `targetingKeyFactory` | `(ctx) => string \| undefined` | — | Σταθερή ταυτότητα rollout· παρακάμπτει τον resolver του module. |
| `allowedVariants` | `readonly string[]` | — | Απαίτηση τιμής true και επιτρεπόμενης παραλλαγής του provider. |
| `errorPolicy` | `use-default` \| `throw` | `use-default` | Χρήση της προεπιλεγμένης τιμής ή έγερση `FeatureFlagEvaluationError` σε σφάλματα provider. |

### Προεπιλογές σε επίπεδο module <a id="module-wide-defaults"></a>

Ορίστε προεπιλογές μία φορά· οι επιλογές ανά handler συγχωνεύονται επιφανειακά από πάνω (υπερισχύει ο handler):

```typescript
FeatureFlagsModule.forRoot({
  provider,
  defaults: { defaultValue: false },
});
```

### Targeting Context <a id="targeting-context"></a>

Κάθε αξιολόγηση λαμβάνει ένα context, συγχωνευμένο με κανόνα **το μεταγενέστερο υπερισχύει (later-wins)**:

```
base(request) → module `context` → handler `context(request)` → targeting-key factory
```

Το βασικό context παράγεται από το pipeline request:

| Κλειδί | Τιμή |
|---|---|
| `pipeline.correlation_id` | `context.correlationId` (metadata tracing, όχι ταυτότητα rollout) |
| `pipeline.tenant_id` | `context.tenantId`, όταν υπάρχει |
| `pipeline.request.kind` | `command` \| `query` \| `event` |
| `pipeline.request.name` | `NewCheckoutCommand` |
| `pipeline.handler.name` | `NewCheckoutHandler` |

```typescript
@UsePipeline([
  FeatureFlagBehavior,
  {
    flag: 'new-checkout',
    context: (ctx) => ({
      targetingKey: (ctx.request as NewCheckoutCommand).userId,
      plan: 'pro',
    }),
  },
])
```

### Ομαλή υποχώρηση (Graceful Fallback) <a id="graceful-fallback"></a>

Επιστρέψτε μια ασφαλή τιμή αντί για έγερση εξαίρεσης όταν ένα χαρακτηριστικό είναι απενεργοποιημένο:

```typescript
@QueryHandler(GetRecommendationsQuery)
@UsePipeline([
  FeatureFlagBehavior,
  { flag: 'ml-recommendations', fallback: () => [] },
])
export class GetRecommendationsHandler
  implements IQueryHandler<GetRecommendationsQuery>
{
  async execute(): Promise<Item[]> {
    return this.ml.recommend(); // μόνο όταν η σημαία είναι ενεργή
  }
}
```

### Αντιστοίχιση του σφάλματος σε HTTP <a id="mapping-the-error-to-http"></a>

Το `FeatureDisabledError` είναι ανεξάρτητο από transport. Για HTTP, δηλώστε το ενσωματωμένο
`FeatureDisabledFilter`. Το Nest κάνει inject το `HttpAdapterHost` του, και το φίλτρο απαντά
μέσω αυτού του adapter, επομένως λειτουργεί με Express και Fastify, καθώς και για σφάλμα που εγείρεται σε
middleware:

```typescript
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { FeatureDisabledFilter } from '@nestjs-pipeline/feature-flags';

@Module({
  providers: [{ provide: APP_FILTER, useClass: FeatureDisabledFilter }],
})
export class AppModule {}
```

Στο `main.ts`, περάστε τον host:
`app.useGlobalFilters(new FeatureDisabledFilter(app.get(HttpAdapterHost)))`.

Απαντά με `403 Forbidden` και αναφέρει τη σημαία:

```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Feature \"beta-export\" is disabled for ExportDataQuery",
  "flag": "beta-export"
}
```

Για να αποκρύψετε χαρακτηριστικά υπό πύλη, απαντήστε με `404`. Το σώμα είναι τότε ένα απλό Not Found
που δεν κατονομάζει ούτε τη σημαία ούτε το αίτημα:

```typescript
{
  provide: APP_FILTER,
  inject: [HttpAdapterHost],
  useFactory: (adapterHost: HttpAdapterHost) =>
    new FeatureDisabledFilter(adapterHost, { status: 404 }),
}
```

---

## Προσαρμοσμένος Logger <a id="custom-logger"></a>

Το `FeatureFlagBehavior` δέχεται ένα προσαρμοσμένο Nest `LoggerService` μέσω του token
`LOGGING_BEHAVIOR_LOGGER` (χρήσιμο με το `nestjs-pino`). Εκπέμπει μόνο μηνύματα
`debug`, επομένως συνδέστε το με τον ίδιο τρόπο όπως τα υπόλοιπα pipeline behaviors:

```typescript
import { Logger } from 'nestjs-pino';
import { LOGGING_BEHAVIOR_LOGGER } from '@nestjs-pipeline/core';

@Module({
  providers: [{ provide: LOGGING_BEHAVIOR_LOGGER, useExisting: Logger }],
})
export class AppModule {}
```

---

## Σταθερή ταυτότητα rollout <a id="stable-rollout-identity"></a>

Μην χρησιμοποιείτε το correlation ID ενός αιτήματος ως `targetingKey` για ποσοστιαία rollouts (percentage rollouts). Τα correlation IDs συνήθως αλλάζουν σε κάθε αίτημα, επομένως ο ίδιος χρήστης μπορεί να μετακινείται μεταξύ ομάδων (cohorts).

Ρυθμίστε μια σταθερή ταυτότητα εφαρμογής αντ' αυτού:

```ts
FeatureFlagsModule.forRoot({
  provider,
  targetingKeyFactory: (ctx) =>
    ctx.items.get('accountId') as string | undefined,
});
```

Ένας handler μπορεί να παρακάμψει τον resolver του module με το `targetingKeyFactory`. Εάν κανένα factory δεν παράγει τιμή, ένα `targetingKey` που έχει ήδη παρασχεθεί μέσω του context αξιολόγησης του module/handler διατηρείται. Το πακέτο σκόπιμα δεν κατασκευάζει αυθαίρετη ταυτότητα χρήστη.

### Tenant targeting <a id="tenant-targeting"></a>

Όταν το pipeline εκτελείται μέσα σε tenant (δείτε `@nestjs-pipeline/tenant`), το βασικό
context φέρει ήδη το `pipeline.tenant_id`, επομένως ένας κανόνας provider μπορεί να στοχεύσει
tenants χωρίς πρόσθετο κώδικα. Για να κάνετε rollout ανά tenant αντί ανά χρήστη, ορίστε το
tenant ως targeting key:

```ts
FeatureFlagsModule.forRoot({
  provider,
  targetingKeyFactory: (ctx) => ctx.tenantId,
});
```

## Πύλες με επίγνωση παραλλαγών (Variant-aware gates) <a id="variant-aware-gates"></a>

Η boolean αξιολόγηση μπορεί να περιοριστεί σε συγκεκριμένες παραλλαγές του provider:

```ts
@UsePipeline([
  FeatureFlagBehavior,
  {
    flag: 'checkout-v2',
    allowedVariants: ['treatment'],
  },
])
```

Ο handler εκτελείται μόνο όταν η σημαία είναι `true` και η παραλλαγή που αναφέρει ο provider είναι επιτρεπόμενη.

## Request-local metadata απόφασης <a id="request-local-decision-metadata"></a>

Το behavior αξιολογεί μια σημαία μία φορά και αποθηκεύει το αποτέλεσμα στο `PipelineContext.items`:

```ts
import { getPipelineItem } from '@nestjs-pipeline/core';
import { FEATURE_FLAG_DECISION_ITEM_TOKEN } from '@nestjs-pipeline/feature-flags';

const decision = getPipelineItem(context, FEATURE_FLAG_DECISION_ITEM_TOKEN);
// FeatureFlagDecision | undefined
```

Το `FeatureFlagDecision` περιλαμβάνει το flag key, την ανεπεξέργαστη τιμή, την τελική απόφαση ενεργοποίησης, την παραλλαγή, την αιτία επίλυσης, πληροφορίες σφάλματος provider, και το targeting key. Behaviors ελέγχου (audit), τηλεμετρίας ή προσαρμοσμένα μπορούν να το καταναλώσουν χωρίς να αξιολογήσουν τη σημαία δεύτερη φορά.

Τα `FEATURE_FLAG_ITEM` και `FEATURE_FLAG_KEY_ITEM` εκθέτουν επίσης την απόφαση ενεργοποίησης και το flag key.

Το `buildFeatureFlagAttributes(context)` μετατρέπει την απόφαση σε attributes ονοματισμένα σύμφωνα με τις συμβάσεις feature-flag του OpenTelemetry — `feature_flag.key`, `feature_flag.enabled`, και `feature_flag.variant`, `feature_flag.reason` και `feature_flag.error_code` όταν αναφέρονται. Χρησιμοποιήστε το για attributes σε spans μέσω του `AttributesBehavior` του [`@nestjs-pipeline/opentelemetry`](/nestjs-pipeline/packages/nestjs-pipeline/opentelemetry/#attributes-from-other-behaviors), για audit `metadata`, ή σε μια γραμμή log· δεν απαιτεί πακέτο τηλεμετρίας. Το targeting key και το μήνυμα σφάλματος δεν περιλαμβάνονται ποτέ.

## Πολιτική αποτυχίας provider <a id="provider-failure-policy"></a>

Η προεπιλογή `errorPolicy: 'use-default'` ακολουθεί το μοντέλο διαθεσιμότητας προεπιλεγμένης τιμής του OpenFeature. Για σημαίες που δεν πρέπει να καταφεύγουν σιωπηρά σε fallback, χρησιμοποιήστε:

```ts
{
  flag: 'high-risk-flow',
  defaultValue: false,
  errorPolicy: 'throw',
}
```

Σφάλματα provider εμφανίζονται ως `FeatureFlagEvaluationError`, το οποίο φέρει τα `flag`,
`requestName`, `errorCode` και `providerMessage`. Δεν αντιστοιχίζεται από το
`FeatureDisabledFilter`· αντιστοιχίστε το μόνοι σας, για παράδειγμα σε `503`:

```ts
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { FeatureFlagEvaluationError } from '@nestjs-pipeline/feature-flags';

@Catch(FeatureFlagEvaluationError)
export class FlagEvaluationFilter implements ExceptionFilter {
  catch(error: FeatureFlagEvaluationError, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse()
      .status(HttpStatus.SERVICE_UNAVAILABLE)
      .json({ statusCode: 503, flag: error.flag, errorCode: error.errorCode });
  }
}
```

Εκτός HTTP, συλλάβετε και τα δύο σφάλματα στο σημείο αποστολής του αιτήματος:

```ts
try {
  return await commandBus.execute(new NewCheckoutCommand(userId));
} catch (error) {
  if (error instanceof FeatureDisabledError) return legacyCheckout(userId);
  throw error;
}
```

---

## Behavior Contract & Bootstrap Diagnostics <a id="behavior-contract--bootstrap-diagnostics"></a>

Το `FeatureFlagBehavior` υλοποιεί διαγνωστικά συμβολαίου συμπεριφοράς του `@nestjs-pipeline/core`:

### Invariants επικύρωσης <a id="validation-invariants"></a>

- **Απόρριψη κενού flag**: ένα `flag` που δεν είναι μη κενό string συνιστά διαγνωστικό σφάλμα απ' όπου κι αν προέρχεται.
- **Το intent του handler απαιτεί flag**: όταν το `FeatureFlagBehavior` δηλώνεται σε έναν handler (`@UsePipeline`), οι ισχύουσες επιλογές (επιλογές handler πάνω από τις προεπιλογές του module) πρέπει να ονομάζουν ένα `flag`. Σε κατάσταση `strict`, ένα απών flag αποτυγχάνει κατά την εκκίνηση με `PipelineConfigurationError`.
- **Καθολική δήλωση μπορεί να το παραλείψει**: όταν δηλώνεται μόνο υπό τα `globalBehaviors` χωρίς flag, το behavior λειτουργεί ως pass-through.
- **Επίλυση module defaults**: Καθολικές προεπιλογές εφαρμογής που παρέχονται στο `FeatureFlagsModule.forRoot({ defaults: { ... } })` συγχωνεύονται κάτω από τις επιλογές του handler μέσω του `FeatureFlagBehavior.resolveEffectiveOptions` και αξιολογούνται κατά τα διαγνωστικά του bootstrap.

---

## Αναφορά API <a id="api-reference"></a>

| Export | Τύπος | Περιγραφή |
|---|---|---|
| `FeatureFlagBehavior` | Class | Pipeline behavior — θέτει πύλη ελέγχου σε έναν handler πίσω από μια boolean σημαία |
| `featureFlag` | Function | Type-safe intent builder που επιστρέφει `[FeatureFlagBehavior, options]` με υποχρεωτικό `flag` |
| `FeatureFlagIntentOptions` | Type | Επιλογές για το `featureFlag(...)` που απαιτούν `flag: string` |
| `FeatureFlagsModule` | Class | `forRoot(options)` — δηλώνει τον provider/client και τις προεπιλογές (δεν υπάρχει `forRootAsync`) |
| `FeatureFlagBehaviorOptions` | Interface | Επιλογές ανά handler που αναφέρονται παραπάνω, συμπεριλαμβανομένων σταθερού targeting, παραλλαγών και πολιτικής σφαλμάτων |
| `FeatureFlagsModuleOptions` | Interface | `client`, `provider`, `domain`, `context`, `waitForReady`, `defaults`, και `targetingKeyFactory` |
| `FeatureDisabledError` | Class | Εγείρεται όταν μια σημαία υπό πύλη είναι ανενεργή και δεν έχει οριστεί `fallback` |
| `FeatureDisabledFilter` | Class | Exception filter: `FeatureDisabledError` → `403` με τη σημαία, ή ένα απλό `404` με `{ status: 404 }` |
| `FeatureDisabledFilterOptions` | Interface | `status`: `403` (προεπιλογή) ή `404` |
| `baseEvaluationContext` | Function | Παράγει το βασικό targeting context από ένα pipeline request |
| `buildEvaluationContext` | Function | Συγχωνεύει base + module + handler targeting context |
| `FeatureFlagEvaluationError` | Class | Αποτυχία αξιολόγησης provider υπό `errorPolicy: 'throw'` |
| `FeatureFlagDecision` | Interface | Λεπτομερής καταγεγραμμένη απόφαση πύλης ελέγχου |
| `EvaluationContextFactory` / `TargetingKeyFactory` / `FeatureFallbackFactory` / `FeatureFlagErrorPolicy` | Type | Τύποι συναρτήσεων επιλογών και πολιτικών |
| `FEATURE_FLAG_DECISION_ITEM` | Symbol | Κλειδί λεπτομερούς απόφασης στο `context.items` |
| `FEATURE_FLAGS_TARGETING_KEY_FACTORY` | Token | Resolver targeting σε επίπεδο module |
| `FEATURE_FLAGS_CLIENT` | Token | OpenFeature `Client` provider |
| `FEATURE_FLAGS_DEFAULT_OPTIONS` | Token | Καθολικές προεπιλεγμένες επιλογές behavior |
| `FEATURE_FLAGS_DEFAULT_CONTEXT` | Token | Καθολικό προεπιλεγμένο context αξιολόγησης |
| `FEATURE_FLAG_ITEM` / `FEATURE_FLAG_KEY_ITEM` | Symbol | Εξαγόμενα μοναδικά κλειδιά Symbol στο `context.items` για την επιλυμένη τιμή / κλειδί |
| `FEATURE_FLAG_ITEM_TOKEN`, `FEATURE_FLAG_KEY_ITEM_TOKEN`, `FEATURE_FLAG_DECISION_ITEM_TOKEN` | `PipelineItemToken` | Typed tokens πάνω στα ίδια κλειδιά, για `getPipelineItem(context, FEATURE_FLAG_DECISION_ITEM_TOKEN)` χωρίς type casts |
| `buildFeatureFlagAttributes` | Function | Η καταγεγραμμένη απόφαση ως attributes (spans, audit metadata, logs)· `{}` όταν το behavior δεν εκτελέστηκε |

---

## Άδεια χρήσης <a id="license"></a>

Διπλή άδεια υπό την **AGPLv3** και **Εμπορική Άδεια (Commercial License)**. Δείτε τα [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) και [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt) στη ρίζα του repository για λεπτομέρειες.

Επικοινωνία: **aristotelis@ik.me**
