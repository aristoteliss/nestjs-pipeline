---
title: "Ένα παράδειγμα DDD"
---

Τα `packages/ddd-core` και το παράδειγμα `api` επιδεικνύουν το Domain-Driven Design με το `@nestjs-pipeline`.

## `packages/ddd-core` — framework-neutral υποστήριξη DDD <a id="packagesddd-core--framework-neutral-ddd-support"></a>

Το πακέτο `@cqrs-ddd/core` δεν έχει εξάρτηση από το NestJS και παρέχει τέσσερα ρητά entry points:

- `/domain` — δομικά στοιχεία για aggregates/events/errors·
- `/application` — βασικές CQRS κλάσεις και ports για repositories/cache·
- `/persistence` — decorators/adapters/helpers για persistence·
- `/http` — αντιστοίχιση HTTP status για τα δικά του σφάλματα.

Ο κώδικας του domain και του application επιπέδου θα πρέπει να χρησιμοποιεί τα συγκεκριμένα entry points αντί για το barrel της ρίζας συμβατότητας.

| Εξαγωγή | Επίπεδο | Περιγραφή |
|---|---|---|
| `RootEntity` | `/domain` | Αφηρημένη βασική οντότητα με ταυτότητα UUID v7, κύκλο ζωής `createdAt`/`updatedAt`, αντιστοιχίσεις accessor, και παρακολούθηση μεταβολών (mutations) |
| `RootEntitySnapshot` | `/domain` | Interface για σειριοποίηση/επανυδάτωση (rehydrating) οντοτήτων |
| `DomainException` | `/domain` | Αφηρημένη βασική κλάση για framework-agnostic εξαιρέσεις αμετάβλητων κανόνων domain |
| `DomainEvent` | `/domain` | Αφηρημένη βασική κλάση για domain events (φέρει ένα UUID v7 `id`) |
| `RootDomainEvent` | `/domain` | Domain event με αποσυνδεδεμένο αμετάβλητο payload και ID/version του aggregate κατά τον χρόνο του συμβάντος |
| `@ApplyMutation()` | `/domain` | Ολοκληρώνει μια μεταβολή domain: καλεί το `onUpdate()` και καταγράφει events από το αποτέλεσμα |
| `@Mutable()` | `/domain` | Δηλώνει ένα πεδίο του aggregate ως τροποποιήσιμο μέσω του `applyPatch(...)` |
| `CommandBaseHandler` | `/application` | Βασικός CQRS command handler που αποστέλλει (dispatches) και εκκαθαρίζει μη καταχωρημένα events |
| `ICommandRepository` | `/application` | Port για repositories εγγραφής (write repositories) |
| `IQueryRepository` | `/application` | Port για repositories ανάγνωσης (read repositories) |
| `ICache<T>` | `/application` | Interface για cache providers (`get`, `set`, `delete`) |
| `@Cache()` | `/persistence` | Decorator για το `save()` — write-through cache στις εγγραφές, evict στη διαγραφή, ρητά κλειδιά |
| `@FromCache()` | `/persistence` | Decorator για το `find()` — read-through cache με fail-closed σημασιολογία και επανυδάτωση (hydration) |

Οι adapters του MikroORM, όπως οι `AggregateRepository`, `MikroOrmCache` και `UnixTimestampType`,
βρίσκονται στο [`@cqrs-ddd/mikro-orm`](/nestjs-pipeline/packages/cqrs-ddd/mikro-orm/).

Κάντε import τα δομικά στοιχεία domain στο επίπεδο domain σας:

```typescript
import { ApplyMutation, DomainException, RootDomainEvent, RootEntity } from '@cqrs-ddd/core/domain';
```

## `api` — Πλήρης Λειτουργική Εφαρμογή <a id="api--full-working-application"></a>

Ο κατάλογος `api/` περιέχει μια πλήρη λειτουργική εφαρμογή:

```bash
cd api
pnpm install
pnpm build              # build workspace dependencies
cp .env.example .env    # create local environment file (edit as needed)
pnpm db:migrate         # apply schema + data migrations (idempotent)
pnpm dev                # build, then rebuild and restart on source changes
```

Ρυθμίστε τη βάση δεδομένων μέσω μεταβλητών περιβάλλοντος (προεπιλογή σε τοπικό αρχείο):

| Μεταβλητή | Προεπιλογή | Περιγραφή |
|---|---|---|
| `DATABASE_URL` | `file:src/persistence/local.db` | libSQL URL, χρησιμοποιείται αναλλοίωτο για έναν tenant |
| `SQLITE_TENANTS` | _(κανένα)_ | Πρόσθετα ονόματα libSQL tenants· τα τοπικά αρχεία λαμβάνουν επίθημα tenant |
| `SQLITE_DATABASE_TEMPLATE` | _(κανένα)_ | URL που περιέχει `{tenant}`· απαιτείται για πολλαπλούς απομακρυσμένους tenants |
| `AUTH_TOKEN` | _(κανένα)_ | Auth token για απομακρυσμένες libSQL βάσεις δεδομένων (π.χ. Turso) |

Το `DB_ENGINE=postgres` μεταβαίνει σε PostgreSQL με ένα schema ανά tenant· το
[api README](https://github.com/aristoteliss/nestjs-pipeline/blob/master/api/README.md) παραθέτει κάθε μεταβλητή.

Και οι δύο μηχανές persistence απαιτούν το `x-tenant-schema` στα δρομολογημένα αιτήματα HTTP.
Η PostgreSQL επιλέγει ένα schema· το libSQL επιλέγει την αντίστοιχη βάση δεδομένων.

**Λειτουργίες CRUD:**

```bash
# Log in as the seeded admin, then copy `accessToken` from the JSON response.
# The refresh token arrives as an HttpOnly cookie; POST /auths/refresh exchanges it.
curl -X POST http://localhost:3000/auths/login -c cookies.txt \
  -H 'Content-Type: application/json' \
  -H 'x-tenant-schema: tenant' \
  -d '{"email":"alice+tenant@seed.local","code":"secret-code"}'
export TOKEN='<accessToken from login response>'

# Create a user
curl -X POST http://localhost:3000/users \
  -H 'Content-Type: application/json' \
  -H 'x-tenant-schema: tenant' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'x-correlation-id: demo-123' \
  -d '{"name": "Aristotelis", "email": "aristotelis@example.com"}'

# Get all users
curl -X GET http://localhost:3000/users \
  -H 'x-tenant-schema: tenant' \
  -H "Authorization: Bearer $TOKEN"

# Get by ID
curl http://localhost:3000/users/<id> \
  -H 'x-tenant-schema: tenant' \
  -H "Authorization: Bearer $TOKEN"

# Update
curl -X PATCH http://localhost:3000/users/<id> \
  -H 'Content-Type: application/json' \
  -H 'x-tenant-schema: tenant' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "NewName"}'

# Delete a user
curl -X DELETE http://localhost:3000/users/<user-id> \
  -H 'x-tenant-schema: tenant' \
  -H "Authorization: Bearer $TOKEN"

# Run with Fastify adapter
ADAPTER=fastify pnpm start
```

**Τι επιδεικνύει:**

- Καθολικά (global) + ανά handler pipeline behaviors
- Αποσυνδεδεμένες αμετάβλητες domain με framework-agnostic `DomainException` & presentation-boundary `DomainExceptionFilter` (αντιστοίχιση σε 400, 409, 422)
- Όρια persistence repository κατά το Clean Architecture: οι CQRS handlers κάνουν inject αποκλειστικά τα `ICommandRepository` και `IQueryRepository`, πλήρως αποσυνδεδεμένα από κλάσεις ORM/database client (μηδενική διαρροή `MIKRO_ORM_CLIENT` στους handlers)
- Μόνιμη ανάκληση token κατά την αποσύνδεση μέσω του `RevokeAuthCommand`, φόρτωση δικαιωμάτων ανά αίτημα στο `CaslPermissionSource`, και ρητή κατηγοριοποίηση principal
- Αισιόδοξος έλεγχος ταυτοχρονισμού (optimistic concurrency) με παρακολούθηση έκδοσης aggregate στις οντότητες `User` και `Role`. Οι persistence adapters μεταφράζουν τα διαγνωστικά συγκρούσεων driver/ORM στο transport-neutral `ConcurrencyConflictError`· το φίλτρο HTTP presentation αντιστοιχίζει αυτό το σφάλμα σε `409 Conflict`.
- Injectable `CaslAuthorizer` σε CQRS command και query handlers: `authorize` πριν από εγγραφές, `project` για read models και απαντήσεις
- Δηλώσεις απαιτήσεων CASL ανά handler με το `requires(...)`
- Πηγή δικαιωμάτων CASL βασισμένη στο MikroORM (ρόλοι, δικαιώματα και απαγορεύσεις ανά χρήστη)
- Επίσημα MikroORM entity schemas με `accessor: true` που συνδέουν ιδιωτικά πεδία του aggregate με δημόσιους accessors χωρίς παρακάμψεις του TypeScript
- Αποσυνδεδεμένη αρχιτεκτονική CQRS caching με παραγωγή κλειδιών ασφαλή από συγκρούσεις (`cacheKey`), fail-fast πρότυπα handlers (`cacheKeyTemplate`), και στατική ονοματοδοσία aggregates (`User.aggregateName`)
- Versioned database migrations με καταγραφή (πίνακας `mikro_orm_migrations`)
- Commands και queries επικυρωμένα/αναλυμένα με Zod μέσω των `createCommand()` και `createQuery()` που εκθέτουν metadata του Standard Schema (`['~standard']`)
- Επικύρωση σχημάτων σε επίπεδο controller μέσω του προεπιλεγμένου `StandardSchemaValidationPipe` του Nest
- Zod transform mappers (αντιστοίχιση DTO → Command)
- OpenTelemetry tracing με το `TraceBehavior` και metrics με το `MetricsBehavior`
- Command- και event-scoped `DeadLetterBehavior` που αποστέλλει αποτυχημένες εκτελέσεις σε ουρά BullMQ `dead-letters` για έλεγχο και επανάληψη (περιορισμένο σε αποτυχίες μεταβολής commands και events, εξαιρώντας queries ανάγνωσης και σφάλματα validation, με το `UserCreatedHandler` να επιλέγει `{ rethrow: false }` μόνο μετά από επιτυχή παράδοση)· οι αποτυχίες transport καταγράφονται και διατηρούν το αρχικό σφάλμα του handler
- Ανά handler `RateLimitBehavior` που περιορίζει το `CreateUserHandler` σε 5 εγγραφές / 60s ανά email (in-memory limiter), με το `ErrorFilter` να αντιστοιχίζει τις υπερβάσεις σε HTTP 429 + `Retry-After`
- Ανά handler `AuditBehavior` που καταγράφει την ευαίσθητη ενέργεια `user.delete` (actor, αποτέλεσμα, διάρκεια, redacted payload) στο προεπιλεγμένο `LogAuditSink`, με τον actor να επιλύεται από το ασύγχρονο session context
- Ανά handler `IdempotencyBehavior` που αποκλείει ατομικά ταυτόχρονα αντίγραφα για το `CreateUserHandler` ανά tenant + principal + email και αναπαράγει ολοκληρωμένες επιτυχείς απαντήσεις· με την προεπιλογή `releaseOnError: true`, μια αποτυχημένη εκτέλεση αποδεσμεύει το κλειδί ώστε μια μετέπειτα επανάληψη να μπορέσει να εκτελεστεί ξανά. Το `ErrorFilter` αντιστοιχίζει αντίγραφα εν εξελίξει σε HTTP 409 και την επαναχρησιμοποίηση κλειδιού με μη συμβατό payload σε HTTP 422
- Οντότητες `User` και `Role` σε στυλ DDD δομημένες πάνω στα primitives του `ddd-core` (`RootEntity`, `RootDomainEvent`)
- Persistence με MikroORM (libSQL και PostgreSQL drivers) με απομόνωση βάσης δεδομένων/σχήματος ανά multi-tenant
- Συνδέσιμο `ICache<T>` — `MikroOrmCache` (βασισμένο στο MikroORM, με επίγνωση TTL) ή `MemoryCache` εναλλάξιμο μέσω ενός ενιαίου provider token
- Διάδοση του Correlation ID σε HTTP middleware, handlers, processors, και events
- Υποστήριξη Express και Fastify adapters με ασφαλές session cookie και Bearer/API-key αυθεντικοποίηση
