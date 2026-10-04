---
title: "Αρχιτεκτονική runtime"
sidebar:
  order: 1
---

Η αρχιτεκτονική εκτέλεσης runtime συντονίζει τα εισερχόμενα HTTP αιτήματα σε τέσσερα επίπεδα Clean Architecture: το presentation edge, τους pipeline interceptors, τα μοντέλα CQRS application & DDD domain, και την έγκυρη multi-tenant persistence.

## Διαδραστικός χάρτης αρχιτεκτονικής

Ο παρακάτω χάρτης οπτικοποιεί τον κύκλο ζωής εκτέλεσης μιας mutation εντολής CQRS στα τέσσερα επίπεδα runtime, εμφανίζοντας τη σειρά των behaviors, τη διάδοση του context, το versioning του aggregate και την αναγνώριση persistence.

<iframe
  src="/nestjs-pipeline/architecture/runtime-architecture.html"
  title="NestJS Pipeline Runtime Architecture Map"
  style="width: 100%; height: 780px; border: 1px solid var(--sl-color-gray-5); border-radius: 8px; margin-top: 1rem; margin-bottom: 1.5rem;"
></iframe>

[Άνοιγμα διαδραστικού χάρτη σε πλήρη οθόνη &rarr;](/nestjs-pipeline/architecture/runtime-architecture.html)

## Επίπεδα Runtime

### 1. Presentation layer (API & ingress)

- **`TenantSchemaMiddleware`**: Επιλύει το αναγνωριστικό multi-tenant από τις κεφαλίδες του αιτήματος, το επικυρώνει έναντι των ρυθμίσεων persistence, και καθορίζει το search path του tenant (`TenantSchemaContext`) πριν τη διαχείριση της διαδρομής.
- **`AuthSessionGuard`**: Επικυρώνει τα cookies συνεδρίας (session cookies) και τα διαπιστευτήρια bearer μέσω του `RequestPrincipalResolver`, συνδέοντας τα `req.sessionPrincipal` και CASL ability attributes στο context του αιτήματος.
- **`UsersController`**: Επικυρώνει τα schemas των payloads με Zod (`CreateUserDtoSchema`), μεταφράζει την είσοδο σε `CreateUserCommand`, και την αποστέλλει μέσω του CQRS command bus.
- **`CommandBus`**: Αποστέλλει την εντολή στον pipeline runner που έχει συνδεθεί κατά το bootstrap της εφαρμογής.

### 2. Pipeline interceptor layer (cross-cutting onion)

- **`PipelineRunner`**: Συνδέεται κατά το bootstrap της εφαρμογής για να περικλείσει τις μεθόδους των handlers σε μια αλυσίδα delegates onion μέσα στο `AsyncLocalStorage` (`pipelineStore`). Αρχικοποιεί τα `tenantId` και `correlationId` στο `PipelineContext`.
- **`LoggingBehavior`**: Μετρά την καθυστέρηση εκτέλεσης, καταγράφει αιτήματα και αποκρίσεις, και αποκρύπτει ευαίσθητες ιδιότητες του payload χρησιμοποιώντας το `@cqrs-ddd/safe-stringify`.
- **`CaslBehavior`**: Επιβάλλει κανόνες εξουσιοδότησης επιπέδου τύπου (`requires({ action, subject })`) πριν εκτελεστεί η λογική του handler, αποτυγχάνοντας με fail-closed συμπεριφορά μέσω του `UnauthorizedActionException`.
- **`IdempotencyBehavior`**: Δεσμεύει ένα operation token στο Redis πριν την εκτέλεση. Σε αναπαραγωγή (replay), συγκρίνει το αποθηκευμένο `requireAbilityDigest` για να διασφαλίσει ότι ο καλών δεν έχει χάσει τα δικαιώματά του.

### 3. Application & domain layer (CQRS & DDD core)

- **`ICommandHandler` & `EventPublisher`**: Οι handlers υλοποιούν το `ICommandHandler<C, R>` του NestJS με τη μέθοδο `execute()`. Τα domain events γίνονται commit μέσω του `EventPublisher` του NestJS (`publisher.mergeObjectContext(aggregate).commit()`) μετά από ανθεκτική αποθήκευση στο repository.
- **`CreateUserHandler`**: Ενορχηστρώνει τη δημιουργία του aggregate (`User.create()`), αξιολογεί το post-mutation CASL authorization πεδίων (`authorizer.authorize()`), αναθέτει την αποθήκευση στο command repository, και υποβάλλει (commits) τα domain events.
- **`User` aggregate root**: Ενθυλακώνει τους επιχειρησιακούς κανόνες, εφαρμόζει το `UserCreatedEvent`, και παρακολουθεί τη γραμμή βάσης της αναμενόμενης έκδοσης (version). Τα setters παραμένουν private για ενυδάτωση (hydration) από το ORM.

### 4. Persistence & infrastructure layer (έγκυρη βάση δεδομένων & ουρές)

- **`@PersistedWrite`**: Επιβάλλει αυστηρή σειρά κύκλου ζωής γύρω από την αποθήκευση στο repository: `@Cache` (ακυρώνει δευτερεύοντα κλειδιά αναζήτησης) &rarr; `@AcknowledgePersisted` &rarr; `@MapPersistenceErrors`.
- **`CreateUserCommandRepository`**: Επαληθεύει το autocommit, αποθηκεύει το aggregate μέσω του tenant-scoped `EntityManager`, και καλεί το `user.acknowledgePersisted()` μόνο αφού η υποβολή (commit) στη βάση δεδομένων επιτύχει.
- **`UserCreatedHandler`**: Καταναλώνει το `UserCreatedEvent` υπό το `@UsePipeline(deadLetter())`, εισάγοντας στην ουρά το background job αποστολής email καλωσορίσματος.
- **`BullMQ Queue`**: Μεταφέρει ασύγχρονες εργασίες παρασκηνίου με υποστήριξη dead-letter στο Redis, διαδίδοντας τα metadata του `JobContext` (tenant, correlation ID και principal) πέρα από τα όρια των jobs.
