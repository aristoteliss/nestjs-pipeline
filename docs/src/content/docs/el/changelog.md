---
title: "Αρχείο αλλαγών"
editUrl: false
---

## 0.4.3

Τα 14 πακέτα `@nestjs-pipeline/*` κυκλοφορούν στην έκδοση 0.4.3, μια έκδοση μόνο για README: ο κώδικας, το API και οι απαιτήσεις είναι αυτά της έκδοσης 0.4.2.

### Αλλαγές

- Κάθε README ξεκινά με μια σημείωση: από την έκδοση 0.5.0 το πακέτο συνεχίζει ως ο `@cqrs-ddd` διάδοχός του (`@nestjs-pipeline/core` ως `@cqrs-ddd/pipeline`, `@nestjs-pipeline/<name>` ως `@cqrs-ddd/pipeline-<name>`), που αναπτύσσεται στο https://github.com/aristoteliss/ddd-cqrs και τεκμηριώνεται στο https://aristoteliss.github.io/ddd-cqrs/. Οι εκδόσεις 0.1 έως 0.4 παραμένουν στο npm, και η 0.4.x λαμβάνει μόνο διορθώσεις.
- Τα πέντε πακέτα `@cqrs-ddd/*` αυτού του repository παραμένουν στην έκδοση 0.4.2: από την έκδοση 0.5.0 δημοσιεύονται από το ddd-cqrs.

## 0.4.2

Κάθε πακέτο κυκλοφορεί στην έκδοση 0.4.2. Το API και οι απαιτήσεις είναι αυτά της έκδοσης 0.4.1.

### Αλλαγές

- Το `homepage` κάθε πακέτου, ο σύνδεσμος Homepage στο npm, είναι ο οδηγός του στον ιστότοπο τεκμηρίωσης, https://aristoteliss.github.io/nestjs-pipeline/.

## 0.4.1

Κάθε πακέτο κυκλοφορεί στην έκδοση 0.4.1. Το API και οι απαιτήσεις είναι αυτά της έκδοσης 0.4.0, με πέντε επιπλέον εξαγόμενους τύπους.

### Προσθήκες

- `@cqrs-ddd/mikro-orm`: εξάγει το `VersionedAggregate`, τον τύπο entity που δέχεται το `optimisticDelete`, και το `Timestamp`, τις τιμές που διαβάζει το `UnixTimestampType`.
- `@nestjs-pipeline/core`: εξάγει το `ErrorClass`, τον τύπο κλειδιού του `LoggingBehaviorOptions.mapLogLevel`.
- `@nestjs-pipeline/resilience`: εξάγει το `AnyPolicy`, την πολιτική που επιστρέφει το `buildResiliencePolicy`.
- `@nestjs-pipeline/zod`: εξάγει το `AbstractConstructor`, τον τύπο κλάσης `Base` των `createCommand`, `createQuery` και `createZodRequest`.

### Αλλαγές

- Το εγχειρίδιο είναι ο ιστότοπος τεκμηρίωσης, https://aristoteliss.github.io/nestjs-pipeline/· το README κάθε πακέτου είναι σύντομο και συνδέεται με τον οδηγό του και το API reference.
- Οι σύνδεσμοι JSDoc των πακέτων επιλύονται: το API reference του ιστότοπου τεκμηρίωσης και τα declarations που διαθέτει κάθε πακέτο δεν εμφανίζουν πλέον ανεπίλυτο σύνδεσμο `import('…')`.

## 0.4.0

Κάθε πακέτο κυκλοφορεί στην έκδοση 0.4.0, ως ES module. Το API και οι απαιτήσεις είναι αυτά της έκδοσης 0.3.0.

### Breaking Changes

- Κάθε πακέτο δημοσιεύεται ως ES module (`"type": "module"`) με χάρτη `exports`. Μια εφαρμογή ES module το κάνει import· μια εφαρμογή CommonJS το φορτώνει με `require()` (Node.js 22.12 ή νεότερο, το ελάχιστο όριο των πακέτων). Μια εφαρμογή CommonJS που κάνει compile με TypeScript `module: node16` μεταβαίνει σε `nodenext`, `node20` ή `bundler`.
- Μόνο τα entry points στο `exports` επιλύονται: το root κάθε πακέτου, τα `/domain`, `/application`, `/persistence` και `/http` του `@cqrs-ddd/core`, και το `/package.json`. Τα μονοπάτια εντός του `dist` δεν επιλύονται πλέον.
- Τα πακέτα που έχουν peer dependency στο `@nestjs-pipeline/core` απαιτούν `^0.4.0` αυτού, και το `@cqrs-ddd/mikro-orm` απαιτεί `@cqrs-ddd/core` `^0.4.0`.

### Αλλαγές

- Το `@nestjs-pipeline/cache` φορτώνει τον προαιρετικό του adapter store `@keyv/*` μέσω του `createRequire`, σύγχρονα, όπως και πριν.
- Ο έλεγχος έκδοσης (release check) φορτώνει κάθε πακέτο από έναν καταναλωτή CommonJS και έναν ES module, εκτελεί type-check με TypeScript `Bundler` resolution, και φορτώνει κάθε entry point στο Bun μέσω `import` και `require()`.

## 0.3.0

Κάθε πακέτο κυκλοφορεί στην έκδοση 0.3.0, για το NestJS 12.

### Απαιτήσεις για κάθε πακέτο

- Node.js 22.12 ή νεότερο (`engines`): μια εφαρμογή CommonJS φορτώνει τα ES modules που δημοσιεύει το NestJS 12 μέσω του `require()` της Node για ES modules. Το `@cqrs-ddd/mikro-orm` απαιτεί 22.17, όπως και το `@mikro-orm/core` 7 peer dependency του.
- NestJS `^12.1.0` (`@nestjs/common`, `@nestjs/core`, `@nestjs/cqrs`) για κάθε πακέτο `@nestjs-pipeline/*` που έχει peer dependency στο NestJS. Τα NestJS 11 και 12.0.x δεν υποστηρίζονται: το 12.0.x παραλείπει τους δείκτες `@Optional()` μιας βασικής κλάσης σε μια υποκλάση που δεν δηλώνει δικό της constructor.
- Τα πακέτα που έχουν peer dependency στο `@nestjs-pipeline/core` απαιτούν `^0.3.0` αυτού.
- Μια εφαρμογή CommonJS που κάνει compile με TypeScript `module: node16` μεταβαίνει σε `nodenext`, `node20` ή `bundler`· το `node16` απορρίπτει imports από ES modules (TS1479).

### Breaking Changes

- `@nestjs-pipeline/zod`: Το `ZodPipe` αφαιρέθηκε. Δηλώστε το schema με `{ schema }` στα `@Body`, `@Param` ή `@Query`, και καταχωρίστε το `StandardSchemaValidationPipe` του Nest μία φορά με `exceptionFactory: zodBadRequest`.
- `@nestjs-pipeline/resilience`: απαιτεί `cockatiel` `^4.0.0`, των οποίων οι πολιτικές αναφέρουν σφάλματα ως `unknown`.

### Προσθήκες

- `@nestjs-pipeline/zod`: `zodBadRequest`, το exception factory για το `StandardSchemaValidationPipe` του Nest· απαντά με 400 με το body που δίνει το `ZodValidationFilter`.
- `@cqrs-ddd/core`: `IAggregateRoot`, το συμβόλαιο event-buffering, αντίστοιχο με αυτό του NestJS 12, το οποίο ικανοποιούν τόσο τα aggregates αυτού του πακέτου όσο και του NestJS. Τα `publish`, `publishAll` και `commit` του `AggregateRoot` δέχονται προαιρετικό dispatcher context και επιστρέφουν το αποτέλεσμα του publisher· το `commit` παραδίδει ένα αντίγραφο των συμβάντων και εκκαθαρίζει το buffer μόλις επιστρέψει το `publishAll`. `IDomainEventPublisher.publishAll(events, dispatcherContext?)`.
- `@nestjs-pipeline/job-context`: Το `tenants` του `JobContextModule.forRoot` δέχεται επίσης συνάρτηση, η οποία καλείται μία φορά κατά την κατασκευή των providers της εφαρμογής, ώστε η λίστα να μπορεί να προέρχεται από configuration που διαβάζεται κατά την εκκίνηση.

### Αλλαγές

- `@cqrs-ddd/core`: Το `CommandBaseHandler` δέχεται οποιοδήποτε αποτέλεσμα `IAggregateRoot` και περνά το aggregate στο `publishAll` ως dispatcher context, όπως κάνει ο `EventPublisher` του NestJS.
- `@nestjs-pipeline/core`: Οι handlers εντοπίζονται μέσω του `DiscoveryService` του Nest και του κλειδιού metadata που καταγράφει κάθε δημόσιος decorator handler του `@nestjs/cqrs`, επειδή το `@nestjs/cqrs` 12 εξάγει μόνο το root του πακέτου του. Το bootstrap αποτυγχάνει όταν ένας decorator καταγράφει οτιδήποτε άλλο εκτός από ένα κλειδί.
- `@nestjs-pipeline/idempotency`: Το προεπιλεγμένο exception filter του NestJS 12 απαντά σε ένα απλό `Error` που φέρει `statusCode` με 500, επομένως καταχωρίστε το `IdempotencyConflictFilter` για να διατηρήσετε τις απαντήσεις 409 και 422.
- `@nestjs-pipeline/rate-limit`: δοκιμασμένο με rate-limiter-flexible 11, το οποίο πετά σφάλμα όταν δημιουργείται limiter χωρίς πεπερασμένα `points` ή `duration`.

### Διορθώσεις

- `@cqrs-ddd/core`: Το `CommandBaseHandler.execute()` περιμένει (awaits) αυτό που επιστρέφει το `publishAll()`, μετά την εκκαθάριση του buffer, ώστε ένας publisher που απορρίπτει (rejects) να απορρίπτει και το command. Η απόρριψη ήταν προηγουμένως unhandled, και η Node τερμάτιζε τη διεργασία.
- `@nestjs-pipeline/audit`, `/cache`, `/deadletter`, `/feature-flags`, `/idempotency`, `/rate-limit`, `/resilience` (behavior και `ResiliencePolicies`) και `LoggingBehavior` του core: με τον προεπιλεγμένο logger του Nest, κάθε εγγραφή εκτυπώνει το context της μία φορά· το όνομα της κλάσης εκτυπωνόταν ξανά ως ξεχωριστή εγγραφή. Ο fallback `Logger` δεν έχει δικό του context και delta χρονοσήμανσης.
- `@cqrs-ddd/mikro-orm`: Το `engines.node` είναι `>=22.17.0`, το ελάχιστο όριο του `@mikro-orm/core` 7 peer dependency του.

## 0.2.2

Μια έκδοση των `@nestjs-pipeline/zod`, `/casl`, `/feature-flags`, `/idempotency` και `/rate-limit`· τα υπόλοιπα διατηρούν τις εκδόσεις τους. Σε αντίθεση με την 0.2.1, απαιτείται αλλαγή κώδικα στο σημείο όπου καταχωρίζονται τα exception filters.

### Αλλαγές

- Τα exception filters `ZodValidationFilter`, `UnauthorizedActionFilter`, `FeatureDisabledFilter`, `IdempotencyConflictFilter` και `RateLimitExceededFilter` δέχονται το `HttpAdapterHost` του Nest ως πρώτο όρισμα του constructor τους και απαντούν μέσω του `httpAdapter.reply` (το `RateLimitExceededFilter` θέτει το `Retry-After` με `httpAdapter.setHeader`). Καταχωρίστε τα ως `{ provide: APP_FILTER, useClass: X }`, ή περάστε το `app.get(HttpAdapterHost)` στο `useGlobalFilters(new X(...))`. Οι επιλογές του `FeatureDisabledFilter` αποτελούν το δεύτερο όρισμά του.
- Τα πέντε πακέτα δηλώνουν το `@nestjs/core` `^11.0.0` ως peer dependency.

### Διορθώσεις

- Στο Fastify, ένα σφάλμα πακέτου που προέκυπτε σε middleware του Nest έφτανε στο φίλτρο του με την raw απόκριση της Node· το φίλτρο πετούσε `TypeError: response.status is not a function` και το αίτημα δεν λάμβανε απάντηση. Τα φίλτρα πλέον απαντούν κανονικά.

Μια patch έκδοση των παρακάτω δέκα πακέτων· τα υπόλοιπα παραμένουν στο 0.2.0. Κάθε αλλαγή είναι προσθήκη ή διόρθωση τεκμηρίωσης: καμία εξαγωγή, υπογραφή, behavior ή εύρος peer dependencies του 0.2.0 δεν αλλάζει, επομένως η αναβάθμιση δεν απαιτεί αλλαγές κώδικα.

### Προσθήκες

- `@cqrs-ddd/core`: Το `requireTenant(purpose, source?)` επιστρέφει το tenant για μια λειτουργία ευαίσθητη σε θέματα ασφαλείας, από το `source` ή τον καταχωρισμένο resolver, και πετά `MissingTenantContextError` όταν δεν υπάρχει κανένα. Το `requireTenantId(source, purpose)`, το ίδιο με αντεστραμμένα ορίσματα, είναι deprecated και το καλεί εσωτερικά.
- `@nestjs-pipeline/casl`: `abilityDigest(context?)`, το SHA-256 των ενεργών κανόνων (συνθήκες επιλυμένες έναντι του principal), για scopes κλειδιών cache και replay scopes idempotency· `requireAbilityDigest(context?)`, το οποίο πετά το νέο `MissingAbilityError` αντί να επιστρέφει `undefined`· `CaslAuthorizer.dependsOnEntity(action, subject)`, αν ένας κανόνας υπό συνθήκη αποφασίζει βάσει γνωρισμάτων entity. Προσθέτει το `@cqrs-ddd/safe-stringify` ως εξάρτηση.
- `@nestjs-pipeline/opentelemetry`: `AttributesBehavior` με `AttributesBehaviorOptions` (`factories`). Εκτελεί attribute factories μόλις ολοκληρωθεί η υπόλοιπη αλυσίδα, επιτυχώς ή όχι, και προσθέτει το αποτέλεσμα στο attribute bag που διαβάζουν τα `TraceBehavior` και `MetricsBehavior`. Ένα αποτυχημένο factory δεν συνεισφέρει τίποτα· τα υπόλοιπα συνεχίζουν να εφαρμόζονται.
- Attribute builders, καθένας στο `src/helpers/build-attributes.ts`, που επιστρέφουν `{}` όταν το behavior τους δεν εκτελέστηκε και ποτέ κλειδί cache, idempotency ή rate-limit:
  - `@nestjs-pipeline/cache`: `buildCacheAttributes` → `cache.hit`.
  - `@nestjs-pipeline/idempotency`: `buildIdempotencyAttributes` → `idempotency.replayed`, `idempotency.ownership_lost`.
  - `@nestjs-pipeline/rate-limit`: `buildRateLimitAttributes` → `rate_limit.remaining_points`.
  - `@nestjs-pipeline/feature-flags`: `buildFeatureFlagAttributes` → `feature_flag.key`, `feature_flag.enabled`, `feature_flag.variant`, `feature_flag.reason`, `feature_flag.error_code`.
  - `@nestjs-pipeline/deadletter`: `buildDeadLetterAttributes` → `dead_letter.captured`.

### Τεκμηρίωση

- `@nestjs-pipeline/zod`: τα παραδείγματα χρησιμοποιούν `z.email()` και `z.uuid()` αντί των deprecated `z.string().email()` και `z.string().uuid()`.
- `@nestjs-pipeline/audit`: το παράδειγμα actor διαβάζει το `getSessionPrincipal()`.
- `@nestjs-pipeline/feature-flags`: το παράδειγμα module χρησιμοποιεί `TypedInMemoryProvider` (`@openfeature/server-sdk` 1.23+· `InMemoryProvider` πριν από αυτό).

## 0.2.0

Κάθε πακέτο κυκλοφορεί στην έκδοση 0.2.0. Πέντε υπήρχαν στο npm προηγουμένως· δεκατρία κυκλοφορούν για πρώτη φορά.

### Απαιτήσεις για κάθε πακέτο

- Node.js 22 ή νεότερο (`engines`).
- NestJS 11 για κάθε πακέτο `@nestjs-pipeline/*` που έχει peer dependency στο NestJS (το `@nestjs-pipeline/tenant` δεν έχει peer dependencies). Το NestJS 10 δεν υποστηρίζεται πλέον.
- Τα πακέτα που έχουν peer dependency στο `@nestjs-pipeline/core` απαιτούν `^0.2.0` αυτού αντί για οποιαδήποτε έκδοση.

### Αναβάθμιση από 0.1.x

Η ενότητα [Αναβάθμιση από 0.1.x](/nestjs-pipeline/upgrading/from-0-1/) παρουσιάζει τις συνήθεις αλλαγές με κώδικα πριν και μετά.

#### `@nestjs-pipeline/core` (από 0.1.18)

Breaking Changes:

- Peer dependencies είναι τα `@nestjs/common`, `@nestjs/core` και `@nestjs/cqrs` `^11.0.0`.
- Αφαιρέθηκαν από το δημόσιο API: `PipelineBootstrapService`, `PIPELINE_MODULE_OPTIONS`, `PIPELINE_OPTIONS_REGISTRY`, `clearPipelineOptionsRegistry`, `SET_RESPONSE` και `SET_ORIGINAL_CORRELATION_ID`. Ρυθμίστε το pipeline μέσω των `PipelineModule.forRoot` ή `forRootAsync`· ένα behavior δεν μπορεί πλέον να ορίσει το response ή το αρχικό correlation ID ενός context.
- Το `context.correlationId` είναι μόνο για ανάγνωση (read-only), και το `originalCorrelationId` αφαιρέθηκε: ένα behavior δεν μπορεί πλέον να αντικαταστήσει το correlation ID ενός εκτελούμενου pipeline. Ορίστε το στο σημείο εισόδου της εργασίας (`HttpCorrelationMiddleware`, `@WithCorrelation`, `runWithCorrelationId`).
- Οι επιλογές module `correlationIdFactory` και `correlationIdRunner` αφαιρέθηκαν. Ένα pipeline λαμβάνει το tenant και το correlation id του από την επιλογή module `sources` κατά την εκκίνησή του (`tenantSource` του `@nestjs-pipeline/tenant`, `correlationSource` του `@nestjs-pipeline/correlation`), ή από το pipeline στο οποίο είναι εμφωλευμένο, παράγει ένα `uuidv7()` correlation id όταν δεν υπάρχει κανένα, και εκτελεί τα behaviors του εντός των δύο αυτών τιμών. Ορίστε τα στο σημείο εισόδου της εργασίας στην εφαρμογή: `runWithTenant` του `@nestjs-pipeline/tenant`, `HttpCorrelationMiddleware` ή `runWithCorrelationId` του `@nestjs-pipeline/correlation`.
- Η νέα επιλογή `diagnostics` έχει προεπιλογή `'strict'`: ένας handler του οποίου το pipeline δεν ικανοποιεί το `PIPELINE_BEHAVIOR_CONTRACT` ενός behavior οδηγεί το bootstrap σε `PipelineConfigurationError`. Περάστε `'warn'` ή `'off'` για να το χαλαρώσετε.
- Το `loggerProvider` έχει τύπο `PipelineLoggerProvider` αντί για οποιοδήποτε `Provider`: το `provide` του πρέπει να είναι `LOGGING_BEHAVIOR_LOGGER`.
- Τα `@cqrs-ddd/uuidv7`, `@cqrs-ddd/untyped` και `@cqrs-ddd/safe-stringify` είναι νέες εξαρτήσεις runtime.
- Το `getBehaviorId(cls)` επιστρέφει την ίδια την κλάση όταν δεν έχει οριστεί `PIPELINE_BEHAVIOR_ID`, αντί για `cls.name`, ώστε δύο behaviors με το ίδιο όνομα κλάσης να μην συγκρούονται.
- Το `PIPELINE_BEHAVIOR_ID` είναι `Symbol.for('@nestjs-pipeline/core:PIPELINE_BEHAVIOR_ID')` αντί για τοπικό `Symbol`, ώστε να ταιριάζει σε διπλότυπα αντίγραφα του core.
- Όταν πολλές εφαρμογές NestJS στην ίδια διεργασία τυλίγουν την ίδια κλάση handler, η κλήση της σε ένα instance που δεν δημιουργήθηκε από καμία εξ αυτών πετά εξαίρεση, αντί να εκτελείται χωρίς κανένα pipeline.
- Το `LoggingBehavior` αποκρύπτει (masks) ευαίσθητα πεδία στα καταγεγραμμένα payloads από προεπιλογή (`redactSensitiveKeys: true`, χρησιμοποιώντας το `DEFAULT_REDACT_KEYS`). Η αντιστοίχιση κλειδιών αγνοεί πεζά/κεφαλαία, `_` και `-`, επομένως το `refreshToken` αποκρύπτει επίσης το `refresh_token`. Το `excludeKeys` εφαρμόζεται επίσης στις ιδιότητες των κλωνοποιημένων αντικειμένων `Error` και στα κλειδιά `Map`.

Προσθήκες:

- `PipelineModule.forRootAsync` (`PipelineModuleAsyncOptions`, `PipelineOptionsFactory`, `PipelineLoggerProvider`), `PipelineModuleFeatureOptions`, η επιλογή `diagnostics`, ο helper πρόθεσης `logging()` και το `@SkipPipeline`.
- Στοιχεία pipeline (pipeline items): `createPipelineItem`, `getPipelineItem`, `setPipelineItem`, `hasPipelineItem`, `requirePipelineItem`, `MissingPipelineItemError`.
- Συμβόλαια behaviors και διαγνωστικά bootstrap: `PIPELINE_BEHAVIOR_CONTRACT`, `PipelineConfigurationError` και οι τύποι τους.
- `context.tenantId`, το tenant της εκτέλεσης· είναι write-once, επομένως η ανάθεση διαφορετικού tenant πετά σφάλμα. Το `SET_TENANT_ID` το ορίζει σε έναν προσαρμοσμένο runner.
- Επιλογές του `LoggingBehavior`: `redactKeys` και `redactSensitiveKeys`.
- `toPostgresJson`.
- `tenantSegments` και `TenantPartitionOptions`, το τμήμα tenant για τα factories κλειδιών cache, idempotency και rate-limit, καθώς και το `MissingPartitionError`, η βάση των σφαλμάτων partition τους. Το factory κλειδιών cache δέχεται πλέον και το `includeTenant`.
- Η επιλογή module `sources` με τα `ContextSource` και `ContextSources`: από όπου τα pipelines λαμβάνουν το tenant και correlation id τους. Το bootstrap προειδοποιεί όταν παραλείπεται· περάστε `sources: {}` για σκόπιμη εκτέλεση χωρίς sources.

Αφαιρέθηκαν από το δημόσιο API: `uuidv7`, `isUuidV7` και `untyped`. Εισαγάγετέ τα από τα `@cqrs-ddd/uuidv7` και `@cqrs-ddd/untyped`. Οι serializers, τους οποίους η 0.1.18 δεν εξήγαγε, είναι δημόσιοι στο `@cqrs-ddd/safe-stringify`.

#### `@nestjs-pipeline/correlation` (από 0.1.8)

Breaking Changes:

- Peer dependency: `@nestjs/common` `^11.0.0` (ήταν `^10.0.0 || ^11.0.0`). Εξακολουθεί να μην εξαρτάται από κανένα πακέτο pipeline· τα `@cqrs-ddd/uuidv7` και `@cqrs-ddd/untyped` είναι νέες εξαρτήσεις.
- Τα `setCorrelationFallback` και `uuidv7` δεν εξάγονται πλέον. Εισαγάγετε το `uuidv7` από το `@cqrs-ddd/uuidv7`, το οποίο έχει το ίδιο API και αποτέλεσμα.
- Το `correlationStore` αντικαθίσταται από το `correlationSource`. Περάστε το στο `PipelineModule.forRoot({ sources: { correlationId: correlationSource } })` ώστε το pipeline να λαμβάνει το id και το `getCorrelationId()` σε έναν handler να επιστρέφει το id του pipeline. Τα `runWithCorrelationId`, `getCorrelationId`, `correlationHeaders` και `@WithCorrelation` διατηρούν το API τους.
- Το `HttpCorrelationMiddleware` ορίζει το correlation header στην απόκριση, μετατρέπει σε πεζά το ρυθμισμένο όνομα header και πετά σφάλμα κατά την κατασκευή αν δεν είναι έγκυρο. Νέες επιλογές: `acceptIncoming`, `trimIncoming`, `maxLength` και `validateIncoming`.
- Το `addCorrelationId` πετά `TypeError` για οποιαδήποτε τιμή δεν είναι απλό αντικείμενο (περιλαμβάνονται instances κλάσεων), όχι μόνο για πίνακες.
- Ένα εισερχόμενο correlation ID μεγαλύτερο από 128 χαρακτήρες, ή που δεν ταιριάζει με το `DEFAULT_CORRELATION_ID_PATTERN`, απορρίπτεται και αντικαθίσταται από τοπικά παραγόμενο ID.

Προσθήκες: `correlationSource`, `DEFAULT_CORRELATION_HEADER`, `DEFAULT_CORRELATION_ID_MAX_LENGTH`, `DEFAULT_CORRELATION_ID_PATTERN`.

#### `@nestjs-pipeline/opentelemetry` (από 0.1.8)

Breaking Changes: `@nestjs/common` `^11.0.0`· `@nestjs-pipeline/core` `^0.2.0`.

- Το `TraceBehavior` δεν υλοποιεί πλέον το `onModuleInit`, δεν κάνει inject logger και δεν ελέγχει πλέον αν έχει καταχωριστεί SDK.
- Το `TraceBehaviorOptions` εξάγεται μόνο ως τύπος.
- Ένα tracer, meter ή callback εμπλουτισμού που πετά σφάλμα δεν αντικαθιστά ποτέ το αποτέλεσμα ή το σφάλμα του handler, και δεν εκτελεί ποτέ τον handler δύο φορές.

Προσθήκες: τα spans φέρουν `pipeline.tenant_id`, `pipeline.outcome` και `error.type`· το `MetricsBehavior` καταγράφει έναν μετρητή `pipeline.handler.active` και προσθέτει ετικέτες στα όργανα μέτρησης με `outcome` και `pipeline.outcome`. Επίσης προστέθηκαν: `MetricsBehavior` και `metrics()`, `trace()`, `buildTraceAttributes`, `buildMetricAttributes`, `addPipelineTelemetryAttributes`, `getPipelineTelemetryAttributes`, `PIPELINE_OTEL_ATTRIBUTES`, `PIPELINE_TELEMETRY_ATTRIBUTES` και οι τύποι τους.

#### `@nestjs-pipeline/zod` (από 0.1.6)

Breaking Changes:

- Peer dependencies: `zod` `^4.3.0` (ήταν `^4.0.0`), `@nestjs/common` `^11.0.0`, `@nestjs-pipeline/core` `^0.2.0`.
- Το `ZOD_SCHEMA`, το deprecated ψευδώνυμο, αφαιρέθηκε· χρησιμοποιήστε το `ZOD_SCHEMA_KEY`.
- Το `ZodValidationBehavior` εφαρμόζει το parsed output στο request αντί μόνο να επικυρώνει: κάνει parse με `safeParseAsync`, διαγράφει κλειδιά που αφαιρεί το schema και αναθέτει εξαναγκασμένες (coerced) και προεπιλεγμένες τιμές πριν από την εκτέλεση του handler. Ένα κορυφαίο output που δεν είναι απλό αντικείμενο απορρίπτεται με `TypeError`, όπως και ένα μη αντικειμενικό request με schema.
- Το `ZodPipe.transform()` επιστρέφει `Promise` και κάνει parse ασύγχρονα.

Προσθήκες:

- `createCommand`, `createQuery` και `createZodRequest`, με τα `InferInput`, `InferOutput` και τους τύπους κλάσεων.
- `updatable` και `updatableFieldsOf`: επισημάνετε ένα πεδίο command στο schema του, και το `createCommand()` παραθέτει τα επισημασμένα πεδία ως `updatableFields`.
- `createZodMapper`· `getRawInput`, `getValidatedData`, `ZOD_RAW_INPUT_KEY`, `ZOD_VALIDATED_DATA_KEY`.

#### `@nestjs-pipeline/casl` (από 0.1.1)

Breaking Changes:

- Peer dependencies: `@casl/ability` `^7.0.0` (ήταν `^6.0.0`), `@nestjs/common` `^11.0.0`, `@nestjs-pipeline/core` `^0.2.0`.
- Το API των providers αντικαθίσταται από μία ενιαία πηγή δικαιωμάτων (permission source). Αφαιρέθηκαν: `CASL_ROLE_PROVIDER`, `CASL_USER_CAPABILITY_PROVIDER`, `CASL_USER_CONTEXT_RESOLVER`, `CASL_USER_CONTEXT_KEY`, `CASL_SUBJECT_CONTEXT_PATHS`, `CASL_FIELDS_FROM_REQUEST`, `CASL_BEHAVIOR_LOGGER`, `IRoleProvider`, `IUserCapabilityProvider`, `IUserContextResolver`, `StaticRoleProvider`, `CaslUserContext`, `RoleDefinition`, `UserCapabilities`, `buildAbilityFromRules`, `capabilityToRawRule` και `capabilitiesToRawRules`. Υλοποιήστε το `ICaslPermissionSource`, του οποίου το `load()` επιστρέφει `{ principal, rules }` ή `null`, και καταχωρίστε το με `CaslModule.forRoot({ permissionSource })`.
- Το `buildAbility(roles, user, additional, denied)` γίνεται `buildAbility(rules, principal)`.
- Το `CaslBehaviorOptions` χάνει τα `subjectFromRequest`, `subjectContextPaths`, `fieldsFromRequest`, `skipCheck` και `prebuiltAbility`· το `rules` είναι υποχρεωτικό και μη κενό (το `requires()` το κατασκευάζει). Το `CaslBehavior` δεν δέχεται πλέον logger.
- Μια άρνηση πρόσβασης πετά `UnauthorizedActionException` (επεκτείνει το `Error`) αντί για το `ForbiddenException` του NestJS· καταχωρίστε το `UnauthorizedActionFilter` για απάντηση HTTP 403.
- Μια συνθήκη κανόνα της οποίας το placeholder επιλύεται σε αντικείμενο πετά σφάλμα, επειδή το CASL θα διάβαζε το αντικείμενο ως τελεστές ερωτήματος (query operators).

Προσθήκες: `requires()`, `CaslAuthorizer` (`can`, `authorize`, `project`), `UnauthorizedActionException` και `UnauthorizedActionFilter` (HTTP 403), `getCaslAbility`, `getCaslPrincipal`, `hasEntityConditions`, `CASL_PERMISSION_SOURCE`, `CASL_PRINCIPAL_KEY`, `CASL_BEHAVIOR_ID`, `CASL_ACTIONS`, `CASL_SUBJECTS` και οι τύποι τους.

### Πρώτες εκδόσεις

- `@nestjs-pipeline/audit`: καταγράφει κάθε ελεγμένο αίτημα, σε επιτυχία και αποτυχία, σε ένα `AuditSink` (console από προεπιλογή, Postgres ενσωματωμένο), με redaction των payloads. Μόνο τα commands ελέγχονται εκτός αν το `captureKinds` περιλαμβάνει queries ή events. Ένα sink που υλοποιεί το `begin` (όπως το Postgres sink) λαμβάνει μια εκκρεμή εγγραφή πριν από την εκτέλεση του handler, και στη συνέχεια την τελική εγγραφή υπό το ίδιο id, ώστε η διακοπή μιας διεργασίας να αφήνει μια γραμμή `pending` αντί για καμία. Με την προεπιλογή `failOpen: true`, μια αποτυχία του sink καταγράφεται στα logs και το αποτέλεσμα του αιτήματος διατηρείται. Με `failOpen: false`, μια αποτυχία του sink αποτυγχάνει ένα επιτυχές αίτημα· αν ο handler είχε ήδη αποτύχει, το δικό του σφάλμα επανεκπέμπεται αμετάβλητο και η αποτυχία του sink καταγράφεται στα logs.
- `@nestjs-pipeline/cache`: read-through caching για queries βασισμένο στα cache-manager 7 και Keyv. Το `key` είναι υποχρεωτικό: δεν υπάρχει προεπιλεγμένο κλειδί.
- `@nestjs-pipeline/deadletter`: συλλαμβάνει αποτυχημένα αιτήματα μέσω ενός `DeadLetterTransport` (ενσωματωμένα transports για BullMQ, RabbitMQ και Postgres)· events από προεπιλογή, commands και queries όταν αναφέρονται στο `captureKinds`. Το Postgres transport είναι ένα `DeadLetterStore`, και το `DeadLetterRedriver` επανεκτελεί μια αποθηκευμένη εγγραφή, μετρά τις αποτυχημένες προσπάθειες και την επιλύει· ένα redacted payload δεν επανεκτελείται χωρίς `rebuild`. Το `rethrow: false` αποσιωπά το σφάλμα ενός event handler μόνο, και συνιστά bootstrap σφάλμα σε έναν command ή query handler. Το RabbitMQ transport έχει δοκιμαστεί μόνο με mocked channel.
- `@nestjs-pipeline/feature-flags`: ελέγχει την πρόσβαση σε handlers μέσω του OpenFeature. Το `FeatureDisabledFilter` απαντά με HTTP 403, ή 404 με `{ status: 404 }` για απόκρυψη του feature. Το `allowedVariants` περιορίζει βάσει variant, και το `errorPolicy` (`'use-default'` ή `'throw'`) αποφασίζει τη συμπεριφορά σε σφάλμα παρόχου.
- `@nestjs-pipeline/idempotency`: αποτροπή ταυτόχρονων διπλότυπων εκτελέσεων και επανάληψη επιτυχών απαντήσεων, με stores για μνήμη (προεπιλογή), Redis και Postgres. Μια αποτυχημένη εκτέλεση απελευθερώνει το κλειδί της από προεπιλογή. Το Postgres store διατηρεί τις αποκρίσεις ως κείμενο JSON, ώστε κάθε απόκριση, συμπεριλαμβανομένης οποιασδήποτε με χαρακτήρες NUL ή μη συζευγμένα surrogates, να αναπαράγεται επακριβώς. Τα κλειδιά δέχονται τα `includeTenant` και `requireTenant` του core, και το `MissingIdempotencyPartitionError` επεκτείνει το `MissingPartitionError` του core.
- `@nestjs-pipeline/rate-limit`: rate limiting ανά command βασισμένο στο rate-limiter-flexible, εφαρμοζόμενο ανεξάρτητα από το πού αποστέλλεται το command, με φίλτρο HTTP 429. Το `keyFactory` είναι υποχρεωτικό: δεν υπάρχει προεπιλεγμένο bucket. Το `points` είναι σταθερό ή υπολογιζόμενο κόστος ανά command· το `0` δεν χρεώνει τίποτα.
- `@nestjs-pipeline/resilience`: resilience βασισμένο στο cockatiel, σε δύο μέρη. Ονοματισμένες πολιτικές για εξωτερικές εξαρτήσεις (retry, circuit breaker, timeout, bulkhead, fallback), δηλωμένες στο `ResilienceModule.forRoot({ policies })` ή `forRootAsync`, κατασκευασμένες και επικυρωμένες κατά την εκκίνηση, και κοινόχρηστες μέσω των `ResiliencePolicies` ή `@InjectResiliencePolicy(name)`. Το `ResilienceBehavior` εφαρμόζει retry, timeout και bulkhead γύρω από έναν ολόκληρο handler· η χρήση circuit breaker ή fallback εκεί συνιστά σφάλμα bootstrap. Τα retry, circuit breaker και fallback απαιτούν ένα κατηγόρημα (predicate) `handle` ή `handleAllErrors: true`.
- `@nestjs-pipeline/tenant`: το `runWithTenant()` ορίζει το τρέχον tenant και το `currentTenantId()` το διαβάζει· το `tenantSource` παραδίδει το ίδιο store στα `PipelineModule.forRoot({ sources })` και `JobContextModule.forRoot`. Δεν έχει εξαρτήσεις.
- `@nestjs-pipeline/job-context`: μεταφέρει το tenant, το correlation id και την ταυτότητα principal ενός αιτήματος στα queue jobs που προγραμματίζει (`withJobContext`, `@InJobContext`), επανελεγχόμενα μέσω ενός `IJobPrincipal` της εφαρμογής κατά την εκτέλεση του job, και παρέχει στις εργασίες συστήματος ρητό principal και δικαιώματα ανά tenant (`@AsSystem`). Διαβάζει και αποκαθιστά το tenant και correlation id μέσω των `sources` του `JobContextModule.forRoot` και δεν εξαρτάται από κανένα άλλο πακέτο pipeline.
- `@cqrs-ddd/core`: δομικά στοιχεία DDD ανεξάρτητα από framework (aggregates, domain events, `CommandBaseHandler`, συμβόλαια repository, decorators κύκλου ζωής persistence που αντιστοιχίζουν μοναδικές παραβιάσεις ανά ιδιότητα entity μέσω ενός pluggable persistence dialect (`IPersistenceDialect`, `setPersistenceDialect`), ένα revision-fenced repository cache (`CACHE_TOKEN`, με `MemoryCache` για μία διεργασία), κλειδιά cache με tenant scope, αντιστοίχιση καταστάσεων HTTP, και τους κανόνες τιμών `textRule` και `numberRule`, οι οποίοι πετούν `InvalidValueException` ή μια προσαρμοσμένη υποκλάση της εφαρμογής). Δεν εξαρτάται από κανένα framework: το `CommandBaseHandler` δέχεται οποιοδήποτε `IDomainEventPublisher`, οι decorators cache δέχονται έναν `logger`, και τα κλειδιά cache λαμβάνουν το tenant τους από έναν resolver που καταχωρίζει η εφαρμογή με το `setTenantResolver`. Δεν έχει peer dependencies και καμία εξάρτηση από ORM.
- `@cqrs-ddd/mikro-orm`: οι MikroORM 7 adapters του `@cqrs-ddd/core` — `AggregateRepository`, `optimisticUpdate`, `optimisticDelete`, `assertAutocommit`, `MikroOrmDialect` (διαβάζει τον παραβιασμένο μοναδικό περιορισμό από τα metadata του ORM, για PostgreSQL και SQLite), `mapPersistenceError` / `isTransientPersistenceError`, `MikroOrmCache` (με `CacheEntrySchema` και `createCacheTableSql` για τον πίνακά του), `TenantStore` (ο `EntityManager` του ενεργού tenant, με βάση δεδομένων ή schema ανά tenant) και `UnixTimestampType`, το οποίο πετά `TypeError` για μια τιμή χωρίς έγκυρο χρόνο. Τα `@cqrs-ddd/core` και `@mikro-orm/core` είναι απαιτούμενα peer dependencies.
- `@cqrs-ddd/uuidv7`: παραγωγή και επικύρωση UUIDv7 κατά RFC 9562, χωρίς εξαρτήσεις.
- `@cqrs-ddd/untyped`: `untyped(value)`, μια ασφαλής ως προς τους τύπους αντικατάσταση του `as any` που διαβάζει μη δηλωμένες ιδιότητες ως `unknown`· χωρίς εξαρτήσεις.
- `@cqrs-ddd/safe-stringify`: ένας αυστηρός, key-sorted serializer για ταυτότητες και ένας ασφαλής, redacting serializer για logs, με βοηθητικά εργαλεία τμημάτων κλειδιών (key segments)· χωρίς εξαρτήσεις. Το output του είναι παγωμένο (frozen), ώστε τα αποθηκευμένα κλειδιά cache να παραμένουν έγκυρα.
