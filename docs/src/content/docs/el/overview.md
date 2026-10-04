---
title: "Επισκόπηση"
---

Pipeline behaviors για το **NestJS CQRS** — τυλίξτε κάθε command, query και event handler με επαναχρησιμοποιήσιμα cross-cutting concerns (logging, validation, tracing, audit, idempotency, caching, rate limiting και resilience) χρησιμοποιώντας μια καθαρή, ντετερμινιστική αλυσίδα pipeline.

```
HTTP Request / Queue Job
  → Presentation / Controller (route parameters, schema validation)
  → CommandBus / QueryBus / EventBus (επίσημο @nestjs/cqrs)
  → Pipeline Runner:
      [global before] → [@UsePipeline handler behaviors] → [global after] → handler.execute()
```

Για τον πλήρη διαδραστικό χάρτη και στα τέσσερα επίπεδα Clean Architecture με clickable συνδέσμους στον πηγαίο κώδικα, δείτε την [Αρχιτεκτονική runtime](/nestjs-pipeline/concepts/architecture/).

## Βασικό Αρχιτεκτονικό Μοντέλο

Οι εφαρμογές NestJS CQRS (`@nestjs/cqrs`) διαχειρίζονται τους handlers, το dependency injection και την αποστολή μέσω των buses. Το pipeline ενισχύει αυτούς τους handlers με ντετερμινιστικά cross-cutting behaviors χωρίς να αντικαθιστά τα θεμέλια του NestJS CQRS:

1. **Επίσημο NestJS CQRS στον πυρήνα**: Τα `CommandBus`, `QueryBus`, `EventBus`, `@CommandHandler`, `@QueryHandler`, `@EventsHandler` και `EventPublisher` εκτελούν τις τυπικές ροές εργασίας του NestJS.
2. **Behaviors ανεξάρτητα από framework**: Τα behaviors (`@cqrs-ddd/pipeline-*`) είναι αποσυνδεδεμένα από το NestJS και υλοποιούνται ως καθαρές κλάσεις που ικανοποιούν το `IPipelineBehavior`.
3. **Singleton DI provider registration**: Κάθε instance ενός behavior δηλώνεται στο δικό του feature module ως κανονικός NestJS singleton provider με token την κλάση του (π.χ. `provide: IdempotencyBehavior, useFactory: ...`).
4. **Δηλωτική σύνθεση pipeline**: Οι handlers δηλώνουν τοπικά behaviors και επιλογές μέσω των decorators `@UsePipeline(...)` και `@SkipPipeline(...)`.
5. **Fail-fast bootstrap**: Κατά την εκκίνηση της εφαρμογής, το `PipelineBootstrap` (από το `@cqrs-ddd/nestjs`) εντοπίζει τους handlers μέσω του `DiscoveryService`, επαληθεύει ότι οι εξαρτήσεις των handlers είναι αυστηρά στατικές (singleton scope), επικυρώνει τους κανόνες σειράς (π.χ. CASL authorization πριν από το response caching), και τυλίγει το `execute()` ή `handle()` μία φορά.
6. **Ενιαίο όριο σφαλμάτων και context**: Το `@cqrs-ddd/nestjs` παρέχει το `ErrorFilter` (αντιστοιχίζοντας domain και pipeline σφάλματα σε τυπικές απαντήσεις HTTP του NestJS), το `CorrelationMiddleware` και το `JobContextModule`.

> **Υπερίσχυση ίδιας κλάσης:** Εάν το `@UsePipeline` ενός handler δηλώνει την ίδια κλάση behavior με μια καθολική καταχώριση `before` ή `after`, το behavior εκτελείται **μία φορά στη θέση της καθολικής αλυσίδας**, χρησιμοποιώντας τις επιλογές του handler. Η διατήρηση της θέσης διασφαλίζει ότι οι καθολικοί έλεγχοι ασφαλείας παραμένουν έξω από behaviors όπως το cache ή το idempotency που μπορούν να επιστρέψουν αποτέλεσμα χωρίς να καλέσουν το `next()`.
>
> **Απαίτηση security context:** Οι καθολικοί έλεγχοι τύπου δεν αντικαθιστούν τους ελέγχους οντοτήτων ή το φιλτράρισμα πεδίων που εκτελούνται μέσα σε έναν handler. Επειδή μια επιτυχία σε cache ή idempotency παρακάμπτει τον handler, τα κλειδιά τους πρέπει να περιλαμβάνουν tenant, principal και εύρος δικαιωμάτων όποτε τα αποτελέσματα εξαρτώνται από αυτούς τους ελέγχους. Η εκτέλεση αποτυγχάνει με ασφάλεια (fail-closed) όταν απουσιάζει το απαιτούμενο security context.

## Πακέτα

### Ενσωμάτωση & Adapter για NestJS

| Πακέτο | Περιγραφή |
|---|---|
| [`@cqrs-ddd/nestjs`](/nestjs-pipeline/packages/cqrs-ddd/nestjs/) | Επίσημος NestJS adapter — `PipelineModule.forRoot()`, `PipelineBootstrap`, `ErrorFilter`, `CorrelationMiddleware`, και `JobContextModule` |
| `@nestjs-pipeline/cqrs-ddd` | Πακέτο πρόσοψης (facade) που επανεξάγει το `@cqrs-ddd/nestjs` για ομαλή μετάβαση |

### Μηχανή Pipeline & Behaviors

| Πακέτο | Περιγραφή |
|---|---|
| [`@cqrs-ddd/pipeline`](/nestjs-pipeline/packages/nestjs-pipeline/core/) | Κεντρική μηχανή του pipeline — `@UsePipeline`, `@SkipPipeline`, plan compilation, έλεγχοι συμβολαίου behaviors, `LoggingBehavior`, και `logging()` builder |
| [`@cqrs-ddd/pipeline-idempotency`](/nestjs-pipeline/packages/nestjs-pipeline/idempotency/) | Behavior idempotency — ατομικός αποκλεισμός ταυτόχρονων αντιγράφων και επανάληψη επιτυχούς απάντησης ανά κλειδί με αποτύπωμα payload· υποστηρίζει in-memory, Redis, και Postgres stores |
| [`@cqrs-ddd/pipeline-cache`](/nestjs-pipeline/packages/nestjs-pipeline/cache/) | Read-through caching αποτελεσμάτων query — εναλλάξιμα stores (memory, Redis, Memcached, SQLite, Postgres) μέσω cache-manager v7 και Keyv |
| [`@cqrs-ddd/pipeline-casl`](/nestjs-pipeline/packages/nestjs-pipeline/casl/) | Εξουσιοδότηση CASL — `CaslBehavior` σε επίπεδο τύπου με πηγή δικαιωμάτων της εφαρμογής, καθώς και `CaslAuthorizer` (`can`, `authorize`, `project`) και `abilityDigest` |
| [`@cqrs-ddd/pipeline-audit`](/nestjs-pipeline/packages/nestjs-pipeline/audit/) | Λειτουργικό audit logging — καταγράφει καλών, ενέργεια, διάρκεια, metadata payload και αποτέλεσμα σε ένα συνδέσιμο `AuditSink` (log sink προεπιλογή, Postgres drop-in) |
| [`@cqrs-ddd/pipeline-rate-limit`](/nestjs-pipeline/packages/nestjs-pipeline/rate-limit/) | Behavior ορίων ρυθμού (rate limiting) — quotas ανεξάρτητα από backend μέσω rate-limiter-flexible (memory, Redis/Valkey, Mongo, Postgres, MySQL) και μετάφραση σε HTTP 429 |
| [`@cqrs-ddd/pipeline-resilience`](/nestjs-pipeline/packages/nestjs-pipeline/resilience/) | Πολιτικές resilience μέσω cockatiel — retry σε επίπεδο handler, circuit breaker, timeout, bulkhead, και fallback με συμβάντα τηλεμετρίας |
| [`@cqrs-ddd/pipeline-deadletter`](/nestjs-pipeline/packages/nestjs-pipeline/deadletter/) | Καταγραφή dead-letter για αποτυχημένα commands και events — ενσωματωμένα transports για BullMQ, RabbitMQ, και Postgres με υποστήριξη redrive |
| [`@cqrs-ddd/pipeline-feature-flags`](/nestjs-pipeline/packages/nestjs-pipeline/feature-flags/) | Διαχείριση feature flags — τυπικός evaluation client μέσω OpenFeature (in-memory, Unleash, Flagsmith, LaunchDarkly) |
| [`@cqrs-ddd/pipeline-opentelemetry`](/nestjs-pipeline/packages/nestjs-pipeline/opentelemetry/) | Tracing και metrics μέσω OpenTelemetry — κύκλος ζωής spans (`TraceBehavior`), μετρητές throughput/σφαλμάτων (`MetricsBehavior`), και `AttributesBehavior` |
| [`@cqrs-ddd/pipeline-zod`](/nestjs-pipeline/packages/nestjs-pipeline/zod/) | Validation μέσω σχημάτων Zod — `ZodValidationBehavior` που ελέγχει και εφαρμόζει τα επικυρωμένα δεδομένα σε commands/queries |
| [`@cqrs-ddd/pipeline-tenant`](/nestjs-pipeline/packages/nestjs-pipeline/tenant/) | Απομόνωση multi-tenant — `currentTenantId()`, `runWithTenant()`, και διάδοση context μέσω `tenantSource` |
| [`@cqrs-ddd/pipeline-correlation`](/nestjs-pipeline/packages/nestjs-pipeline/correlation/) | Διάδοση request correlation ID — `getCorrelationId()`, `runWithCorrelationId()`, `@WithCorrelation`, και `correlationSource` |
| [`@cqrs-ddd/pipeline-job-context`](/nestjs-pipeline/packages/nestjs-pipeline/job-context/) | Διάδοση context σε ουρές εργασιών — μεταφέρει tenant, correlation ID, και principal σε background jobs (`withJobContext`, `@InJobContext`, `@AsSystem`) |

### Δομικά Στοιχεία DDD χωρίς Framework

| Πακέτο | Περιγραφή |
|---|---|
| [`@cqrs-ddd/core`](/nestjs-pipeline/packages/cqrs-ddd/core/) | Δομικά στοιχεία DDD — aggregates με versioned mutations, αποσυνδεδεμένα domain events, `CommandBaseHandler`, συμβόλαια repositories, ORM-neutral decorators κύκλου ζωής persistence (`@PersistedWrite`), repository caching (`@FromCache`), και tenant-scoped κλειδιά |
| [`@cqrs-ddd/mikro-orm`](/nestjs-pipeline/packages/cqrs-ddd/mikro-orm/) | MikroORM 7 adapters για το `@cqrs-ddd/core` — `AggregateRepository`, version-conditioned εγγραφές (`optimisticUpdate`), `MikroOrmCache`, και δρομολόγηση multi-tenant σχημάτων |
| [`@cqrs-ddd/uuidv7`](/nestjs-pipeline/packages/cqrs-ddd/uuidv7/) | Παραγωγή και επαλήθευση UUIDv7 κατά RFC 9562 (μηδενικές εξαρτήσεις) |
| [`@cqrs-ddd/safe-stringify`](/nestjs-pipeline/packages/cqrs-ddd/safe-stringify/) | Key-sorted serializer για ταυτότητες cache/idempotency και redacting serializer για δομημένα logs (μηδενικές εξαρτήσεις) |
| [`@cqrs-ddd/untyped`](/nestjs-pipeline/packages/cqrs-ddd/untyped/) | Type-safe αντικατάσταση του `as any` που διαβάζει μη δηλωμένες ιδιότητες ως `unknown` (μηδενικές εξαρτήσεις) |

## Εμβέλεια Βιβλιοθήκης και Συμβόλαια

Τα πακέτα αποτελούν επαναχρησιμοποιήσιμες βιβλιοθήκες σχεδιασμένες για εξωτερικές εφαρμογές παραγωγής. Το παράδειγμα `api` επιδεικνύει την ενορχήστρωσή τους από άκρο σε άκρο, αλλά δεν περιορίζει τα δημόσια συμβόλαιά τους.

Το caching στιγμιοτύπων repository (`@FromCache`, `@Cache`) και το caching αποτελεσμάτων query στο pipeline (`CacheBehavior`) είναι συμπληρωματικά:
- Ο persistence adapter έχει την ευθύνη για τα snapshots των οντοτήτων και την ακύρωσή τους, επειδή γνωρίζει τις εγγραφές των aggregates.
- Το application pipeline έχει την ευθύνη για τα συντιθέμενα αποτελέσματα των queries, επειδή γνωρίζει τις απαιτήσεις φρεσκάδας, τα security scopes και τα όρια εξουσιοδότησης.

Δείτε την [Αρχιτεκτονική runtime](/nestjs-pipeline/concepts/architecture/) για τον διαδραστικό αρχιτεκτονικό χάρτη και τα [Πρώτα βήματα](/nestjs-pipeline/el/getting-started/) για οδηγίες εγκατάστασης.
